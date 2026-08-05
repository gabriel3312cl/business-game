from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from business_game.api.dependencies import (
    get_current_user,
    get_game_service,
    get_pack_resolver,
    get_session_service,
    get_user_service,
)
from business_game.application.board_service import PackResolver
from business_game.application.services import GameService, SessionService, UserService
from business_game.config import settings
from business_game.domain.errors import UnauthorizedError
from business_game.domain.models import (
    AddBotRequest,
    ContentPack,
    CreateGameRequest,
    GameCommand,
    GameState,
    PackManifest,
    TokenResponse,
    UpdateGameSettingsRequest,
    User,
    UserCreate,
    UserUpdate,
)
from business_game.realtime import sio, sync_auction_timer, sync_bot_runner
from business_game.security import create_access_token

router = APIRouter(prefix="/api/v1")


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
    data: UserCreate,
    users: Annotated[UserService, Depends(get_user_service)],
) -> User:
    return await users.register(data)


@router.post("/auth/token", response_model=TokenResponse)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    users: Annotated[UserService, Depends(get_user_service)],
    sessions: Annotated[SessionService, Depends(get_session_service)],
) -> TokenResponse:
    user = await users.authenticate(form.username, form.password)
    session_token = await sessions.create(user.id)
    _set_session_cookie(response, session_token)
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
        raise UnauthorizedError("persistent session is required")
    user = await sessions.resolve(session_token)
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


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: Annotated[User, Depends(get_current_user)],
    users: Annotated[UserService, Depends(get_user_service)],
) -> Response:
    await users.deactivate(current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/games", response_model=GameState, status_code=status.HTTP_201_CREATED)
async def create_game(
    data: CreateGameRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await games.create(data.pack_id, current_user, data.version)


@router.get("/games/me/active", response_model=list[GameState])
async def list_active_games(
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> list[GameState]:
    return await games.list_active(current_user.id)


@router.get("/games/{game_id}", response_model=GameState)
async def get_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await games.get(game_id, current_user.id)


@router.post("/games/{game_id}/players", response_model=GameState)
async def join_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.join(game_id, current_user)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.post(
    "/games/{game_id}/bots",
    response_model=GameState,
    status_code=status.HTTP_201_CREATED,
)
async def add_bot(
    game_id: UUID,
    data: AddBotRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.add_bot(game_id, current_user.id, data)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.delete("/games/{game_id}/bots/{bot_id}", response_model=GameState)
async def remove_bot(
    game_id: UUID,
    bot_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.remove_bot(game_id, current_user.id, bot_id)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


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


@router.post("/games/{game_id}/spectators", response_model=GameState)
async def watch_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.watch(game_id, current_user)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.patch("/games/{game_id}/settings", response_model=GameState)
async def update_game_settings(
    game_id: UUID,
    data: UpdateGameSettingsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.update_settings(game_id, current_user.id, data)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.delete("/games/{game_id}/members/me", response_model=GameState)
async def leave_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.leave(game_id, current_user.id)
    sync_auction_timer(game)
    sync_bot_runner(game)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.post("/games/{game_id}/start", response_model=GameState)
async def start_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.start(game_id, current_user.id)
    sync_bot_runner(game)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.post("/games/{game_id}/commands", response_model=GameState)
async def execute_command(
    game_id: UUID,
    command: Annotated[GameCommand, Body(discriminator="action")],
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.execute(game_id, current_user.id, command)
    sync_auction_timer(game)
    sync_bot_runner(game)
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game
