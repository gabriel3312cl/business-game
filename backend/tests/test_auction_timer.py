import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import business_game.realtime as realtime
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
    BidCommand,
    DeclinePropertyCommand,
    ReadyAuctionCommand,
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
    game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is not None and game.active_auction.id is not None
    auction_id = game.active_auction.id
    for player_id in game.active_auction.eligible_player_ids:
        game = await games.execute(
            game.id,
            player_id,
            ReadyAuctionCommand(action="ready_auction", auction_id=auction_id),
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
        timer_task = realtime.auction_timer_tasks[game.id][2]
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
    game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is not None and game.active_auction.id is not None
    auction_id = game.active_auction.id
    for player_id in game.active_auction.eligible_player_ids:
        game = await games.execute(
            game.id,
            player_id,
            ReadyAuctionCommand(action="ready_auction", auction_id=auction_id),
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


async def test_readiness_timeout_excludes_pending_players_and_starts_bidding(
    packs_dir,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 8, 10, 12, 0, tzinfo=UTC)
    first = await create_user(session, "timeout-host@example.com", "Host")
    second = await create_user(session, "timeout-guest@example.com", "Guest")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
        clock=lambda: current_time,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is not None and game.active_auction.id is not None
    auction_id = game.active_auction.id
    readiness_deadline = game.active_auction.bid_deadline
    assert readiness_deadline == current_time + timedelta(seconds=30)

    game = await games.execute(
        game.id,
        first.id,
        ReadyAuctionCommand(action="ready_auction", auction_id=auction_id),
    )
    assert game.active_auction is not None
    assert game.active_auction.phase == "idle"

    current_time = readiness_deadline
    settled = await games.settle_expired_auction(game.id, readiness_deadline)

    assert settled is not None and settled.active_auction is not None
    assert settled.active_auction.id == auction_id
    assert settled.active_auction.phase == "bidding"
    assert settled.active_auction.ready_player_ids == [first.id]
    assert second.id in settled.active_auction.passed_player_ids
    assert settled.active_auction.bid_deadline == current_time + timedelta(seconds=5)
    timeout_event = next(
        event
        for event in reversed(settled.events)
        if event.type == "auction.player_passed"
        and event.data.get("reason") == "readiness_timeout"
    )
    assert timeout_event.data["player_id"] == str(second.id)
    assert timeout_event.data["before_bidding"] is True
    assert await games.settle_expired_auction(game.id, readiness_deadline) is None


async def test_bidding_timer_replaces_readiness_timer_for_same_auction(
    packs_dir,
    session: AsyncSession,
) -> None:
    clock_time = datetime.now(UTC)
    first = await create_user(session, "phase-host@example.com", "Host")
    second = await create_user(session, "phase-guest@example.com", "Guest")
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
    idle_game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert idle_game.active_auction is not None
    assert idle_game.active_auction.id is not None

    try:
        realtime.sync_auction_timer(idle_game)
        readiness_timer = realtime.auction_timer_tasks[idle_game.id]
        bidding_game = idle_game
        for player_id in idle_game.active_auction.eligible_player_ids:
            bidding_game = await games.execute(
                idle_game.id,
                player_id,
                ReadyAuctionCommand(
                    action="ready_auction",
                    auction_id=idle_game.active_auction.id,
                ),
            )
        realtime.sync_auction_timer(bidding_game)
        bidding_timer = realtime.auction_timer_tasks[idle_game.id]

        assert readiness_timer[1] == "idle"
        assert bidding_timer[1] == "bidding"
        assert bidding_timer[2] is not readiness_timer[2]
        assert readiness_timer[2].cancelled() or readiness_timer[2].cancelling()
    finally:
        await realtime.shutdown_auction_timers()


async def test_readiness_timeout_finishes_auction_when_nobody_confirmed(
    packs_dir,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 8, 10, 13, 0, tzinfo=UTC)
    first = await create_user(session, "empty-host@example.com", "Host")
    second = await create_user(session, "empty-guest@example.com", "Guest")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
        clock=lambda: current_time,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is not None
    readiness_deadline = game.active_auction.bid_deadline
    assert readiness_deadline is not None

    current_time = readiness_deadline
    settled = await games.settle_expired_auction(game.id, readiness_deadline)

    assert settled is not None
    assert settled.active_auction is None
    timeout_events = [
        event
        for event in settled.events
        if event.type == "auction.player_passed"
        and event.data.get("reason") == "readiness_timeout"
    ]
    assert {event.data["player_id"] for event in timeout_events} == {
        str(first.id),
        str(second.id),
    }
    completed = next(
        event for event in reversed(settled.events) if event.type == "auction.completed"
    )
    assert completed.data["winner_id"] is None
