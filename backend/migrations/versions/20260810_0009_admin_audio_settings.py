"""Add administrator roles and persistent game audio overrides.

Revision ID: 20260810_0009
Revises: 20260806_0008
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260810_0009"
down_revision: str | None = "20260806_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=12),
            server_default="player",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('player', 'admin')",
    )
    op.execute(
        sa.text(
            "UPDATE users SET role = 'admin' "
            "WHERE lower(trim(display_name)) = 'batman' "
            "AND is_active = true "
            "AND (SELECT count(*) FROM users "
            "WHERE lower(trim(display_name)) = 'batman' AND is_active = true) = 1"
        )
    )
    op.create_table(
        "game_audio_overrides",
        sa.Column("sound_id", sa.String(length=80), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=30), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("sound_id"),
    )


def downgrade() -> None:
    op.drop_table("game_audio_overrides")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.drop_column("users", "role")
