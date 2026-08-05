from __future__ import annotations

import json
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.pack_loader import PackLoader
from business_game.domain.board_models import (
    BoardDraft,
    BoardProjectCreate,
    BoardProjectUpdate,
    BoardValidationIssue,
    BoardValidationResult,
    EditablePackContent,
    PublishBoardRequest,
    PublishedBoardVersion,
)
from business_game.domain.errors import ConflictError
from business_game.domain.models import ContentPack, PackManifest
from business_game.infrastructure.board_repository import BoardProjectRepository
from business_game.infrastructure.db_models import (
    BoardProjectRecord,
    BoardVersionRecord,
)

MAX_DRAFT_BYTES = 2_000_000


class BoardProjectService:
    def __init__(self, session: AsyncSession):
        self._session = session
        self._projects = BoardProjectRepository(session)

    async def create(self, owner_id: UUID, data: BoardProjectCreate) -> BoardDraft:
        self._validate_document_size(data.document)
        name = self._clean_name(data.name)
        project_id = uuid4()
        async with self._session.begin():
            record = await self._projects.create(
                owner_id=owner_id,
                project_id=project_id,
                pack_id=f"custom-{project_id.hex}",
                name=name,
                description=data.description.strip(),
                document=data.document,
            )
        return self._to_draft(record, None)

    async def list(self, owner_id: UUID) -> list[BoardDraft]:
        records = await self._projects.list_owned(owner_id)
        latest = await self._projects.latest_versions_for_projects(
            [record.id for record in records]
        )
        return [
            self._to_draft(record, latest.get(record.id))
            for record in records
        ]

    async def get(self, project_id: UUID, owner_id: UUID) -> BoardDraft:
        record = await self._projects.get_owned(project_id, owner_id)
        latest = await self._projects.latest_version(project_id)
        return self._to_draft(record, latest)

    async def update(
        self,
        project_id: UUID,
        owner_id: UUID,
        data: BoardProjectUpdate,
    ) -> BoardDraft:
        if data.document is not None:
            self._validate_document_size(data.document)
        async with self._session.begin():
            record = await self._projects.get_owned(
                project_id,
                owner_id,
                for_update=True,
            )
            self._require_revision(record, data.revision)
            if data.name is not None:
                record.name = self._clean_name(data.name)
            if data.description is not None:
                record.description = data.description.strip()
            if data.document is not None:
                record.document = data.document
            record.revision += 1
            await self._projects.save(record)
            latest = await self._projects.latest_version(project_id)
        return self._to_draft(record, latest)

    async def delete(
        self,
        project_id: UUID,
        owner_id: UUID,
        revision: int,
    ) -> None:
        async with self._session.begin():
            record = await self._projects.get_owned(
                project_id,
                owner_id,
                for_update=True,
            )
            self._require_revision(record, revision)
            if await self._projects.latest_version(project_id) is not None:
                raise ConflictError(
                    "published board projects cannot be deleted"
                )
            await self._projects.delete(record)

    async def validate(
        self,
        project_id: UUID,
        owner_id: UUID,
        revision: int,
    ) -> BoardValidationResult:
        record = await self._projects.get_owned(project_id, owner_id)
        self._require_revision(record, revision)
        try:
            EditablePackContent.model_validate(record.document)
        except ValidationError as exc:
            return BoardValidationResult(
                valid=False,
                errors=[
                    BoardValidationIssue(
                        path=self._error_path(error["loc"]),
                        message=str(error["msg"]),
                    )
                    for error in exc.errors(include_url=False)
                ],
            )
        return BoardValidationResult(valid=True)

    async def publish(
        self,
        project_id: UUID,
        owner_id: UUID,
        data: PublishBoardRequest,
    ) -> PublishedBoardVersion:
        async with self._session.begin():
            project = await self._projects.get_owned(
                project_id,
                owner_id,
                for_update=True,
            )
            self._require_revision(project, data.revision)
            try:
                content = EditablePackContent.model_validate(project.document)
            except ValidationError as exc:
                raise ConflictError(
                    "board draft is invalid; run validation before publishing"
                ) from exc
            existing_versions = await self._projects.list_versions(project_id)
            version = data.version or self._next_version(existing_versions)
            if any(item.version == version for item in existing_versions):
                raise ConflictError(
                    f"board version '{version}' has already been published"
                )
            if existing_versions and self._parse_version(version) <= max(
                self._parse_version(item.version) for item in existing_versions
            ):
                raise ConflictError(
                    "a published version must be greater than every existing version"
                )
            pack = content.to_pack(pack_id=project.pack_id, version=version)
            version_record = await self._projects.create_version(
                project_id=project.id,
                pack_id=project.pack_id,
                version=version,
                source_revision=project.revision,
                document=content.model_dump(mode="json"),
                manifest=pack.manifest.model_dump(mode="json"),
            )
        return self._to_published(version_record)

    async def list_versions(
        self,
        project_id: UUID,
        owner_id: UUID,
    ) -> list[PublishedBoardVersion]:
        await self._projects.get_owned(project_id, owner_id)
        return [
            self._to_published(record)
            for record in await self._projects.list_versions(project_id)
        ]

    @staticmethod
    def _require_revision(record: BoardProjectRecord, revision: int) -> None:
        if record.revision != revision:
            raise ConflictError(
                f"stale board revision: expected {record.revision}, received {revision}"
            )

    @staticmethod
    def _validate_document_size(document: dict[str, object]) -> None:
        payload_size = len(
            json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode()
        )
        if payload_size > MAX_DRAFT_BYTES:
            raise ConflictError("board draft exceeds the 2 MB limit")

    @staticmethod
    def _clean_name(name: str) -> str:
        cleaned = name.strip()
        if len(cleaned) < 2:
            raise ConflictError("board project name cannot be blank")
        return cleaned

    @staticmethod
    def _next_version(existing: list[BoardVersionRecord]) -> str:
        if not existing:
            return "1.0.0"
        parsed = [BoardProjectService._parse_version(item.version) for item in existing]
        major, minor, patch = max(parsed)
        return f"{major}.{minor}.{patch + 1}"

    @staticmethod
    def _parse_version(version: str) -> tuple[int, int, int]:
        major, minor, patch = version.split(".")
        return int(major), int(minor), int(patch)

    @staticmethod
    def _error_path(location: tuple[object, ...]) -> str:
        if not location:
            return "$"
        return ".".join(str(part) for part in location)

    @staticmethod
    def _to_draft(
        record: BoardProjectRecord,
        latest: BoardVersionRecord | None,
    ) -> BoardDraft:
        return BoardDraft(
            id=record.id,
            revision=record.revision,
            status=(
                "published"
                if latest is not None and latest.source_revision == record.revision
                else "draft"
            ),
            name=record.name,
            description=record.description,
            document=record.document,
            created_at=record.created_at,
            updated_at=record.updated_at,
            published_pack_id=latest.pack_id if latest is not None else None,
            published_version=latest.version if latest is not None else None,
        )

    @staticmethod
    def _to_published(record: BoardVersionRecord) -> PublishedBoardVersion:
        return PublishedBoardVersion(
            project_id=record.project_id,
            pack_id=record.pack_id,
            version=record.version,
            manifest=PackManifest.model_validate(record.manifest),
            published_at=record.published_at,
        )


class PackResolver:
    def __init__(self, session: AsyncSession, filesystem: PackLoader):
        self._filesystem = filesystem
        self._projects = BoardProjectRepository(session)

    async def list(self) -> list[PackManifest]:
        manifests = {item.id: item for item in self._filesystem.list()}
        for record in await self._projects.list_latest_published():
            manifest = PackManifest.model_validate(record.manifest)
            manifests.setdefault(manifest.id, manifest)
        return [manifests[pack_id] for pack_id in sorted(manifests)]

    async def load(
        self,
        pack_id: str,
        *,
        locale: str | None = None,
        version: str | None = None,
    ) -> ContentPack:
        if not pack_id.startswith("custom-"):
            return self._filesystem.load(
                pack_id,
                locale=locale,
                version=version,
            )
        record = await self._projects.get_published(pack_id, version=version)
        content = EditablePackContent.model_validate(record.document)
        return content.to_pack(
            pack_id=record.pack_id,
            version=record.version,
            locale=locale,
        )
