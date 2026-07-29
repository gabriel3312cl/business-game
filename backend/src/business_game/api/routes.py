from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from business_game.api.dependencies import (
    get_current_user,
    get_game_service,
    get_user_service,
    pack_loader,
)
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
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
from business_game.realtime import sio
from business_game.security import create_access_token

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/packs", response_model=list[PackManifest])
def list_packs() -> list[PackManifest]:
    return pack_loader.list()


@router.get("/packs/{pack_id}", response_model=ContentPack)
def get_pack(
    pack_id: str,
    locale: Annotated[str | None, Query()] = None,
) -> ContentPack:
    return pack_loader.load(pack_id, locale)


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
    users: Annotated[UserService, Depends(get_user_service)],
) -> TokenResponse:
    user = await users.authenticate(form.username, form.password)
    return TokenResponse(access_token=create_access_token(user.id))


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
    return await games.create(data.pack_id, current_user)


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
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game


@router.post("/games/{game_id}/start", response_model=GameState)
async def start_game(
    game_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    game = await games.start(game_id, current_user.id)
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
    await sio.emit("game_state", game.model_dump(mode="json"), room=str(game_id))
    return game
