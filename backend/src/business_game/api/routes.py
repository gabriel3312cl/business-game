import hashlib
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from business_game.api.dependencies import (
    get_current_user,
    get_game_service,
    get_pack_resolver,
    get_session_service,
    get_user_service,
)
from business_game.application.board_service import PackResolver
from business_game.application.game_views import game_state_view
from business_game.application.negotiation import NegotiationEngine
from business_game.application.rate_limit import SharedRateLimiter
from business_game.application.services import GameService, SessionService, UserService
from business_game.config import settings
from business_game.domain.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from business_game.domain.models import (
    AddBotRequest,
    BoardHistoricalStats,
    ContentPack,
    CreateGameRequest,
    GameCommandRequest,
    GameStateView,
    PackManifest,
    TokenResponse,
    TradeAnalysisResponse,
    TradeStatus,
    UpdateGameSettingsRequest,
    User,
    UserCreate,
    UserPreferences,
    UserPreferencesUpdate,
    UserUpdate,
)
from business_game.realtime import (
    broadcast_game_state,
    revoke_game_membership,
    sync_auction_timer,
    sync_bot_runner,
)
from business_game.security import create_access_token

router = APIRouter(prefix="/api/v1")
auth_rate_limiter = SharedRateLimiter(settings.redis_url, namespace="auth")
security_logger = logging.getLogger("business_game.security")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/packs", response_model=list[PackManifest])
async def list_packs(
    packs: Annotated[PackResolver, Depends(get_pack_resolver)],
) -> list[PackManifest]:
    return await packs.list()


@router.get("/packs/{pack_id}", response_model=ContentPack)
async def get_pack(
    pack_id: str,
    packs: Annotated[PackResolver, Depends(get_pack_resolver)],
    locale: Annotated[str | None, Query()] = None,
    version: Annotated[str | None, Query(pattern=r"^\d+\.\d+\.\d+$")] = None,
) -> ContentPack:
    return await packs.load(pack_id, locale=locale, version=version)


@router.post(
    "/auth/register",
    response_model=User,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    request: Request,
    data: UserCreate,
    users: Annotated[UserService, Depends(get_user_service)],
) -> User:
    await auth_rate_limiter.require_capacity(
        f"register:ip:{_client_ip(request)}",
        limit=settings.auth_registrations_per_minute,
    )
    return await users.register(data)


@router.post("/auth/token", response_model=TokenResponse)
async def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    users: Annotated[UserService, Depends(get_user_service)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> TokenResponse:
    client_ip = _client_ip(request)
    normalized_email = form.username.strip().lower()
    account_hash = _audit_hash(normalized_email)
    try:
        await auth_rate_limiter.require_capacity(
            f"login:ip:{client_ip}",
            limit=settings.auth_login_attempts_per_minute,
        )
        await auth_rate_limiter.require_capacity(
            f"login:account:{normalized_email}",
            limit=settings.auth_login_attempts_per_minute,
        )
        user = await users.authenticate(form.username, form.password)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            security_logger.warning(
                "security_event=auth_login_rate_limited source_ip=%s account_hash=%s",
                client_ip,
                account_hash,
            )
        raise
    except UnauthorizedError:
        security_logger.warning(
            "security_event=auth_login_failed source_ip=%s account_hash=%s",
            client_ip,
            account_hash,
        )
        raise
    session_token = await sessions.create(user.id)
    _set_session_cookie(response, session_token)
    security_logger.info(
        "security_event=auth_login_succeeded source_ip=%s user_id=%s",
        client_ip,
        user.id,
    )
    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_session(
    request: Request,
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> TokenResponse:
    session_token = request.cookies.get(settings.session_cookie_name)
    if not session_token:
        security_logger.warning(
            "security_event=auth_refresh_failed source_ip=%s reason=missing_session",
            _client_ip(request),
        )
        raise UnauthorizedError("persistent session is required")
    try:
        user = await sessions.resolve(session_token)
    except UnauthorizedError:
        security_logger.warning(
            "security_event=auth_refresh_failed source_ip=%s reason=invalid_session",
            _client_ip(request),
        )
        raise
    security_logger.info(
        "security_event=auth_refresh_succeeded source_ip=%s user_id=%s",
        _client_ip(request),
        user.id,
    )
    return TokenResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> Response:
    session_token = request.cookies.get(settings.session_cookie_name)
    if session_token:
        await sessions.revoke(session_token)
    security_logger.info(
        "security_event=auth_logout source_ip=%s session_present=%s",
        _client_ip(request),
        session_token is not None,
    )
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.environment == "production",
        httponly=True,
        samesite="strict",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/auth/me", response_model=User)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.patch("/users/me", response_model=User)
async def update_me(
    data: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    users: Annotated[UserService, Depends(get_user_service)],
) -> User:
    return await users.update(current_user.id, data)


@router.get("/users/me/preferences", response_model=UserPreferences)
async def get_my_preferences(
    current_user: Annotated[User, Depends(get_current_user)],
    users: Annotated[UserService, Depends(get_user_service)],
) -> UserPreferences:
    return await users.get_preferences(current_user.id)


@router.patch("/users/me/preferences", response_model=UserPreferences)
async def update_my_preferences(
    data: UserPreferencesUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    users: Annotated[UserService, Depends(get_user_service)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> UserPreferences:
    preferences = await users.update_preferences(current_user.id, data)
    if data.token_appearance is not None:
        updated_games = await games.sync_player_token_appearance(
            current_user.id,
            data.token_appearance,
        )
        for game in updated_games:
            await broadcast_game_state(game, complete_events=False)
    return preferences


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: Annotated[User, Depends(get_current_user)],
    users: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    await users.deactivate(current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/games", response_model=GameStateView, status_code=status.HTTP_201_CREATED)
async def create_game(
    data: CreateGameRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.create(
        data.pack_id,
        current_user,
        data.version,
        data.deck_collection_ids,
        data.economic_difficulty,
        data.advanced_economy_enabled,
    )
    return game_state_view(game, current_user.id)


@router.get("/games/me/active", response_model=list[GameStateView])
async def list_active_games(
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> list[GameStateView]:
    return [
        game_state_view(game, current_user.id, complete_events=False)
        for game in await games.list_active(current_user.id)
    ]


@router.get("/games/{game_id}", response_model=GameStateView)
async def get_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.get(game_id, current_user.id)
    return game_state_view(game, current_user.id)


@router.get(
    "/games/{game_id}/board-history",
    response_model=BoardHistoricalStats,
)
async def get_board_history(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> BoardHistoricalStats:
    return await games.board_history(game_id, current_user.id)


@router.get(
    "/games/{game_id}/trades/{trade_id}/analysis",
    response_model=TradeAnalysisResponse,
)
async def analyze_trade(
    game_id: UUID,
    trade_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
    packs: Annotated[PackResolver, Depends(get_pack_resolver)],
) -> TradeAnalysisResponse:
    game = await games.get(game_id, current_user.id)
    actor = next(
        (player for player in game.players if player.user_id == current_user.id),
        None,
    )
    if actor is None:
        raise ForbiddenError("trade analysis is only available to players")
    trade = next((item for item in game.trades if item.id == trade_id), None)
    if trade is None or current_user.id not in {trade.proposer_id, trade.recipient_id}:
        raise NotFoundError("trade not found")
    if trade.status is not TradeStatus.PENDING:
        raise ConflictError("only pending trades can be analyzed")
    pack = await packs.load(
        game.pack_id,
        locale=current_user.locale,
        version=game.pack_version,
    )
    return NegotiationEngine(game, pack).analyze_trade(actor, trade)


@router.post("/games/{game_id}/players", response_model=GameStateView)
async def join_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.join(game_id, current_user)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.post(
    "/games/{game_id}/bots",
    response_model=GameStateView,
    status_code=status.HTTP_201_CREATED,
)
async def add_bot(
    game_id: UUID,
    data: AddBotRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.add_bot(game_id, current_user.id, data)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.post(
    "/games/{game_id}/bots/fill",
    response_model=GameStateView,
    status_code=status.HTTP_201_CREATED,
)
async def fill_with_random_bots(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.fill_with_random_bots(game_id, current_user.id)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.delete("/games/{game_id}/bots/{bot_id}", response_model=GameStateView)
async def remove_bot(
    game_id: UUID,
    bot_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.remove_bot(game_id, current_user.id, bot_id)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        path="/",
        secure=settings.environment == "production",
        httponly=True,
        samesite="strict",
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _audit_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


@router.post("/games/{game_id}/spectators", response_model=GameStateView)
async def watch_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.watch(game_id, current_user)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.patch("/games/{game_id}/settings", response_model=GameStateView)
async def update_game_settings(
    game_id: UUID,
    data: UpdateGameSettingsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.update_settings(game_id, current_user.id, data)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.delete("/games/{game_id}/members/me", response_model=GameStateView)
async def leave_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.leave(game_id, current_user.id)
    sync_auction_timer(game)
    sync_bot_runner(game)
    await revoke_game_membership(game_id, current_user.id)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.post("/games/{game_id}/start", response_model=GameStateView)
async def start_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.start(game_id, current_user.id)
    sync_bot_runner(game)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id)


@router.post("/games/{game_id}/commands", response_model=GameStateView)
async def execute_command(
    game_id: UUID,
    data: GameCommandRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameStateView:
    game = await games.execute(
        game_id,
        current_user.id,
        data.command,
        expected_sequence=data.expected_sequence,
        command_id=data.command_id,
    )
    sync_auction_timer(game)
    sync_bot_runner(game)
    await broadcast_game_state(game, complete_events=False)
    return game_state_view(game, current_user.id, complete_events=False)
