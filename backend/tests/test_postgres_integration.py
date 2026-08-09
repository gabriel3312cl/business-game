import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast
from uuid import uuid4

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from business_game.application.board_service import BoardProjectService, PackResolver
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.board_models import (
    BoardProjectCreate,
    BoardProjectUpdate,
    PublishBoardRequest,
)
from business_game.domain.models import (
    BidCommand,
    DeclinePropertyCommand,
    EndTurnCommand,
    MortgagePropertyCommand,
    PassAuctionCommand,
    RollCommand,
    UserCreate,
)
from business_game.infrastructure.db_models import (
    BoardProjectRecord,
    GameEventRecord,
    GameRecord,
    UserRecord,
)
from tests.test_board_projects import board_document

POSTGRES_TEST_URL = os.getenv("BUSINESS_GAME_TEST_DATABASE_URL")


@pytest.mark.skipif(
    POSTGRES_TEST_URL is None,
    reason="BUSINESS_GAME_TEST_DATABASE_URL is not configured",
)
async def test_postgres_persists_an_authoritative_auction(packs_dir: Path) -> None:
    assert POSTGRES_TEST_URL is not None
    engine = create_async_engine(POSTGRES_TEST_URL)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    user_ids = []
    game_id = None
    suffix = uuid4().hex
    current_time = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    try:
        async with sessions() as session:
            users = UserService(session)
            first = await users.register(
                UserCreate(
                    email=f"postgres-first-{suffix}@example.com",
                    password="correct-horse-battery",
                    display_name="First",
                )
            )
            second = await users.register(
                UserCreate(
                    email=f"postgres-second-{suffix}@example.com",
                    password="correct-horse-battery",
                    display_name="Second",
                )
            )
            spectator = await users.register(
                UserCreate(
                    email=f"postgres-spectator-{suffix}@example.com",
                    password="correct-horse-battery",
                    display_name="Spectator",
                )
            )
            user_ids = [first.id, second.id, spectator.id]
            games = GameService(
                session,
                PackLoader(packs_dir),
                dice_roller=lambda: (1, 2),
                clock=lambda: current_time,
            )
            game = await games.create("classic-demo", first)
            game_id = game.id
            await games.watch(game.id, spectator)
            await games.join(game.id, second)
            await games.start(game.id, first.id)
            await games.execute(game.id, first.id, RollCommand(action="roll"))
            await games.execute(
                game.id,
                first.id,
                DeclinePropertyCommand(action="decline_property"),
            )
            await games.execute(
                game.id,
                second.id,
                BidCommand(action="bid", amount=75),
            )
            game = await games.execute(
                game.id,
                first.id,
                PassAuctionCommand(action="pass_auction"),
            )
            assert game.active_auction is not None
            deadline = game.active_auction.bid_deadline
            assert deadline is not None
            current_time += timedelta(seconds=5)
            game = await games.settle_expired_auction(game.id, deadline)
            assert game is not None
            game = await games.execute(
                game.id,
                first.id,
                EndTurnCommand(action="end_turn"),
            )
            game = await games.execute(
                game.id,
                second.id,
                MortgagePropertyCommand(
                    action="mortgage_property",
                    property_id="property_03",
                ),
            )

        async with sessions() as session:
            persisted = await GameService(session, PackLoader(packs_dir)).get(
                game.id,
                second.id,
            )
            assert persisted.owners["property_03"] == second.id
            assert persisted.mortgaged_property_ids == ["property_03"]
            assert persisted.active_auction is None
            assert persisted.settings.max_players == 20
            assert persisted.settings.allow_spectators is True
            assert persisted.settings.rules.auction_unpurchased_properties
            assert persisted.pack_version == "2.0.0"
            assert persisted.spectators[0].user_id == spectator.id
            assert persisted.houses_remaining == 32
            assert persisted.hotels_remaining == 12
            assert set(persisted.deck_orders) == {"community", "opportunity"}
            assert persisted.events[-1].type == "property.mortgaged"
            assert any(event.type == "auction.completed" for event in persisted.events)
    finally:
        if game_id is not None:
            async with sessions.begin() as session:
                await session.execute(
                    delete(GameEventRecord).where(GameEventRecord.game_id == game_id)
                )
                await session.execute(delete(GameRecord).where(GameRecord.id == game_id))
        if user_ids:
            async with sessions.begin() as session:
                await session.execute(delete(UserRecord).where(UserRecord.id.in_(user_ids)))
        await engine.dispose()


@pytest.mark.skipif(
    POSTGRES_TEST_URL is None,
    reason="BUSINESS_GAME_TEST_DATABASE_URL is not configured",
)
async def test_postgres_publishes_and_snapshots_a_custom_board(
    packs_dir: Path,
) -> None:
    assert POSTGRES_TEST_URL is not None
    engine = create_async_engine(POSTGRES_TEST_URL)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    user_id = None
    project_id = None
    game_id = None
    asset_id = None
    suffix = uuid4().hex
    try:
        async with sessions() as session:
            user = await UserService(session).register(
                UserCreate(
                    email=f"board-owner-{suffix}@example.com",
                    password="correct-horse-battery",
                    display_name="Board Owner",
                )
            )
            user_id = user.id
            projects = BoardProjectService(session)
            document = board_document()
            document_tiles = cast(
                list[dict[str, object]],
                document["tiles"],
            )
            document_tiles[1]["hotel_cost"] = 275
            draft = await projects.create(
                user.id,
                BoardProjectCreate(
                    name="PostgreSQL board",
                    document=document,
                ),
            )
            project_id = draft.id
            asset = await projects.upload_asset(
                draft.id,
                user.id,
                filename="postgres.svg",
                content_type="image/svg+xml",
                payload=(
                    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
                    b'<circle cx="5" cy="5" r="4"/></svg>'
                ),
            )
            asset_id = asset.id
            document_tiles[0]["asset_path"] = asset.path
            draft = await projects.update(
                draft.id,
                user.id,
                BoardProjectUpdate(revision=draft.revision, document=document),
            )
            published = await projects.publish(
                draft.id,
                user.id,
                PublishBoardRequest(revision=draft.revision),
            )
            filesystem = PackLoader(packs_dir)
            games = GameService(
                session,
                filesystem,
                pack_resolver=PackResolver(session, filesystem),
            )
            game = await games.create(
                published.pack_id,
                user,
                published.version,
            )
            game_id = game.id

        async with sessions() as session:
            persisted = await GameService(session, PackLoader(packs_dir)).get(
                game_id,
                user_id,
            )
            assert persisted.pack_snapshot is not None
            assert persisted.pack_snapshot.manifest.schema_version == 5
            assert persisted.pack_snapshot.manifest.side_length == 5
            assert persisted.pack_snapshot.manifest.tile_count == 16
            assert persisted.pack_snapshot.board.tiles[0].asset_path == (
                f"/api/v1/board-assets/{asset_id}.svg"
            )
            snapshot_tiles = {
                tile.id: tile for tile in persisted.pack_snapshot.board.tiles
            }
            assert snapshot_tiles["tile_01"].hotel_cost == 275
            snapshot_deck = persisted.pack_snapshot.board.decks[0]
            assert snapshot_deck.name_key == "deck.opportunity.name"
            assert snapshot_deck.cards[0].title_key == "card.chain.title"
            resolved = await PackResolver(session, PackLoader(packs_dir)).load(
                persisted.pack_id,
                version=persisted.pack_version,
                locale="es",
            )
            assert resolved.messages["pack.name"] == "Mi tablero"
            assert resolved.board.tiles[1].hotel_cost == 275
            stored_asset = await BoardProjectService(session).get_asset_content(
                asset_id
            )
            assert stored_asset.content_type == "image/svg+xml"
            assert stored_asset.name == "postgres.svg"
    finally:
        if game_id is not None:
            async with sessions.begin() as session:
                await session.execute(
                    delete(GameEventRecord).where(GameEventRecord.game_id == game_id)
                )
                await session.execute(delete(GameRecord).where(GameRecord.id == game_id))
        if project_id is not None:
            async with sessions.begin() as session:
                await session.execute(
                    delete(BoardProjectRecord).where(
                        BoardProjectRecord.id == project_id
                    )
                )
        if user_id is not None:
            async with sessions.begin() as session:
                await session.execute(delete(UserRecord).where(UserRecord.id == user_id))
        await engine.dispose()
