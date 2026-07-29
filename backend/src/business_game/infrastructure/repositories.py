from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.errors import NotFoundError
from business_game.domain.models import GameEvent, GameState, User
from business_game.infrastructure.db_models import (
    GameEventRecord,
    GameRecord,
    UserRecord,
)


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        email: str,
        display_name: str,
        locale: str,
        password_hash: str,
    ) -> User:
        record = UserRecord(
            email=email,
            display_name=display_name,
            locale=locale,
            password_hash=password_hash,
        )
        self.session.add(record)
        await self.session.flush()
        return self._to_domain(record)

    async def get(self, user_id: UUID, *, include_inactive: bool = False) -> User:
        record = await self.session.get(UserRecord, user_id)
        if record is None or (not include_inactive and not record.is_active):
            raise NotFoundError("user was not found")
        return self._to_domain(record)

    async def get_record_by_email(self, email: str) -> UserRecord | None:
        statement = select(UserRecord).where(UserRecord.email == email)
        return await self.session.scalar(statement)

    async def update(
        self,
        user_id: UUID,
        *,
        display_name: str | None,
        locale: str | None,
    ) -> User:
        record = await self.session.get(UserRecord, user_id, with_for_update=True)
        if record is None or not record.is_active:
            raise NotFoundError("user was not found")
        if display_name is not None:
            record.display_name = display_name
        if locale is not None:
            record.locale = locale
        await self.session.flush()
        return self._to_domain(record)

    async def deactivate(self, user_id: UUID) -> None:
        record = await self.session.get(UserRecord, user_id, with_for_update=True)
        if record is None or not record.is_active:
            raise NotFoundError("user was not found")
        record.is_active = False
        await self.session.flush()

    @staticmethod
    def _to_domain(record: UserRecord) -> User:
        return User(
            id=record.id,
            email=record.email,
            display_name=record.display_name,
            locale=record.locale,
            is_active=record.is_active,
            created_at=record.created_at,
        )


class GameRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, game: GameState) -> None:
        record = GameRecord(
            id=game.id,
            pack_id=game.pack_id,
            pack_version=game.pack_version,
            status=game.status.value,
            state=game.model_dump(mode="json"),
        )
        self.session.add(record)
        await self.session.flush()
        self._add_events(game.id, game.events)
        await self.session.flush()

    async def get(self, game_id: UUID, *, for_update: bool = False) -> GameState:
        statement = select(GameRecord).where(GameRecord.id == game_id)
        if for_update:
            statement = statement.with_for_update()
        record = await self.session.scalar(statement)
        if record is None:
            raise NotFoundError("game was not found")
        return GameState.model_validate(record.state)

    async def save(self, game: GameState, previous_sequence: int) -> None:
        record = await self.session.get(GameRecord, game.id)
        if record is None:
            raise NotFoundError("game was not found")
        record.status = game.status.value
        record.state = game.model_dump(mode="json")
        record.version += 1
        self._add_events(
            game.id,
            [event for event in game.events if event.sequence > previous_sequence],
        )
        await self.session.flush()

    def _add_events(self, game_id: UUID, events: list[GameEvent]) -> None:
        self.session.add_all(
            [
                GameEventRecord(
                    game_id=game_id,
                    sequence=event.sequence,
                    event_type=event.type,
                    event_data=event.data,
                    occurred_at=event.occurred_at,
                )
                for event in events
            ]
        )
