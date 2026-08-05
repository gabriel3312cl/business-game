from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

CHAT_MAX_BODY_CHARS = 400
CHAT_MAX_AUTHOR_NAME_CHARS = 80
CHAT_MAX_TEMPLATE_PARAMS = 6

ChatAuthorKind = Literal["player", "bot", "system"]


def _plain_text(value: str) -> str:
    """Chat bodies travel as plain text: no control characters, no runaway blanks.

    Control characters go first: collapsing whitespace before dropping them would
    leave the blanks that used to surround them.
    """
    printable = "".join(
        character for character in value if character.isprintable() or character.isspace()
    )
    return " ".join(printable.split())[:CHAT_MAX_BODY_CHARS]


class ChatMessage(BaseModel):
    id: int = Field(ge=1)
    game_id: UUID
    author_id: UUID | None = None
    author_name: str = Field(default="", max_length=CHAT_MAX_AUTHOR_NAME_CHARS)
    author_kind: ChatAuthorKind = "player"
    is_bot: bool = False
    body: str = Field(max_length=CHAT_MAX_BODY_CHARS)
    template_key: str | None = Field(default=None, max_length=80)
    template_params: dict[str, str | int] = Field(
        default_factory=dict,
        max_length=CHAT_MAX_TEMPLATE_PARAMS,
    )
    created_at: datetime


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=CHAT_MAX_BODY_CHARS)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        body = _plain_text(value)
        if not body:
            raise ValueError("message body cannot be blank")
        return body


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessage]
    has_more: bool = False
