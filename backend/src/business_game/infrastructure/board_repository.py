from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.errors import NotFoundError
from business_game.infrastructure.db_models import (
    BoardProjectRecord,
    BoardVersionRecord,
)


class BoardProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        owner_id: UUID,
        project_id: UUID,
        pack_id: str,
        name: str,
        description: str,
        document: dict[str, object],
    ) -> BoardProjectRecord:
        record = BoardProjectRecord(
            id=project_id,
            owner_id=owner_id,
            pack_id=pack_id,
            name=name,
            description=description,
            document=document,
            revision=1,
        )
        self.session.add(record)
        await self.session.flush()
        await self.session.refresh(record)
        return record

    async def list_owned(self, owner_id: UUID) -> list[BoardProjectRecord]:
        statement = (
            select(BoardProjectRecord)
            .where(BoardProjectRecord.owner_id == owner_id)
            .order_by(BoardProjectRecord.updated_at.desc(), BoardProjectRecord.id)
        )
        return list((await self.session.scalars(statement)).all())

    async def get_owned(
        self,
        project_id: UUID,
        owner_id: UUID,
        *,
        for_update: bool = False,
    ) -> BoardProjectRecord:
        statement = select(BoardProjectRecord).where(
            BoardProjectRecord.id == project_id,
            BoardProjectRecord.owner_id == owner_id,
        )
        if for_update:
            statement = statement.with_for_update()
        record = await self.session.scalar(statement)
        if record is None:
            raise NotFoundError("board project was not found")
        return record

    async def save(self, record: BoardProjectRecord) -> None:
        await self.session.flush()
        await self.session.refresh(record)

    async def delete(self, record: BoardProjectRecord) -> None:
        await self.session.delete(record)
        await self.session.flush()

    async def create_version(
        self,
        *,
        project_id: UUID,
        pack_id: str,
        version: str,
        source_revision: int,
        document: dict[str, object],
        manifest: dict[str, object],
    ) -> BoardVersionRecord:
        record = BoardVersionRecord(
            project_id=project_id,
            pack_id=pack_id,
            version=version,
            source_revision=source_revision,
            document=document,
            manifest=manifest,
        )
        self.session.add(record)
        await self.session.flush()
        await self.session.refresh(record)
        return record

    async def list_versions(self, project_id: UUID) -> list[BoardVersionRecord]:
        statement = select(BoardVersionRecord).where(
            BoardVersionRecord.project_id == project_id
        )
        records = list((await self.session.scalars(statement)).all())
        return sorted(records, key=self._version_key, reverse=True)

    async def latest_version(
        self,
        project_id: UUID,
    ) -> BoardVersionRecord | None:
        statement = select(BoardVersionRecord).where(
            BoardVersionRecord.project_id == project_id
        )
        records = list((await self.session.scalars(statement)).all())
        return max(records, key=self._version_key, default=None)

    async def latest_versions_for_projects(
        self,
        project_ids: list[UUID],
    ) -> dict[UUID, BoardVersionRecord]:
        if not project_ids:
            return {}
        statement = select(BoardVersionRecord).where(
            BoardVersionRecord.project_id.in_(project_ids)
        )
        records = list((await self.session.scalars(statement)).all())
        latest: dict[UUID, BoardVersionRecord] = {}
        for record in records:
            current = latest.get(record.project_id)
            if current is None or self._version_key(record) > self._version_key(current):
                latest[record.project_id] = record
        return latest

    async def get_published(
        self,
        pack_id: str,
        *,
        version: str | None = None,
    ) -> BoardVersionRecord:
        statement = select(BoardVersionRecord).where(
            BoardVersionRecord.pack_id == pack_id
        )
        if version is not None:
            statement = statement.where(BoardVersionRecord.version == version)
            record = await self.session.scalar(statement.limit(1))
        else:
            records = list((await self.session.scalars(statement)).all())
            record = max(records, key=self._version_key, default=None)
        if record is None:
            suffix = f" version '{version}'" if version is not None else ""
            raise NotFoundError(f"pack '{pack_id}'{suffix} was not found")
        return record

    async def list_latest_published(self) -> list[BoardVersionRecord]:
        records = list((await self.session.scalars(select(BoardVersionRecord))).all())
        latest_by_pack: dict[str, BoardVersionRecord] = {}
        for record in records:
            current = latest_by_pack.get(record.pack_id)
            if current is None or self._version_key(record) > self._version_key(current):
                latest_by_pack[record.pack_id] = record
        return sorted(latest_by_pack.values(), key=lambda item: item.pack_id)

    @staticmethod
    def _version_key(record: BoardVersionRecord) -> tuple[int, int, int]:
        major, minor, patch = record.version.split(".")
        return int(major), int(minor), int(patch)
