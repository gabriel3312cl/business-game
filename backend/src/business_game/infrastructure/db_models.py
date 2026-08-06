from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRecord(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_active_email", "is_active", "email"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320))
    display_name: Mapped[str] = mapped_column(String(40))
    locale: Mapped[str] = mapped_column(String(10), default="es")
    password_hash: Mapped[str] = mapped_column(String(255))
    ui_preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class AuthSessionRecord(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),
        Index("ix_auth_sessions_user_active", "user_id", "revoked_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class BoardProjectRecord(Base):
    __tablename__ = "board_projects"
    __table_args__ = (
        UniqueConstraint("pack_id", name="uq_board_projects_pack_id"),
        Index("ix_board_projects_owner_updated", "owner_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    pack_id: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500), default="")
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BoardVersionRecord(Base):
    __tablename__ = "board_versions"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "version",
            name="uq_board_versions_project_version",
        ),
        Index("ix_board_versions_pack_published", "pack_id", "published_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("board_projects.id", ondelete="CASCADE"),
    )
    pack_id: Mapped[str] = mapped_column(String(80))
    version: Mapped[str] = mapped_column(String(30))
    version_major: Mapped[int] = mapped_column(Integer)
    version_minor: Mapped[int] = mapped_column(Integer)
    version_patch: Mapped[int] = mapped_column(Integer)
    source_revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class BoardAssetRecord(Base):
    __tablename__ = "board_assets"
    __table_args__ = (Index("ix_board_assets_project_created", "project_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("board_projects.id", ondelete="CASCADE"),
    )
    name: Mapped[str] = mapped_column(String(100))
    content_type: Mapped[str] = mapped_column(String(40))
    content: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class GameRecord(Base):
    __tablename__ = "games"
    __table_args__ = (
        Index("ix_games_status_auction_deadline", "status", "auction_deadline"),
        Index("ix_games_status_active_bots", "status", "has_active_bots"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    pack_id: Mapped[str] = mapped_column(String(80))
    pack_version: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30))
    state: Mapped[dict[str, Any]] = mapped_column(JSON)
    pack_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    version: Mapped[int] = mapped_column(Integer, default=1)
    auction_deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
    )
    has_active_bots: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class GameEventRecord(Base):
    __tablename__ = "game_events"
    __table_args__ = (
        UniqueConstraint(
            "game_id",
            "sequence",
            name="uq_game_events_game_sequence",
        ),
        Index("ix_game_events_game_sequence", "game_id", "sequence"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
    )
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(100))
    event_data: Mapped[dict[str, Any]] = mapped_column(JSON)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class GameMemberRecord(Base):
    __tablename__ = "game_members"
    __table_args__ = (
        CheckConstraint("role IN ('player', 'spectator')", name="ck_game_members_role"),
        Index("ix_game_members_user_game", "user_id", "game_id"),
    )

    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(12))


class ProcessedGameCommandRecord(Base):
    __tablename__ = "processed_game_commands"
    __table_args__ = (
        UniqueConstraint(
            "game_id",
            "actor_id",
            "command_id",
            name="uq_processed_game_command",
        ),
        Index("ix_processed_game_commands_game_id", "game_id", "id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
    )
    actor_id: Mapped[UUID] = mapped_column()
    command_id: Mapped[UUID] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(
            "author_kind IN ('player', 'bot', 'system')",
            name="ck_chat_messages_author_kind",
        ),
        Index("ix_chat_messages_game_id", "game_id", "id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
    )
    # Bots are players without a user row, so this cannot reference `users`.
    # `author_name` keeps the name shown at the time, independent of later renames.
    author_id: Mapped[UUID | None] = mapped_column(default=None)
    author_name: Mapped[str] = mapped_column(String(80), default="")
    author_kind: Mapped[str] = mapped_column(String(10), default="player")
    body: Mapped[str] = mapped_column(Text)
    template_key: Mapped[str | None] = mapped_column(String(80), default=None)
    template_params: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class AdvisorMessageRecord(Base):
    __tablename__ = "advisor_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_advisor_messages_role",
        ),
        Index(
            "ix_advisor_messages_game_user_id",
            "game_id",
            "user_id",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    snapshot_sequence: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
