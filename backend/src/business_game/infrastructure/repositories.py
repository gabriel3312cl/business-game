from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.errors import NotFoundError
from business_game.domain.models import ContentPack, GameEvent, GameState, User
from business_game.infrastructure.db_models import (
    AuthSessionRecord,
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


class AuthSessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> None:
        self.session.add(
            AuthSessionRecord(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        await self.session.flush()

    async def get_active(self, token_hash: str) -> AuthSessionRecord | None:
        statement = (
            select(AuthSessionRecord)
            .where(
                AuthSessionRecord.token_hash == token_hash,
                AuthSessionRecord.revoked_at.is_(None),
                AuthSessionRecord.expires_at > datetime.now(UTC),
            )
            .with_for_update()
        )
        return await self.session.scalar(statement)

    async def touch(self, record: AuthSessionRecord) -> None:
        record.last_used_at = datetime.now(UTC)
        await self.session.flush()

    async def revoke(self, token_hash: str) -> None:
        record = await self.get_active(token_hash)
        if record is None:
            return
        record.revoked_at = datetime.now(UTC)
        await self.session.flush()


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
            pack_snapshot=(
                game.pack_snapshot.model_dump(mode="json")
                if game.pack_snapshot is not None
                else None
            ),
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
        game = GameState.model_validate(record.state)
        if record.pack_snapshot is not None:
            game.pack_snapshot = ContentPack.model_validate(record.pack_snapshot)
        return game

    async def list_active_for_user(self, user_id: UUID) -> list[GameState]:
        statement = (
            select(GameRecord)
            .where(GameRecord.status.in_(("lobby", "playing")))
            .order_by(GameRecord.updated_at.desc(), GameRecord.id)
        )
        records = (await self.session.scalars(statement)).all()
        games = [self._to_domain(record) for record in records]
        return [
            game
            for game in games
            if any(
                player.user_id == user_id and not player.bankrupt
                for player in game.players
            )
            or any(spectator.user_id == user_id for spectator in game.spectators)
        ]

    async def list_with_scheduled_auctions(self) -> list[GameState]:
        statement = select(GameRecord).where(GameRecord.status == "playing")
        records = (await self.session.scalars(statement)).all()
        games = [self._to_domain(record) for record in records]
        return [
            game
            for game in games
            if game.active_auction is not None
            and game.active_auction.bid_deadline is not None
        ]

    async def list_playing_with_bots(self) -> list[GameState]:
        statement = select(GameRecord).where(GameRecord.status == "playing")
        records = (await self.session.scalars(statement)).all()
        games = [self._to_domain(record) for record in records]
        return [
            game
            for game in games
            if any(player.is_bot and not player.bankrupt for player in game.players)
        ]

    async def save(self, game: GameState, previous_sequence: int) -> None:
        record = await self.session.get(GameRecord, game.id)
        if record is None:
            raise NotFoundError("game was not found")
        record.status = game.status.value
        record.state = game.model_dump(mode="json")
        record.pack_snapshot = (
            game.pack_snapshot.model_dump(mode="json")
            if game.pack_snapshot is not None
            else None
        )
        record.version += 1
        self._add_events(
            game.id,
            [event for event in game.events if event.sequence > previous_sequence],
        )
        await self.session.flush()

    @staticmethod
    def _to_domain(record: GameRecord) -> GameState:
        game = GameState.model_validate(record.state)
        if record.pack_snapshot is not None:
            game.pack_snapshot = ContentPack.model_validate(record.pack_snapshot)
        return game

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
