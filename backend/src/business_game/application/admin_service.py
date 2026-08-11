from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.admin_models import (
    AdminRoomSummary,
    AdminUserSummary,
    AdminUserUpdate,
)
from business_game.domain.errors import ConflictError, NotFoundError
from business_game.domain.models import GameState, UserRole
from business_game.infrastructure.db_models import GameRecord, UserRecord


class AdminService:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_users(self) -> list[AdminUserSummary]:
        records = list(
            (
                await self._session.scalars(
                    select(UserRecord).order_by(UserRecord.created_at, UserRecord.id)
                )
            ).all()
        )
        return [self._user_summary(record) for record in records]

    async def update_user(
        self,
        user_id: UUID,
        data: AdminUserUpdate,
        *,
        actor_id: UUID,
    ) -> AdminUserSummary:
        async with self._session.begin():
            record = await self._session.get(UserRecord, user_id, with_for_update=True)
            if record is None:
                raise NotFoundError("user was not found")
            if actor_id == user_id and (
                data.role is UserRole.PLAYER or data.is_active is False
            ):
                raise ConflictError(
                    "an administrator cannot remove their own access"
                )
            if data.role is not None:
                record.role = data.role.value
            if data.is_active is not None:
                record.is_active = data.is_active
            await self._session.flush()
            await self._session.refresh(record)
            return self._user_summary(record)

    async def list_rooms(self) -> list[AdminRoomSummary]:
        records = list(
            (
                await self._session.scalars(
                    select(GameRecord).order_by(
                        GameRecord.updated_at.desc(),
                        GameRecord.id,
                    )
                )
            ).all()
        )
        return [self._room_summary(record) for record in records]

    @staticmethod
    def _user_summary(record: UserRecord) -> AdminUserSummary:
        return AdminUserSummary(
            id=record.id,
            email=record.email,
            display_name=record.display_name,
            role=record.role,
            is_active=record.is_active,
            created_at=record.created_at,
        )

    @staticmethod
    def _room_summary(record: GameRecord) -> AdminRoomSummary:
        game = GameState.model_validate(record.state)
        host = next(
            (
                player.display_name
                for player in game.players
                if player.user_id == game.host_user_id
            ),
            "",
        )
        human_count = sum(not player.is_bot for player in game.players)
        return AdminRoomSummary(
            id=game.id,
            pack_id=game.pack_id,
            pack_version=game.pack_version,
            status=game.status,
            host_user_id=game.host_user_id,
            host_name=host,
            player_count=len(game.players),
            human_player_count=human_count,
            bot_count=len(game.players) - human_count,
            spectator_count=len(game.spectators),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
