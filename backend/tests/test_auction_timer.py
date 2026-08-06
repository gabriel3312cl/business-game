import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import business_game.realtime as realtime
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
    BidCommand,
    DeclinePropertyCommand,
    RollCommand,
    UserCreate,
)


async def create_user(
    session: AsyncSession,
    email: str,
    display_name: str,
):
    return await UserService(session).register(
        UserCreate(
            email=email,
            password="correct-horse-battery",
            display_name=display_name,
        )
    )


async def test_scheduler_automatically_settles_and_broadcasts_expired_auction(
    packs_dir,
    session: AsyncSession,
    monkeypatch,
) -> None:
    clock_time = datetime.now(UTC) - timedelta(seconds=10)
    first = await create_user(session, "timer-host@example.com", "Host")
    second = await create_user(session, "timer-bidder@example.com", "Bidder")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
        clock=lambda: clock_time,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    game = await games.execute(
        game.id,
        second.id,
        BidCommand(action="bid", amount=75),
    )

    timer_sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    monkeypatch.setattr(realtime, "session_factory", timer_sessions)
    broadcasts: list[tuple[str, str]] = []

    async def record_emit(event: str, _data: dict, *, room: str) -> None:
        broadcasts.append((event, room))

    monkeypatch.setattr(realtime.sio, "emit", record_emit)
    original_settle = GameService.settle_expired_auction
    settlement_attempts = 0

    async def settle_after_transient_failure(
        service: GameService,
        game_id,
        expected_deadline,
    ):
        nonlocal settlement_attempts
        settlement_attempts += 1
        if settlement_attempts == 1:
            raise OSError("temporary database outage")
        return await original_settle(service, game_id, expected_deadline)

    monkeypatch.setattr(
        GameService,
        "settle_expired_auction",
        settle_after_transient_failure,
    )

    try:
        realtime.sync_auction_timer(game)
        timer_task = realtime.auction_timer_tasks[game.id][1]
        await asyncio.wait_for(asyncio.shield(timer_task), timeout=1)

        async with timer_sessions() as persisted_session:
            persisted = await GameService(
                persisted_session,
                PackLoader(packs_dir),
            ).get(game.id, first.id)
        assert persisted.active_auction is None
        assert persisted.owners["property_03"] == second.id
        assert persisted.players[1].balance == 1425
        assert persisted.events[-1].type == "auction.completed"
        assert settlement_attempts == 2
        assert set(broadcasts) == {
            ("game_state", f"{game.id}:member:{first.id}"),
            ("game_state", f"{game.id}:member:{second.id}"),
        }
    finally:
        await realtime.shutdown_auction_timers()


async def test_older_snapshot_cannot_replace_latest_auction_timer(
    packs_dir,
    session: AsyncSession,
) -> None:
    clock_time = datetime.now(UTC)
    first = await create_user(session, "order-host@example.com", "Host")
    second = await create_user(session, "order-bidder@example.com", "Bidder")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
        clock=lambda: clock_time,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    game = await games.execute(
        game.id,
        second.id,
        BidCommand(action="bid", amount=50),
    )
    assert game.active_auction is not None
    assert game.active_auction.bid_deadline is not None

    newer = game.model_copy(deep=True)
    assert newer.active_auction is not None
    newer.active_auction.bid_deadline += timedelta(seconds=1)
    no_deadline = game.model_copy(deep=True)
    assert no_deadline.active_auction is not None
    no_deadline.active_auction.bid_deadline = None

    try:
        realtime.sync_auction_timer(newer)
        latest_task = realtime.auction_timer_tasks[game.id]
        realtime.sync_auction_timer(game)
        realtime.sync_auction_timer(no_deadline)
        assert realtime.auction_timer_tasks[game.id] == latest_task
    finally:
        await realtime.shutdown_auction_timers()
