"""Add versioned custom board projects.

Revision ID: 20260729_0003
Revises: 20260729_0002
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_0003"
down_revision: str | None = "20260729_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("games", sa.Column("pack_snapshot", sa.JSON(), nullable=True))
    op.create_table(
        "board_projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("pack_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pack_id", name="uq_board_projects_pack_id"),
    )
    op.create_index(
        "ix_board_projects_owner_updated",
        "board_projects",
        ["owner_id", "updated_at"],
        unique=False,
    )
    op.create_table(
        "board_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("pack_id", sa.String(length=80), nullable=False),
        sa.Column("version", sa.String(length=30), nullable=False),
        sa.Column("source_revision", sa.Integer(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["board_projects.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "version",
            name="uq_board_versions_project_version",
        ),
    )
    op.create_index(
        "ix_board_versions_pack_published",
        "board_versions",
        ["pack_id", "published_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_board_versions_pack_published",
        table_name="board_versions",
    )
    op.drop_table("board_versions")
    op.drop_index(
        "ix_board_projects_owner_updated",
        table_name="board_projects",
    )
    op.drop_table("board_projects")
    op.drop_column("games", "pack_snapshot")
