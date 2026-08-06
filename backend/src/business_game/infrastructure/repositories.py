from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.errors import NotFoundError
from business_game.domain.models import (
    ContentPack,
    GameEvent,
    GameState,
    User,
    UserPreferences,
    UserPreferencesUpdate,
)
from business_game.infrastructure.db_models import (
    AuthSessionRecord,
    GameEventRecord,
    GameMemberRecord,
    GameRecord,
    ProcessedGameCommandRecord,
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

    async def get_preferences(self, user_id: UUID) -> UserPreferences:
        record = await self.session.get(UserRecord, user_id)
        if record is None or not record.is_active:
            raise NotFoundError("user was not found")
        return UserPreferences.model_validate(record.ui_preferences or {})

    async def update_preferences(
        self,
        user_id: UUID,
        update: UserPreferencesUpdate,
    ) -> UserPreferences:
        record = await self.session.get(UserRecord, user_id, with_for_update=True)
        if record is None or not record.is_active:
            raise NotFoundError("user was not found")
        payload = UserPreferences.model_validate(
            record.ui_preferences or {}
        ).model_dump(mode="json")
        payload.update(update.model_dump(mode="json", exclude_none=True))
        preferences = UserPreferences.model_validate(payload)
        record.ui_preferences = preferences.model_dump(mode="json")
        await self.session.flush()
        return preferences

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
    COMMAND_RECEIPTS_PER_GAME = 500

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, game: GameState) -> None:
        record = GameRecord(
            id=game.id,
            pack_id=game.pack_id,
            pack_version=game.pack_version,
            status=game.status.value,
            state=game.model_dump(mode="json", exclude={"events"}),
            pack_snapshot=(
                game.pack_snapshot.model_dump(mode="json")
                if game.pack_snapshot is not None
                else None
            ),
            auction_deadline=self._auction_deadline(game),
            has_active_bots=self._has_active_bots(game),
        )
        self.session.add(record)
        await self.session.flush()
        await self._sync_members(game)
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
        event_records = list(
            (
                await self.session.scalars(
                    select(GameEventRecord)
                    .where(GameEventRecord.game_id == game_id)
                    .order_by(GameEventRecord.sequence)
                )
            ).all()
        )
        game.events = [
            GameEvent(
                sequence=event.sequence,
                type=event.event_type,
                data=event.event_data,
                occurred_at=(
                    event.occurred_at
                    if event.occurred_at.tzinfo is not None
                    else event.occurred_at.replace(tzinfo=UTC)
                ),
            )
            for event in event_records
        ]
        if game.events:
            game.event_sequence = game.events[-1].sequence
        if record.pack_snapshot is not None:
            game.pack_snapshot = ContentPack.model_validate(record.pack_snapshot)
        return game

    async def list_active_for_user(self, user_id: UUID) -> list[GameState]:
        statement = (
            select(GameRecord)
            .join(GameMemberRecord, GameMemberRecord.game_id == GameRecord.id)
            .where(GameRecord.status.in_(("lobby", "playing")))
            .where(GameMemberRecord.user_id == user_id)
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
        statement = select(GameRecord).where(
            GameRecord.status == "playing",
            GameRecord.auction_deadline.is_not(None),
        )
        records = (await self.session.scalars(statement)).all()
        games = [self._to_domain(record) for record in records]
        return [
            game
            for game in games
            if game.active_auction is not None and game.active_auction.bid_deadline is not None
        ]

    async def list_playing_with_bots(self) -> list[GameState]:
        statement = select(GameRecord).where(
            GameRecord.status == "playing",
            GameRecord.has_active_bots.is_(True),
        )
        records = (await self.session.scalars(statement)).all()
        games = [self._to_domain(record) for record in records]
        return [
            game
            for game in games
            if any(player.is_bot and not player.bankrupt for player in game.players)
        ]

    async def save(
        self,
        game: GameState,
        previous_sequence: int,
        *,
        sync_members: bool = False,
    ) -> None:
        record = await self.session.get(GameRecord, game.id)
        if record is None:
            raise NotFoundError("game was not found")
        record.status = game.status.value
        record.state = game.model_dump(mode="json", exclude={"events"})
        record.pack_snapshot = (
            game.pack_snapshot.model_dump(mode="json")
            if game.pack_snapshot is not None
            else None
        )
        record.version += 1
        record.auction_deadline = self._auction_deadline(game)
        record.has_active_bots = self._has_active_bots(game)
        if sync_members:
            await self._sync_members(game)
        self._add_events(
            game.id,
            [event for event in game.events if event.sequence > previous_sequence],
        )
        await self.session.flush()

    async def command_was_processed(
        self,
        game_id: UUID,
        actor_id: UUID,
        command_id: UUID,
    ) -> bool:
        statement = select(ProcessedGameCommandRecord.id).where(
            ProcessedGameCommandRecord.game_id == game_id,
            ProcessedGameCommandRecord.actor_id == actor_id,
            ProcessedGameCommandRecord.command_id == command_id,
        )
        return await self.session.scalar(statement) is not None

    async def record_command(
        self,
        game_id: UUID,
        actor_id: UUID,
        command_id: UUID,
    ) -> None:
        self.session.add(
            ProcessedGameCommandRecord(
                game_id=game_id,
                actor_id=actor_id,
                command_id=command_id,
            )
        )
        await self.session.flush()
        cutoff = await self.session.scalar(
            select(ProcessedGameCommandRecord.id)
            .where(ProcessedGameCommandRecord.game_id == game_id)
            .order_by(ProcessedGameCommandRecord.id.desc())
            .offset(self.COMMAND_RECEIPTS_PER_GAME)
            .limit(1)
        )
        if cutoff is not None:
            await self.session.execute(
                delete(ProcessedGameCommandRecord).where(
                    ProcessedGameCommandRecord.game_id == game_id,
                    ProcessedGameCommandRecord.id <= cutoff,
                )
            )

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

    async def _sync_members(self, game: GameState) -> None:
        await self.session.execute(
            delete(GameMemberRecord).where(GameMemberRecord.game_id == game.id)
        )
        self.session.add_all(
            [
                GameMemberRecord(
                    game_id=game.id,
                    user_id=player.user_id,
                    role="player",
                )
                for player in game.players
                if not player.is_bot
            ]
            + [
                GameMemberRecord(
                    game_id=game.id,
                    user_id=spectator.user_id,
                    role="spectator",
                )
                for spectator in game.spectators
            ]
        )
        await self.session.flush()

    @staticmethod
    def _auction_deadline(game: GameState) -> datetime | None:
        if game.active_auction is None:
            return None
        return game.active_auction.bid_deadline

    @staticmethod
    def _has_active_bots(game: GameState) -> bool:
        return any(player.is_bot and not player.bankrupt for player in game.players)
