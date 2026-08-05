"""Persist in-game chat messages from players, bots and the system.

Revision ID: 20260805_0006
Revises: 20260804_0005
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260805_0006"
down_revision: str | None = "20260804_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        # Bots play without a user row, so author_id intentionally has no
        # foreign key to `users`; NULL marks a system message.
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("author_name", sa.String(length=80), nullable=False),
        sa.Column("author_kind", sa.String(length=10), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("template_key", sa.String(length=80), nullable=True),
        sa.Column("template_params", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "author_kind IN ('player', 'bot', 'system')",
            name="ck_chat_messages_author_kind",
        ),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_messages_game_id",
        "chat_messages",
        ["game_id", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_game_id", table_name="chat_messages")
    op.drop_table("chat_messages")
