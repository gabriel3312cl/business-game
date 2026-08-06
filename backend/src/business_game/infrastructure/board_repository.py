from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.errors import NotFoundError
from business_game.infrastructure.db_models import (
    BoardAssetRecord,
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

    async def create_asset(
        self,
        *,
        project_id: UUID,
        name: str,
        content: str,
        size_bytes: int,
        sha256: str,
    ) -> BoardAssetRecord:
        record = BoardAssetRecord(
            project_id=project_id,
            name=name,
            content_type="image/svg+xml",
            content=content,
            size_bytes=size_bytes,
            sha256=sha256,
        )
        self.session.add(record)
        await self.session.flush()
        await self.session.refresh(record)
        return record

    async def list_assets(self, project_id: UUID) -> list[BoardAssetRecord]:
        statement = (
            select(BoardAssetRecord)
            .where(BoardAssetRecord.project_id == project_id)
            .order_by(BoardAssetRecord.created_at, BoardAssetRecord.id)
        )
        return list((await self.session.scalars(statement)).all())

    async def count_assets(self, project_id: UUID) -> int:
        statement = select(func.count(BoardAssetRecord.id)).where(
            BoardAssetRecord.project_id == project_id
        )
        return int(await self.session.scalar(statement) or 0)

    async def get_asset(
        self,
        asset_id: UUID,
        *,
        project_id: UUID | None = None,
    ) -> BoardAssetRecord:
        statement = select(BoardAssetRecord).where(BoardAssetRecord.id == asset_id)
        if project_id is not None:
            statement = statement.where(BoardAssetRecord.project_id == project_id)
        record = await self.session.scalar(statement)
        if record is None:
            raise NotFoundError("board asset was not found")
        return record

    async def delete_asset(self, record: BoardAssetRecord) -> None:
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
        version_major, version_minor, version_patch = map(int, version.split("."))
        record = BoardVersionRecord(
            project_id=project_id,
            pack_id=pack_id,
            version=version,
            version_major=version_major,
            version_minor=version_minor,
            version_patch=version_patch,
            source_revision=source_revision,
            document=document,
            manifest=manifest,
        )
        self.session.add(record)
        await self.session.flush()
        await self.session.refresh(record)
        return record

    async def list_versions(self, project_id: UUID) -> list[BoardVersionRecord]:
        statement = (
            select(BoardVersionRecord)
            .where(BoardVersionRecord.project_id == project_id)
            .order_by(*self._version_order())
        )
        return list((await self.session.scalars(statement)).all())

    async def latest_version(
        self,
        project_id: UUID,
    ) -> BoardVersionRecord | None:
        statement = (
            select(BoardVersionRecord)
            .where(BoardVersionRecord.project_id == project_id)
            .order_by(*self._version_order())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def latest_versions_for_projects(
        self,
        project_ids: list[UUID],
    ) -> dict[UUID, BoardVersionRecord]:
        if not project_ids:
            return {}
        ranked = (
            select(
                BoardVersionRecord.id.label("version_id"),
                func.row_number()
                .over(
                    partition_by=BoardVersionRecord.project_id,
                    order_by=self._version_order(),
                )
                .label("rank"),
            )
            .where(BoardVersionRecord.project_id.in_(project_ids))
            .subquery()
        )
        statement = (
            select(BoardVersionRecord)
            .join(ranked, ranked.c.version_id == BoardVersionRecord.id)
            .where(ranked.c.rank == 1)
        )
        records = list((await self.session.scalars(statement)).all())
        return {record.project_id: record for record in records}

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
            record = await self.session.scalar(
                statement.order_by(*self._version_order()).limit(1)
            )
        if record is None:
            suffix = f" version '{version}'" if version is not None else ""
            raise NotFoundError(f"pack '{pack_id}'{suffix} was not found")
        return record

    async def list_latest_published(self) -> list[BoardVersionRecord]:
        ranked = select(
            BoardVersionRecord.id.label("version_id"),
            func.row_number()
            .over(
                partition_by=BoardVersionRecord.pack_id,
                order_by=self._version_order(),
            )
            .label("rank"),
        ).subquery()
        statement = (
            select(BoardVersionRecord)
            .join(ranked, ranked.c.version_id == BoardVersionRecord.id)
            .where(ranked.c.rank == 1)
            .order_by(BoardVersionRecord.pack_id)
        )
        return list((await self.session.scalars(statement)).all())

    @staticmethod
    def _version_order() -> tuple[object, object, object]:
        return (
            BoardVersionRecord.version_major.desc(),
            BoardVersionRecord.version_minor.desc(),
            BoardVersionRecord.version_patch.desc(),
        )
