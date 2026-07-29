import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
    BidCommand,
    DeclinePropertyCommand,
    MortgagePropertyCommand,
    PassAuctionCommand,
    RollCommand,
    UserCreate,
)
from business_game.infrastructure.db_models import (
    GameEventRecord,
    GameRecord,
    UserRecord,
)

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
            assert persisted.settings.max_players == 6
            assert persisted.settings.allow_spectators is True
            assert persisted.settings.rules.auction_unpurchased_properties
            assert persisted.pack_version == "1.3.0"
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
