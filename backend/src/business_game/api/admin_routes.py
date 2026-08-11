from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from business_game.api.dependencies import (
    get_admin_service,
    get_game_service,
    require_admin,
)
from business_game.application.admin_service import AdminService
from business_game.application.services import GameService
from business_game.domain.admin_models import (
    AdminRoomSummary,
    AdminUserSummary,
    AdminUserUpdate,
)
from business_game.domain.models import User
from business_game.realtime import broadcast_game_state, sync_auction_timer, sync_bot_runner

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserSummary])
async def list_users(
    _admin: Annotated[User, Depends(require_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminUserSummary]:
    return await admin_service.list_users()


@router.patch("/users/{user_id}", response_model=AdminUserSummary)
async def update_user(
    user_id: UUID,
    data: AdminUserUpdate,
    admin: Annotated[User, Depends(require_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminUserSummary:
    return await admin_service.update_user(user_id, data, actor_id=admin.id)


@router.get("/rooms", response_model=list[AdminRoomSummary])
async def list_rooms(
    _admin: Annotated[User, Depends(require_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminRoomSummary]:
    return await admin_service.list_rooms()


@router.post("/rooms/{game_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_room(
    game_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    games: Annotated[GameService, Depends(get_game_service)],
) -> Response:
    game = await games.admin_cancel(game_id, admin.id)
    sync_auction_timer(game)
    sync_bot_runner(game)
    await broadcast_game_state(game, complete_events=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
