from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.infrastructure.db_models import GameAudioOverrideRecord


class GameAudioRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list(self) -> list[GameAudioOverrideRecord]:
        statement = select(GameAudioOverrideRecord).order_by(
            GameAudioOverrideRecord.sound_id
        )
        return list((await self._session.scalars(statement)).all())

    async def get(
        self,
        sound_id: str,
        *,
        for_update: bool = False,
    ) -> GameAudioOverrideRecord | None:
        statement = select(GameAudioOverrideRecord).where(
            GameAudioOverrideRecord.sound_id == sound_id
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    async def replace(
        self,
        sound_id: str,
        *,
        original_filename: str,
        content_type: str,
        content: bytes,
        size_bytes: int,
        sha256: str,
        updated_by: UUID,
    ) -> GameAudioOverrideRecord:
        record = await self.get(sound_id, for_update=True)
        if record is None:
            record = GameAudioOverrideRecord(sound_id=sound_id)
            self._session.add(record)
        record.original_filename = original_filename
        record.content_type = content_type
        record.content = content
        record.size_bytes = size_bytes
        record.sha256 = sha256
        record.updated_by = updated_by
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def delete(self, record: GameAudioOverrideRecord) -> None:
        await self._session.delete(record)
        await self._session.flush()
