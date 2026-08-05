from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.chat_models import ChatAuthorKind, ChatMessage
from business_game.infrastructure.db_models import ChatMessageRecord


class ChatRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_messages(
        self,
        game_id: UUID,
        *,
        limit: int,
        before_id: int | None = None,
    ) -> tuple[list[ChatMessage], bool]:
        """Newest ``limit`` messages older than ``before_id``, in reading order.

        Returns the page plus whether older messages remain, so the client knows
        if scrolling up is worth another request.
        """
        statement = select(ChatMessageRecord).where(ChatMessageRecord.game_id == game_id)
        if before_id is not None:
            statement = statement.where(ChatMessageRecord.id < before_id)
        statement = statement.order_by(ChatMessageRecord.id.desc()).limit(limit + 1)
        records = list((await self._session.scalars(statement)).all())
        has_more = len(records) > limit
        records = records[:limit]
        records.reverse()
        return [self._to_domain(record) for record in records], has_more

    async def append(
        self,
        *,
        game_id: UUID,
        author_id: UUID | None,
        author_name: str,
        author_kind: ChatAuthorKind,
        body: str,
        template_key: str | None = None,
        template_params: dict[str, str | int] | None = None,
    ) -> ChatMessage:
        record = ChatMessageRecord(
            game_id=game_id,
            author_id=author_id,
            author_name=author_name,
            author_kind=author_kind,
            body=body,
            template_key=template_key,
            template_params=template_params or None,
        )
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return self._to_domain(record)

    async def prune(self, game_id: UUID, *, keep: int) -> None:
        """Drop the oldest messages so one room cannot grow without bound."""
        cutoff_statement = (
            select(ChatMessageRecord.id)
            .where(ChatMessageRecord.game_id == game_id)
            .order_by(ChatMessageRecord.id.desc())
            .offset(keep)
            .limit(1)
        )
        cutoff = await self._session.scalar(cutoff_statement)
        if cutoff is None:
            return
        await self._session.execute(
            delete(ChatMessageRecord).where(
                ChatMessageRecord.game_id == game_id,
                ChatMessageRecord.id <= cutoff,
            )
        )

    @staticmethod
    def _to_domain(record: ChatMessageRecord) -> ChatMessage:
        params = record.template_params or {}
        return ChatMessage(
            id=record.id,
            game_id=record.game_id,
            author_id=record.author_id,
            author_name=record.author_name,
            author_kind=record.author_kind,  # type: ignore[arg-type]
            is_bot=record.author_kind == "bot",
            body=record.body,
            template_key=record.template_key,
            template_params={
                key: value
                for key, value in params.items()
                if isinstance(value, (str, int))
            },
            created_at=record.created_at,
        )
