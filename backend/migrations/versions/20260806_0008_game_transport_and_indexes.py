"""Separate game transport state and add indexed lookup metadata.

Revision ID: 20260806_0008
Revises: 20260806_0007
Create Date: 2026-08-06
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision: str = "20260806_0008"
down_revision: str | None = "20260806_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("board_versions", sa.Column("version_major", sa.Integer(), nullable=True))
    op.add_column("board_versions", sa.Column("version_minor", sa.Integer(), nullable=True))
    op.add_column("board_versions", sa.Column("version_patch", sa.Integer(), nullable=True))
    op.add_column(
        "games",
        sa.Column("auction_deadline", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "games",
        sa.Column("has_active_bots", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    op.create_table(
        "game_members",
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=12), nullable=False),
        sa.CheckConstraint("role IN ('player', 'spectator')", name="ck_game_members_role"),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("game_id", "user_id"),
    )
    op.create_index(
        "ix_game_members_user_game",
        "game_members",
        ["user_id", "game_id"],
    )
    op.create_table(
        "processed_game_commands",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("command_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "game_id",
            "actor_id",
            "command_id",
            name="uq_processed_game_command",
        ),
    )
    op.create_index(
        "ix_processed_game_commands_game_id",
        "processed_game_commands",
        ["game_id", "id"],
    )

    connection = op.get_bind()
    versions = connection.execute(
        sa.text("SELECT id, version FROM board_versions")
    ).mappings()
    for row in versions:
        major, minor, patch = map(int, row["version"].split("."))
        connection.execute(
            sa.text(
                "UPDATE board_versions SET version_major=:major, version_minor=:minor, "
                "version_patch=:patch WHERE id=:id"
            ),
            {"id": row["id"], "major": major, "minor": minor, "patch": patch},
        )

    games = list(connection.execute(sa.text("SELECT id, state FROM games")).mappings())
    games_table = sa.table(
        "games",
        sa.column("id", sa.Uuid()),
        sa.column("state", sa.JSON()),
        sa.column("auction_deadline", sa.DateTime(timezone=True)),
        sa.column("has_active_bots", sa.Boolean()),
    )
    members: list[dict[str, object]] = []
    for row in games:
        state = dict(row["state"] or {})
        events = list(state.pop("events", []))
        state["event_sequence"] = max(
            (int(event.get("sequence", 0)) for event in events),
            default=int(state.get("event_sequence", 0)),
        )
        auction = state.get("active_auction") or {}
        players = list(state.get("players") or [])
        has_active_bots = any(
            bool(player.get("is_bot")) and not bool(player.get("bankrupt"))
            for player in players
        )
        raw_deadline = auction.get("bid_deadline")
        deadline = (
            datetime.fromisoformat(raw_deadline.replace("Z", "+00:00"))
            if isinstance(raw_deadline, str)
            else raw_deadline
        )
        connection.execute(
            sa.update(games_table)
            .where(games_table.c.id == row["id"])
            .values(
                state=state,
                auction_deadline=deadline,
                has_active_bots=has_active_bots,
            )
        )
        members.extend(
            {
                "game_id": row["id"],
                "user_id": UUID(str(player["user_id"])),
                "role": "player",
            }
            for player in players
            if not bool(player.get("is_bot"))
        )
        members.extend(
            {
                "game_id": row["id"],
                "user_id": UUID(str(spectator["user_id"])),
                "role": "spectator",
            }
            for spectator in state.get("spectators") or []
        )
    if members:
        game_members = sa.table(
            "game_members",
            sa.column("game_id", sa.Uuid()),
            sa.column("user_id", sa.Uuid()),
            sa.column("role", sa.String()),
        )
        op.bulk_insert(game_members, members)

    op.alter_column("board_versions", "version_major", nullable=False)
    op.alter_column("board_versions", "version_minor", nullable=False)
    op.alter_column("board_versions", "version_patch", nullable=False)
    op.create_index(
        "ix_games_status_auction_deadline",
        "games",
        ["status", "auction_deadline"],
    )
    op.create_index(
        "ix_games_status_active_bots",
        "games",
        ["status", "has_active_bots"],
    )


def downgrade() -> None:
    connection = op.get_bind()
    games = list(connection.execute(sa.text("SELECT id, state FROM games")).mappings())
    games_table = sa.table(
        "games",
        sa.column("id", sa.Uuid()),
        sa.column("state", sa.JSON()),
    )
    for row in games:
        events = list(
            connection.execute(
                sa.text(
                    "SELECT sequence, event_type, event_data, occurred_at "
                    "FROM game_events WHERE game_id=:game_id ORDER BY sequence"
                ),
                {"game_id": row["id"]},
            ).mappings()
        )
        state = dict(row["state"] or {})
        state.pop("event_sequence", None)
        state["events"] = [
            {
                "sequence": event["sequence"],
                "type": event["event_type"],
                "data": event["event_data"],
                "occurred_at": event["occurred_at"].isoformat(),
            }
            for event in events
        ]
        connection.execute(
            sa.update(games_table)
            .where(games_table.c.id == row["id"])
            .values(state=state)
        )

    op.drop_index("ix_games_status_active_bots", table_name="games")
    op.drop_index("ix_games_status_auction_deadline", table_name="games")
    op.drop_index("ix_processed_game_commands_game_id", table_name="processed_game_commands")
    op.drop_table("processed_game_commands")
    op.drop_index("ix_game_members_user_game", table_name="game_members")
    op.drop_table("game_members")
    op.drop_column("games", "has_active_bots")
    op.drop_column("games", "auction_deadline")
    op.drop_column("board_versions", "version_patch")
    op.drop_column("board_versions", "version_minor")
    op.drop_column("board_versions", "version_major")
