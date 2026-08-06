from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.advisor_models import AdvisorChatMessage, AdvisorStoredMessage
from business_game.infrastructure.db_models import AdvisorMessageRecord


class AdvisorChatRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_messages(
        self,
        game_id: UUID,
        user_id: UUID,
        *,
        limit: int,
    ) -> list[AdvisorStoredMessage]:
        statement = (
            select(AdvisorMessageRecord)
            .where(
                AdvisorMessageRecord.game_id == game_id,
                AdvisorMessageRecord.user_id == user_id,
            )
            .order_by(AdvisorMessageRecord.id.desc())
            .limit(limit)
        )
        records = list((await self._session.scalars(statement)).all())
        records.reverse()
        return [self._to_domain(record) for record in records]

    async def context_messages(
        self,
        game_id: UUID,
        user_id: UUID,
        *,
        limit: int,
    ) -> list[AdvisorChatMessage]:
        if limit == 0:
            return []
        messages = await self.list_messages(game_id, user_id, limit=limit)
        return [
            AdvisorChatMessage(role=message.role, content=message.content) for message in messages
        ]

    async def append_exchange(
        self,
        *,
        game_id: UUID,
        user_id: UUID,
        question: str,
        answer: str,
        snapshot_sequence: int,
    ) -> None:
        self._session.add_all(
            [
                AdvisorMessageRecord(
                    game_id=game_id,
                    user_id=user_id,
                    role="user",
                    content=question,
                ),
                AdvisorMessageRecord(
                    game_id=game_id,
                    user_id=user_id,
                    role="assistant",
                    content=answer,
                    snapshot_sequence=snapshot_sequence,
                ),
            ]
        )
        await self._session.flush()

    async def prune(self, game_id: UUID, user_id: UUID, *, keep: int) -> None:
        cutoff = await self._session.scalar(
            select(AdvisorMessageRecord.id)
            .where(
                AdvisorMessageRecord.game_id == game_id,
                AdvisorMessageRecord.user_id == user_id,
            )
            .order_by(AdvisorMessageRecord.id.desc())
            .offset(keep)
            .limit(1)
        )
        if cutoff is None:
            return
        await self._session.execute(
            delete(AdvisorMessageRecord).where(
                AdvisorMessageRecord.game_id == game_id,
                AdvisorMessageRecord.user_id == user_id,
                AdvisorMessageRecord.id <= cutoff,
            )
        )

    @staticmethod
    def _to_domain(record: AdvisorMessageRecord) -> AdvisorStoredMessage:
        return AdvisorStoredMessage(
            id=record.id,
            role=record.role,
            content=record.content,
            snapshot_sequence=record.snapshot_sequence,
            created_at=record.created_at,
        )
