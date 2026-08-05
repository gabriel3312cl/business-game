import asyncio
from collections import defaultdict, deque
from time import monotonic
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.api.dependencies import (
    get_current_user,
    get_game_service,
    get_pack_resolver,
)
from business_game.application.advisor import AdvisorService, AdvisorUnavailableError
from business_game.application.board_service import PackResolver
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.advisor_models import (
    AdvisorHistoryResponse,
    AdvisorRequest,
    AdvisorResponse,
)
from business_game.domain.errors import ForbiddenError
from business_game.domain.models import GameState, User
from business_game.infrastructure.advisor_repository import AdvisorChatRepository
from business_game.infrastructure.database import get_session

router = APIRouter(prefix="/api/v1/games", tags=["advisor"])


class AdvisorRateLimiter:
    def __init__(self, requests_per_minute: int) -> None:
        self._limit = requests_per_minute
        self._requests: dict[UUID, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def require_capacity(self, user_id: UUID) -> None:
        now = monotonic()
        cutoff = now - 60
        async with self._lock:
            timestamps = self._requests[user_id]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self._limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="too many advisor requests; try again shortly",
                )
            timestamps.append(now)


rate_limiter = AdvisorRateLimiter(settings.advisor_requests_per_minute)


def get_advisor_service() -> AdvisorService:
    return AdvisorService(
        api_key=settings.deepseek_api_key.get_secret_value(),
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        timeout_seconds=settings.deepseek_timeout_seconds,
        thinking_enabled=settings.deepseek_thinking_enabled,
        max_tokens=settings.deepseek_max_tokens,
        temperature=settings.deepseek_temperature,
    )


def _require_participant(game: GameState, user_id: UUID) -> None:
    if not any(player.user_id == user_id for player in game.players):
        raise ForbiddenError("the advisor is only available to game participants")


@router.get("/{game_id}/advisor/history", response_model=AdvisorHistoryResponse)
async def get_advisor_history(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> AdvisorHistoryResponse:
    game = await games.get(game_id, current_user.id)
    _require_participant(game, current_user.id)
    messages = await AdvisorChatRepository(session).list_messages(
        game_id,
        current_user.id,
        limit=settings.advisor_history_limit,
    )
    return AdvisorHistoryResponse(messages=messages)


@router.post("/{game_id}/advisor", response_model=AdvisorResponse)
async def ask_advisor(
    game_id: UUID,
    data: AdvisorRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
    packs: Annotated[PackResolver, Depends(get_pack_resolver)],
    advisor: Annotated[AdvisorService, Depends(get_advisor_service)],
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> AdvisorResponse:
    game = await games.get(game_id, current_user.id)
    _require_participant(game, current_user.id)
    await rate_limiter.require_capacity(current_user.id)
    pack = await packs.load(
        game.pack_id,
        locale=current_user.locale,
        version=game.pack_version,
    )
    repository = AdvisorChatRepository(session)
    history = await repository.context_messages(
        game_id,
        current_user.id,
        limit=settings.advisor_context_messages,
    )
    try:
        response = await advisor.advise(
            game,
            pack,
            current_user.id,
            data,
            current_user.locale,
            history,
        )
    except AdvisorUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    await repository.append_exchange(
        game_id=game_id,
        user_id=current_user.id,
        question=data.question,
        answer=response.answer,
        snapshot_sequence=response.snapshot_sequence,
    )
    await session.commit()
    return response
