from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AdvisorChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1_500)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("message content cannot be blank")
        return content


class AdvisorRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1_000)
    history: list[AdvisorChatMessage] = Field(default_factory=list, max_length=8)

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("question cannot be blank")
        return question


class AdvisorResponse(BaseModel):
    answer: str
    snapshot_sequence: int = Field(ge=0)


class AdvisorStoredMessage(BaseModel):
    id: int = Field(ge=1)
    role: Literal["user", "assistant"]
    content: str
    snapshot_sequence: int | None = Field(default=None, ge=0)
    created_at: datetime


class AdvisorHistoryResponse(BaseModel):
    messages: list[AdvisorStoredMessage]
