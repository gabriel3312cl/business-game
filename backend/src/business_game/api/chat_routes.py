from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.api.dependencies import get_current_user, get_game_service
from business_game.application.chat import ChatRateLimitError, GameChatService
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.chat_models import (
    ChatHistoryResponse,
    ChatMessage,
    ChatMessageCreate,
)
from business_game.domain.models import User
from business_game.infrastructure.chat_repository import ChatRepository
from business_game.infrastructure.database import get_session
from business_game.realtime import chat_rate_limiter, deliver_chat_message

router = APIRouter(prefix="/api/v1/games", tags=["chat"])


@router.get("/{game_id}/chat", response_model=ChatHistoryResponse)
async def get_chat_history(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
    before_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int | None, Query(ge=1, le=200)] = None,
) -> ChatHistoryResponse:
    # `get` already rejects anyone who is neither a player nor a spectator.
    await games.get(game_id, current_user.id)
    service = GameChatService(
        ChatRepository(session),
        history_limit=settings.chat_history_limit,
    )
    messages, has_more = await service.history(
        game_id,
        limit=limit or settings.chat_history_page_size,
        before_id=before_id,
    )
    return ChatHistoryResponse(messages=messages, has_more=has_more)


@router.post(
    "/{game_id}/chat",
    response_model=ChatMessage,
    status_code=status.HTTP_201_CREATED,
)
async def post_chat_message(
    game_id: UUID,
    data: ChatMessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> ChatMessage:
    """Fallback for clients whose socket is down; the socket path is preferred."""
    try:
        await chat_rate_limiter.require_capacity(current_user.id)
    except ChatRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    game = await games.get(game_id, current_user.id)
    service = GameChatService(
        ChatRepository(session),
        history_limit=settings.chat_history_limit,
    )
    message = await service.publish_player_message(game, current_user.id, data.body)
    await session.commit()
    await deliver_chat_message(game, current_user.id, message)
    return message
