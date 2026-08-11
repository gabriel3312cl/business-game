from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, model_validator

from business_game.domain.models import GameStatus, UserRole


class AdminUserSummary(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_non_empty(self) -> "AdminUserUpdate":
        if self.role is None and self.is_active is None:
            raise ValueError("at least one user field must be provided")
        return self


class AdminRoomSummary(BaseModel):
    id: UUID
    pack_id: str
    pack_version: str
    status: GameStatus
    host_user_id: UUID
    host_name: str
    player_count: int
    human_player_count: int
    bot_count: int
    spectator_count: int
    created_at: datetime
    updated_at: datetime
