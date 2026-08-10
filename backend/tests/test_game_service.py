from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError, ForbiddenError
from business_game.domain.models import (
    AcceptRentDebtPlanCommand,
    AcceptTradeCommand,
    BidCommand,
    BotPersonality,
    BuildGroupRoundCommand,
    BuildPropertyCommand,
    BuyPropertyCommand,
    ChooseCardCommand,
    ContinueCardCommand,
    CounterTradeCommand,
    DebtReason,
    DebtState,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    DemandRentDebtCommand,
    EndTurnCommand,
    ForgiveRentDebtCommand,
    GameState,
    GameStatus,
    MortgagePropertyCommand,
    OptionalRulesUpdate,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    PayRentDebtPlanCommand,
    PlayerState,
    ProposeRentDebtPlanCommand,
    ProposeTradeCommand,
    RentDebtPlanState,
    RentDebtPlanTemplate,
    RollCommand,
    SelectAuctionPropertyCommand,
    SellBuildingCommand,
    SellGroupRoundCommand,
    SetPropertyTradeAvailabilityCommand,
    TurnPhase,
    UnmortgagePropertyCommand,
    UpdateGameSettingsRequest,
    UseJailCardCommand,
    UserCreate,
)
from business_game.infrastructure.db_models import GameEventRecord
from business_game.infrastructure.repositories import GameRepository


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


async def test_first_playable_turn(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "ada@example.com", "Ada")
    second = await create_user(session, "lin@example.com", "Lin")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    game = await games.start(game.id, first.id)

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))
    assert game.players[0].position == 3
    assert game.pending_tile_id == "property_03"
    roll_event = game.events[-1]
    assert roll_event.type == "dice.rolled"
    assert roll_event.data["from_position"] == 0
    assert roll_event.data["to_position"] == 3
    assert roll_event.data["position"] == 3
    assert roll_event.data["steps"] == 3
    assert roll_event.data["movement"] == "step"

    previous_balance = game.players[0].balance
    game = await games.execute(
        game.id,
        first.id,
        BuyPropertyCommand(action="buy_property"),
    )
    assert game.owners["property_03"] == first.id
    assert game.players[0].balance < previous_balance

    game = await games.execute(
        game.id,
        first.id,
        EndTurnCommand(action="end_turn"),
    )
    assert game.current_player.user_id == second.id

    event_count = await session.scalar(select(func.count(GameEventRecord.id)))
    assert event_count == len(game.events)


async def test_human_commands_reject_stale_snapshots_and_deduplicate_retries(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "command-owner@example.com", "Owner")
    second = await create_user(session, "command-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    game = await games.start(game.id, first.id)
    expected_sequence = game.event_sequence
    command_id = uuid4()

    updated = await games.execute(
        game.id,
        first.id,
        RollCommand(action="roll"),
        expected_sequence=expected_sequence,
        command_id=command_id,
    )
    retried = await games.execute(
        game.id,
        first.id,
        RollCommand(action="roll"),
        expected_sequence=expected_sequence,
        command_id=command_id,
    )

    assert retried.event_sequence == updated.event_sequence
    assert retried.last_roll == updated.last_roll
    with pytest.raises(ConflictError, match="game changed"):
        await games.execute(
            game.id,
            first.id,
            RollCommand(action="roll"),
            expected_sequence=expected_sequence,
            command_id=uuid4(),
        )


async def test_rejects_command_from_other_player(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "ada@example.com", "Ada")
    second = await create_user(session, "lin@example.com", "Lin")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    with pytest.raises(ConflictError, match="not this player's turn"):
        await games.execute(game.id, second.id, RollCommand(action="roll"))


@pytest.mark.parametrize(
    "command",
    [
        MortgagePropertyCommand(
            action="mortgage_property",
            property_id="property_01",
        ),
        UnmortgagePropertyCommand(
            action="unmortgage_property",
            property_id="property_01",
        ),
        BuildPropertyCommand(
            action="build_property",
            property_id="property_01",
        ),
        SellBuildingCommand(
            action="sell_building",
            property_id="property_01",
        ),
    ],
)
async def test_rejects_property_management_outside_players_turn(
    packs_dir: Path,
    session: AsyncSession,
    command: (
        MortgagePropertyCommand
        | UnmortgagePropertyCommand
        | BuildPropertyCommand
        | SellBuildingCommand
    ),
) -> None:
    first = await create_user(session, "turn-owner@example.com", "Turn owner")
    second = await create_user(session, "waiting-owner@example.com", "Waiting owner")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    with pytest.raises(ConflictError, match="not this player's turn"):
        await games.execute(game.id, second.id, command)


async def test_only_host_can_start(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "host@example.com", "Host")
    guest = await create_user(session, "guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    await games.join(game.id, guest)

    with pytest.raises(ForbiddenError, match="only the host"):
        await games.start(game.id, guest.id)


async def test_existing_player_can_rejoin_started_game(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "rejoin-host@example.com", "Host")
    guest = await create_user(session, "rejoin-guest@example.com", "Guest")
    outsider = await create_user(session, "rejoin-outsider@example.com", "Outsider")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    await games.join(game.id, guest)
    await games.start(game.id, host.id)

    rejoined = await games.join(game.id, guest)
    assert len(rejoined.players) == 2
    with pytest.raises(ConflictError, match="already started"):
        await games.join(game.id, outsider)


async def test_declined_property_is_sold_by_authoritative_auction(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    first = await create_user(session, "auctioneer@example.com", "Auctioneer")
    second = await create_user(session, "bidder@example.com", "Bidder")
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
    assert game.active_auction.property_id == "property_03"
    assert game.active_auction.minimum_bid == 42
    assert game.active_auction.deposit_amount == 6

    game = await games.execute(
        game.id,
        second.id,
        BidCommand(action="bid", amount=90),
    )
    assert game.active_auction is not None
    assert game.active_auction.deposits == {second.id: 6}
    assert next(
        player for player in game.players if player.user_id == second.id
    ).balance == 1494
    deadline = game.active_auction.bid_deadline
    assert deadline == current_time + timedelta(seconds=5)
    game = await games.execute(
        game.id,
        first.id,
        PassAuctionCommand(action="pass_auction"),
    )
    assert game.active_auction is not None

    current_time += timedelta(seconds=5)
    game = await games.settle_expired_auction(game.id, deadline)
    assert game is not None
    assert game.active_auction is None
    assert game.owners["property_03"] == second.id
    assert next(player for player in game.players if player.user_id == second.id).balance == 1410
    assert game.current_player.user_id == first.id
    assert game.phase.value == "waiting_for_end"
    completed = next(
        event for event in reversed(game.events) if event.type == "auction.completed"
    )
    assert completed.data["deposit_applied"] == 6


async def test_auction_refunds_deposit_to_unsuccessful_bidder(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 8, 8, 12, 0, tzinfo=UTC)
    first = await create_user(session, "deposit-host@example.com", "Host")
    second = await create_user(session, "deposit-loser@example.com", "Loser")
    third = await create_user(session, "deposit-winner@example.com", "Winner")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
        clock=lambda: current_time,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.join(game.id, third)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        first.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is not None
    game = await games.execute(
        game.id,
        second.id,
        BidCommand(action="bid", amount=game.active_auction.minimum_bid),
    )
    assert game.active_auction is not None
    assert game.active_auction.deposits == {second.id: 6}

    game = await games.execute(
        game.id,
        third.id,
        BidCommand(action="bid", amount=50),
    )
    assert game.active_auction is not None
    deadline = game.active_auction.bid_deadline
    assert game.active_auction.deposits == {second.id: 6, third.id: 6}
    game = await games.execute(
        game.id,
        second.id,
        PassAuctionCommand(action="pass_auction"),
    )
    assert game.active_auction is not None
    assert game.active_auction.deposits == {third.id: 6}
    assert next(
        player for player in game.players if player.user_id == second.id
    ).balance == 1500
    await games.execute(
        game.id,
        first.id,
        PassAuctionCommand(action="pass_auction"),
    )

    assert deadline is not None
    current_time += timedelta(seconds=5)
    game = await games.settle_expired_auction(game.id, deadline)
    assert game is not None
    assert game.active_auction is None
    assert game.owners["property_03"] == third.id
    assert next(
        player for player in game.players if player.user_id == third.id
    ).balance == 1450
    refunded = next(
        event
        for event in game.events
        if event.type == "auction.deposit_refunded"
        and event.data["player_id"] == str(second.id)
    )
    assert refunded.data["amount"] == 6


async def test_new_bid_resets_auction_deadline_and_stale_timer_cannot_settle(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    first = await create_user(session, "reset-host@example.com", "Host")
    second = await create_user(session, "reset-bidder@example.com", "Bidder")
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
    first_deadline = game.active_auction.bid_deadline
    assert first_deadline is not None

    current_time += timedelta(seconds=4)
    game = await games.execute(
        game.id,
        first.id,
        BidCommand(action="bid", amount=60),
    )
    assert game.active_auction is not None
    second_deadline = game.active_auction.bid_deadline
    assert second_deadline == first_deadline + timedelta(seconds=4)

    current_time += timedelta(seconds=1)
    assert await games.settle_expired_auction(game.id, first_deadline) is None
    persisted = await games.get(game.id, first.id)
    assert persisted.active_auction is not None
    assert persisted.active_auction.current_bidder_id == first.id
    assert "property_03" not in persisted.owners
    await session.rollback()

    current_time += timedelta(seconds=4)
    settled = await games.settle_expired_auction(game.id, second_deadline)
    assert settled is not None
    assert settled.active_auction is None
    assert settled.owners["property_03"] == first.id
    assert "property_03" in settled.trade_unavailable_property_ids
    assert settled.players[0].balance == 1440
    bids = [event for event in settled.events if event.type == "auction.bid_placed"]
    assert [(event.data["player_id"], event.data["amount"]) for event in bids] == [
        (str(second.id), 50),
        (str(first.id), 60),
    ]


async def test_bid_at_or_after_deadline_is_rejected(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    first = await create_user(session, "late-host@example.com", "Host")
    second = await create_user(session, "late-bidder@example.com", "Bidder")
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
    deadline = game.active_auction.bid_deadline
    assert deadline is not None

    current_time = deadline
    with pytest.raises(ConflictError, match="bidding window has expired"):
        await games.execute(
            game.id,
            first.id,
            BidCommand(action="bid", amount=60),
        )

    settled = await games.settle_expired_auction(game.id, deadline)
    assert settled is not None
    assert settled.owners["property_03"] == second.id
    assert "property_03" in settled.trade_unavailable_property_ids
    assert settled.players[1].balance == 1450


async def test_auction_can_finish_without_a_bid(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "first-pass@example.com", "First")
    second = await create_user(session, "second-pass@example.com", "Second")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
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
        first.id,
        PassAuctionCommand(action="pass_auction"),
    )
    game = await games.execute(
        game.id,
        second.id,
        PassAuctionCommand(action="pass_auction"),
    )

    assert game.active_auction is None
    assert "property_03" not in game.owners
    assert game.events[-1].type == "auction.completed"
    assert game.events[-1].data["winner_id"] is None


async def test_trade_revalidates_and_transfers_assets_atomically(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "seller@example.com", "Seller")
    second = await create_user(session, "buyer@example.com", "Buyer")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        first.id,
        BuyPropertyCommand(action="buy_property"),
    )
    seller_balance_after_purchase = game.players[0].balance
    game = await games.execute(
        game.id,
        first.id,
        SetPropertyTradeAvailabilityCommand(
            action="set_property_trade_availability",
            property_id="property_03",
            available=True,
        ),
    )

    game = await games.execute(
        game.id,
        first.id,
        ProposeTradeCommand(
            action="propose_trade",
            recipient_id=second.id,
            offered_property_ids=["property_03"],
            requested_cash=125,
        ),
    )
    trade = game.trades[-1]
    with pytest.raises(ForbiddenError, match="only the recipient"):
        await games.execute(
            game.id,
            first.id,
            AcceptTradeCommand(action="accept_trade", trade_id=trade.id),
        )

    game = await games.execute(
        game.id,
        second.id,
        AcceptTradeCommand(action="accept_trade", trade_id=trade.id),
    )
    seller = next(player for player in game.players if player.user_id == first.id)
    buyer = next(player for player in game.players if player.user_id == second.id)
    assert game.owners["property_03"] == second.id
    assert "property_03" in game.trade_unavailable_property_ids
    assert seller.balance == seller_balance_after_purchase + 125
    assert buyer.balance == 1500 - 125
    assert game.trades[-1].status.value == "accepted"


async def test_property_owner_controls_trade_availability(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    owner = await create_user(session, "trade-owner@example.com", "Owner")
    other = await create_user(session, "trade-other@example.com", "Other")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", owner)
    await games.join(game.id, other)
    await games.start(game.id, owner.id)
    await games.execute(game.id, owner.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        owner.id,
        BuyPropertyCommand(action="buy_property"),
    )

    assert game.trade_unavailable_property_ids == ["property_03"]

    with pytest.raises(ForbiddenError, match="only the property owner"):
        await games.execute(
            game.id,
            other.id,
            SetPropertyTradeAvailabilityCommand(
                action="set_property_trade_availability",
                property_id="property_03",
                available=True,
            ),
        )

    with pytest.raises(ConflictError, match="requested property is unavailable"):
        await games.execute(
            game.id,
            other.id,
            ProposeTradeCommand(
                action="propose_trade",
                recipient_id=owner.id,
                offered_cash=100,
                requested_property_ids=["property_03"],
            ),
        )

    with pytest.raises(ConflictError, match="offered property is unavailable"):
        await games.execute(
            game.id,
            owner.id,
            ProposeTradeCommand(
                action="propose_trade",
                recipient_id=other.id,
                requested_cash=100,
                offered_property_ids=["property_03"],
            ),
        )

    game = await games.execute(
        game.id,
        owner.id,
        SetPropertyTradeAvailabilityCommand(
            action="set_property_trade_availability",
            property_id="property_03",
            available=True,
        ),
    )
    assert game.events[-1].type == "property.trade_availability_changed"
    assert game.events[-1].data["available"] is True
    game = await games.execute(
        game.id,
        other.id,
        ProposeTradeCommand(
            action="propose_trade",
            recipient_id=owner.id,
            offered_cash=100,
            requested_property_ids=["property_03"],
        ),
    )

    assert game.trade_unavailable_property_ids == []
    assert game.trades[-1].requested_property_ids == ["property_03"]


async def test_recipient_can_replace_a_pending_trade_with_a_counter_offer(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "counter-first@example.com", "First")
    second = await create_user(session, "counter-second@example.com", "Second")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    game = await games.start(game.id, first.id)
    game = await games.execute(
        game.id,
        first.id,
        ProposeTradeCommand(
            action="propose_trade",
            recipient_id=second.id,
            offered_cash=100,
        ),
    )
    original = game.trades[-1]

    game = await games.execute(
        game.id,
        second.id,
        CounterTradeCommand(
            action="counter_trade",
            trade_id=original.id,
            requested_cash=140,
        ),
    )

    assert game.trades[-2].status.value == "rejected"
    assert game.trades[-1].parent_trade_id == original.id
    assert game.trades[-1].proposer_id == second.id
    assert game.trades[-1].recipient_id == first.id
    assert game.trades[-1].requested_cash == 140
    assert game.events[-1].type == "trade.countered"


async def test_mortgage_and_unmortgage_use_pack_values(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "mortgage@example.com", "Owner")
    second = await create_user(session, "mortgage-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    await games.execute(game.id, first.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        first.id,
        BuyPropertyCommand(action="buy_property"),
    )
    balance_after_purchase = game.players[0].balance

    game = await games.execute(
        game.id,
        first.id,
        MortgagePropertyCommand(
            action="mortgage_property",
            property_id="property_03",
        ),
    )
    assert game.players[0].balance == balance_after_purchase + 30
    assert game.mortgaged_property_ids == ["property_03"]

    game = await games.execute(
        game.id,
        first.id,
        UnmortgagePropertyCommand(
            action="unmortgage_property",
            property_id="property_03",
        ),
    )
    assert game.players[0].balance == balance_after_purchase - 3
    assert game.mortgaged_property_ids == []


async def test_buildings_must_be_bought_and_sold_evenly(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "builder@example.com", "Builder")
    second = await create_user(session, "builder-guest@example.com", "Guest")
    packs = PackLoader(packs_dir)
    games = GameService(session, packs)
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    group_ids = [
        tile.id
        for tile in packs.load("classic-demo").board.tiles
        if tile.group == "light_blue"
    ]
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        for property_id in group_ids:
            persisted.owners[property_id] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        first.id,
        BuildPropertyCommand(action="build_property", property_id=group_ids[0]),
    )
    assert game.building_levels[group_ids[0]] == 1

    with pytest.raises(ConflictError, match="distributed evenly"):
        await games.execute(
            game.id,
            first.id,
            BuildPropertyCommand(action="build_property", property_id=group_ids[0]),
        )
    with pytest.raises(ConflictError, match="buildings in the group"):
        await games.execute(
            game.id,
            first.id,
            MortgagePropertyCommand(
                action="mortgage_property",
                property_id=group_ids[1],
            ),
        )

    game = await games.execute(
        game.id,
        first.id,
        SellBuildingCommand(action="sell_building", property_id=group_ids[0]),
    )
    assert group_ids[0] not in game.building_levels


async def test_group_build_and_sell_rounds_complete_the_next_even_level(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "group-builder@example.com", "Builder")
    second = await create_user(session, "group-builder-guest@example.com", "Guest")
    packs = PackLoader(packs_dir)
    games = GameService(session, packs)
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    group_id = "light_blue"
    group_tiles = [
        tile for tile in packs.load("classic-demo").board.tiles if tile.group == group_id
    ]
    group_ids = [tile.id for tile in group_tiles]
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        for property_id in group_ids:
            persisted.owners[property_id] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    starting_balance = game.players[0].balance
    game = await games.execute(
        game.id,
        first.id,
        BuildGroupRoundCommand(action="build_group_round", group_id=group_id),
    )
    assert {game.building_levels[property_id] for property_id in group_ids} == {1}
    assert game.players[0].balance == starting_balance - sum(
        tile.build_cost or 0 for tile in group_tiles
    )

    game = await games.execute(
        game.id,
        first.id,
        BuildPropertyCommand(action="build_property", property_id=group_ids[0]),
    )
    game = await games.execute(
        game.id,
        first.id,
        BuildGroupRoundCommand(action="build_group_round", group_id=group_id),
    )
    assert {game.building_levels[property_id] for property_id in group_ids} == {2}

    balance_before_sale = game.players[0].balance
    game = await games.execute(
        game.id,
        first.id,
        SellGroupRoundCommand(action="sell_group_round", group_id=group_id),
    )
    expected_refund = sum(
        (tile.build_cost or 0) * packs.load("classic-demo").manifest.building_sell_percent
        // 100
        for tile in group_tiles
    )
    assert {game.building_levels[property_id] for property_id in group_ids} == {1}
    assert game.players[0].balance == balance_before_sale + expected_refund


async def test_group_build_round_rejects_the_whole_purchase_when_cash_is_short(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "group-atomic@example.com", "Builder")
    second = await create_user(session, "group-atomic-guest@example.com", "Guest")
    packs = PackLoader(packs_dir)
    games = GameService(session, packs)
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    group_id = "light_blue"
    group_ids = [
        tile.id for tile in packs.load("classic-demo").board.tiles if tile.group == group_id
    ]
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 149
        for property_id in group_ids:
            persisted.owners[property_id] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    with pytest.raises(ConflictError, match="insufficient balance for the property group"):
        await games.execute(
            game.id,
            first.id,
            BuildGroupRoundCommand(action="build_group_round", group_id=group_id),
        )

    persisted = await games.get(game.id, first.id)
    assert persisted.players[0].balance == 149
    assert not any(property_id in persisted.building_levels for property_id in group_ids)


async def test_group_round_converts_houses_and_hotels_for_the_whole_group(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "group-hotels@example.com", "Builder")
    second = await create_user(session, "group-hotels-guest@example.com", "Guest")
    packs = PackLoader(packs_dir)
    games = GameService(session, packs)
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    group_id = "light_blue"
    group_ids = [
        tile.id for tile in packs.load("classic-demo").board.tiles if tile.group == group_id
    ]
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        for property_id in group_ids:
            persisted.owners[property_id] = first.id
            persisted.building_levels[property_id] = 4
        persisted.houses_remaining = 0
        persisted.hotels_remaining = len(group_ids)
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        first.id,
        BuildGroupRoundCommand(action="build_group_round", group_id=group_id),
    )
    assert {game.building_levels[property_id] for property_id in group_ids} == {5}
    assert game.houses_remaining == len(group_ids) * 4
    assert game.hotels_remaining == 0

    game = await games.execute(
        game.id,
        first.id,
        SellGroupRoundCommand(action="sell_group_round", group_id=group_id),
    )
    assert {game.building_levels[property_id] for property_id in group_ids} == {4}
    assert game.houses_remaining == 0
    assert game.hotels_remaining == len(group_ids)


async def test_debt_can_be_paid_after_mortgaging_assets(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "debtor@example.com", "Debtor")
    second = await create_user(session, "debt-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (2, 2))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 5
        persisted.owners["property_01"] = first.id
        persisted.owners["property_03"] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))
    assert game.active_debt is not None
    assert game.active_debt.amount == 12
    debt_tile_id = game.active_debt.tile_id

    game = await games.execute(
        game.id,
        first.id,
        MortgagePropertyCommand(action="mortgage_property", property_id="property_01"),
    )
    assert game.players[0].balance == 35

    game = await games.execute(
        game.id,
        first.id,
        PayDebtCommand(action="pay_debt"),
    )
    assert game.active_debt is None
    assert game.players[0].balance == 23
    debt_paid = next(event for event in reversed(game.events) if event.type == "debt.paid")
    assert debt_paid.data["tile_id"] == debt_tile_id


async def test_rent_debt_can_be_forgiven_by_creditor_when_enabled(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "forgive-creditor@example.com", "Creditor")
    debtor = await create_user(session, "forgive-debtor@example.com", "Debtor")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    game = await games.update_settings(
        game.id,
        creditor.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(custom_rent_debts_enabled=True)
        ),
    )
    assert game.settings.rules.custom_rent_debts_enabled
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=120,
            reason=DebtReason.RENT,
            tile_id="property_03",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    with pytest.raises(ForbiddenError, match="only the rent creditor"):
        await games.execute(
            game.id,
            debtor.id,
            ForgiveRentDebtCommand(action="forgive_rent_debt"),
        )

    game = await games.execute(
        game.id,
        creditor.id,
        ForgiveRentDebtCommand(action="forgive_rent_debt"),
    )
    assert game.active_debt is None
    assert game.events[-1].type == "debt.forgiven"
    assert game.events[-1].data["amount"] == 120


async def test_custom_rent_debt_waits_for_creditor_to_demand_payment(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "demand-creditor@example.com", "Creditor")
    debtor = await create_user(session, "demand-debtor@example.com", "Debtor")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.update_settings(
        game.id,
        creditor.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(custom_rent_debts_enabled=True)
        ),
    )
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].balance = 100
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=50,
            reason=DebtReason.RENT,
            tile_id="property_03",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    with pytest.raises(ConflictError, match="creditor must choose"):
        await games.execute(
            game.id,
            debtor.id,
            PayDebtCommand(action="pay_debt"),
        )

    game = await games.execute(
        game.id,
        creditor.id,
        DemandRentDebtCommand(action="demand_rent_debt"),
    )
    assert game.active_debt is not None
    assert game.active_debt.collection_demanded

    game = await games.execute(
        game.id,
        debtor.id,
        PayDebtCommand(action="pay_debt"),
    )
    assert game.active_debt is None
    assert game.players[1].balance == 50


async def test_accepted_rent_plan_collects_installments_on_future_turns(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "plan-creditor@example.com", "Creditor")
    debtor = await create_user(session, "plan-debtor@example.com", "Debtor")
    pack = PackLoader(packs_dir).load("classic-demo")
    requested_property_id = next(
        tile.id for tile in pack.board.tiles if tile.is_purchasable
    )
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.update_settings(
        game.id,
        creditor.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(custom_rent_debts_enabled=True)
        ),
    )
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.owners[requested_property_id] = debtor.id
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=100,
            reason=DebtReason.RENT,
            tile_id="property_03",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        creditor.id,
        ProposeRentDebtPlanCommand(
            action="propose_rent_debt_plan",
            installments=2,
            interest_percent=0,
            template=RentDebtPlanTemplate.FRIENDLY,
        ),
    )
    assert game.active_debt is not None
    assert game.active_debt.plan_proposal is not None
    assert game.active_debt.plan_proposal.installments == 2

    game = await games.execute(
        game.id,
        creditor.id,
        ProposeRentDebtPlanCommand(
            action="propose_rent_debt_plan",
            installments=3,
            interest_percent=10,
            template=RentDebtPlanTemplate.CUSTOM,
            requested_property_ids=[requested_property_id],
        ),
    )
    assert game.active_debt is not None
    assert game.active_debt.plan_proposal is not None
    assert game.active_debt.plan_proposal.installments == 3

    game = await games.execute(
        game.id,
        debtor.id,
        AcceptRentDebtPlanCommand(action="accept_rent_debt_plan"),
    )
    assert game.active_debt is None
    assert len(game.rent_debt_plans) == 1
    assert game.rent_debt_plans[0].total_amount == 110
    assert game.owners[requested_property_id] == creditor.id

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 0
        persisted.phase = TurnPhase.WAITING_FOR_END
        persisted.players[1].balance = 100
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        creditor.id,
        EndTurnCommand(action="end_turn"),
    )
    plan = game.rent_debt_plans[0]
    assert game.current_player.user_id == debtor.id
    assert game.active_debt is None
    assert plan.remaining_amount == 73
    assert plan.installments_remaining == 2
    assert game.players[1].balance == 63
    assert any(event.type == "debt.installment_paid" for event in game.events)


async def test_debtor_can_pay_or_settle_an_accepted_rent_plan_early(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "early-creditor@example.com", "Creditor")
    debtor = await create_user(session, "early-debtor@example.com", "Debtor")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.start(game.id, creditor.id)
    plan = RentDebtPlanState(
        debtor_id=debtor.id,
        creditor_id=creditor.id,
        tile_id="property_03",
        original_amount=100,
        interest_percent=10,
        total_amount=110,
        remaining_amount=110,
        installments_total=3,
        installments_remaining=3,
        template=RentDebtPlanTemplate.CUSTOM,
        created_at_sequence=game.event_sequence,
    )
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].balance = 200
        persisted.rent_debt_plans.append(plan)
        await GameRepository(session).save(persisted, len(persisted.events))

    with pytest.raises(ForbiddenError, match="only the debtor"):
        await games.execute(
            game.id,
            creditor.id,
            PayRentDebtPlanCommand(
                action="pay_rent_debt_plan",
                plan_id=plan.id,
                payment_kind="installment",
            ),
        )

    game = await games.execute(
        game.id,
        debtor.id,
        PayRentDebtPlanCommand(
            action="pay_rent_debt_plan",
            plan_id=plan.id,
            payment_kind="installment",
        ),
    )
    active_plan = game.rent_debt_plans[0]
    assert game.players[1].balance == 163
    assert active_plan.remaining_amount == 73
    assert active_plan.installments_remaining == 2

    game = await games.execute(
        game.id,
        debtor.id,
        PayRentDebtPlanCommand(
            action="pay_rent_debt_plan",
            plan_id=plan.id,
            payment_kind="full",
        ),
    )
    assert game.players[1].balance == 90
    assert game.rent_debt_plans == []
    assert game.events[-1].type == "debt.plan_completed"


async def test_rent_debt_can_be_settled_with_multiple_properties(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(
        session,
        "property-settlement-creditor@example.com",
        "Creditor",
    )
    debtor = await create_user(
        session,
        "property-settlement-debtor@example.com",
        "Debtor",
    )
    pack = PackLoader(packs_dir).load("classic-demo")
    property_ids = [tile.id for tile in pack.board.tiles if tile.is_purchasable][:2]
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.update_settings(
        game.id,
        creditor.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(custom_rent_debts_enabled=True)
        ),
    )
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        for property_id in property_ids:
            persisted.owners[property_id] = debtor.id
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=100,
            reason=DebtReason.RENT,
            tile_id="property_03",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        creditor.id,
        ProposeRentDebtPlanCommand(
            action="propose_rent_debt_plan",
            installments=0,
            interest_percent=0,
            template=RentDebtPlanTemplate.CUSTOM,
            requested_property_ids=property_ids,
        ),
    )
    assert game.active_debt is not None
    assert game.active_debt.plan_proposal is not None
    assert game.active_debt.plan_proposal.requested_property_ids == property_ids

    game = await games.execute(
        game.id,
        debtor.id,
        AcceptRentDebtPlanCommand(action="accept_rent_debt_plan"),
    )
    assert game.active_debt is None
    assert game.rent_debt_plans == []
    assert all(game.owners[property_id] == creditor.id for property_id in property_ids)
    assert set(property_ids).issubset(game.trade_unavailable_property_ids)
    accepted = game.events[-1]
    assert accepted.type == "debt.plan_accepted"
    assert accepted.data["requested_property_ids"] == property_ids


async def test_overdue_rent_plan_waits_for_creditor_and_can_be_renegotiated(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(
        session,
        "renegotiate-creditor@example.com",
        "Creditor",
    )
    debtor = await create_user(
        session,
        "renegotiate-debtor@example.com",
        "Debtor",
    )
    pack = PackLoader(packs_dir).load("classic-demo")
    requested_property_id = next(
        tile.id for tile in pack.board.tiles if tile.is_purchasable
    )
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.update_settings(
        game.id,
        creditor.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(custom_rent_debts_enabled=True)
        ),
    )
    await games.start(game.id, creditor.id)
    original_plan = RentDebtPlanState(
        debtor_id=debtor.id,
        creditor_id=creditor.id,
        tile_id="property_03",
        original_amount=100,
        interest_percent=20,
        total_amount=120,
        remaining_amount=90,
        installments_total=4,
        installments_remaining=3,
        template=RentDebtPlanTemplate.CUSTOM,
        created_at_sequence=game.event_sequence,
    )
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 0
        persisted.phase = TurnPhase.WAITING_FOR_END
        persisted.players[1].balance = 0
        persisted.owners[requested_property_id] = debtor.id
        persisted.rent_debt_plans.append(original_plan)
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        creditor.id,
        EndTurnCommand(action="end_turn"),
    )
    assert game.active_debt is not None
    assert game.active_debt.reason is DebtReason.RENT_INSTALLMENT
    assert game.active_debt.amount == 30
    assert not game.active_debt.collection_demanded

    with pytest.raises(ConflictError, match="creditor must choose"):
        await games.execute(
            game.id,
            debtor.id,
            PayDebtCommand(action="pay_debt"),
        )

    game = await games.execute(
        game.id,
        creditor.id,
        ProposeRentDebtPlanCommand(
            action="propose_rent_debt_plan",
            installments=2,
            interest_percent=0,
            template=RentDebtPlanTemplate.FRIENDLY,
            requested_property_ids=[requested_property_id],
        ),
    )
    proposed = game.events[-1]
    assert proposed.type == "debt.plan_proposed"
    assert proposed.data["original_amount"] == 90
    assert proposed.data["total_amount"] == 90

    game = await games.execute(
        game.id,
        debtor.id,
        AcceptRentDebtPlanCommand(action="accept_rent_debt_plan"),
    )
    assert game.active_debt is None
    assert len(game.rent_debt_plans) == 1
    replacement = game.rent_debt_plans[0]
    assert replacement.id != original_plan.id
    assert replacement.original_amount == 90
    assert replacement.remaining_amount == 90
    assert replacement.installments_remaining == 2
    assert game.owners[requested_property_id] == creditor.id
    assert game.events[-1].data["replaced_plan_id"] == str(original_plan.id)


async def test_bankruptcy_transfers_assets_and_finishes_two_player_game(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "creditor@example.com", "Creditor")
    debtor = await create_user(session, "bankrupt@example.com", "Debtor")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 1
        persisted.players[1].balance = 50
        persisted.owners["property_03"] = creditor.id
        persisted.building_levels["property_03"] = 5
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(game.id, debtor.id, RollCommand(action="roll"))
    assert game.active_debt is not None
    assert game.active_debt.creditor_id == creditor.id

    game = await games.execute(
        game.id,
        debtor.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )
    assert game.status.value == "finished"
    assert game.players[1].bankrupt
    assert game.players[1].balance == 0
    assert game.players[0].balance == 1550
    assert game.events[-1].type == "game.finished"


async def test_bankruptcy_liquidates_bot_assets_and_caps_creditor_recovery(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "liquidation-creditor@example.com", "Creditor")
    debtor = await create_user(session, "liquidation-bot@example.com", "Debtor Bot")
    bidder = await create_user(session, "liquidation-bidder@example.com", "Bidder")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.join(game.id, bidder)
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].is_bot = True
        persisted.players[1].bot_personality = BotPersonality.BALANCED
        persisted.players[1].balance = 40
        persisted.owners["property_01"] = debtor.id
        persisted.owners["property_03"] = debtor.id
        persisted.mortgaged_property_ids = ["property_03"]
        persisted.trade_unavailable_property_ids = ["property_01"]
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=200,
            reason=DebtReason.RENT,
            tile_id="property_06",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        debtor.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )

    assert game.players[1].is_bot
    assert game.players[1].bankrupt
    assert game.players[1].balance == 0
    assert game.players[0].balance == 1570
    assert "property_01" not in game.owners
    assert "property_03" not in game.owners
    assert game.mortgaged_property_ids == []
    assert game.trade_unavailable_property_ids == []
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_01"
    assert game.bank_auction_queue == ["property_03"]
    bankruptcy = next(event for event in game.events if event.type == "player.bankrupt")
    assert bankruptcy.data["transferred_amount"] == 70
    assert bankruptcy.data["unpaid_amount"] == 130
    assert bankruptcy.data["liquidated_property_amount"] == 30


async def test_liquidation_that_covers_debt_keeps_player_active(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "solvent-creditor@example.com", "Creditor")
    debtor = await create_user(session, "solvent-debtor@example.com", "Debtor")
    bidder = await create_user(session, "solvent-bidder@example.com", "Bidder")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.join(game.id, bidder)
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].balance = 20
        persisted.owners["property_03"] = debtor.id
        persisted.owners["property_06"] = debtor.id
        persisted.mortgaged_property_ids = ["property_03"]
        persisted.building_levels["property_06"] = 1
        persisted.houses_remaining -= 1
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=80,
            reason=DebtReason.RENT,
            tile_id="property_08",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        debtor.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )

    assert not game.players[1].bankrupt
    assert game.players[1].balance == 15
    assert game.players[0].balance == 1580
    assert game.active_debt is None
    assert game.houses_remaining == 32
    assert "property_03" not in game.owners
    assert "property_06" not in game.owners
    assert game.mortgaged_property_ids == []
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_03"
    assert debtor.id not in game.active_auction.eligible_player_ids
    assert set(game.active_auction.eligible_player_ids) == {creditor.id, bidder.id}
    assert game.bank_auction_queue == ["property_06"]
    assert game.bank_auction_excluded_player_ids == {"property_06": debtor.id}
    with pytest.raises(ConflictError, match="cannot participate"):
        await games.execute(
            game.id,
            debtor.id,
            BidCommand(action="bid", amount=1),
        )
    payment = next(event for event in game.events if event.type == "debt.paid")
    assert payment.data["liquidation"] is True
    assert payment.data["amount"] == 80
    assert payment.data["liquidated_building_amount"] == 25
    assert payment.data["liquidated_property_amount"] == 50


async def test_board_history_aggregates_all_previous_started_games_for_pack(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "history-host@example.com", "History Host")
    guest = await create_user(session, "history-guest@example.com", "History Guest")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
    )
    historical = await games.create("classic-demo", host)
    await games.join(historical.id, guest)
    await games.start(historical.id, host.id)
    historical = await games.execute(
        historical.id,
        host.id,
        RollCommand(action="roll"),
    )
    assert historical.pending_tile_id == "property_03"
    await games.execute(
        historical.id,
        host.id,
        BuyPropertyCommand(action="buy_property"),
    )
    await games.execute(
        historical.id,
        host.id,
        EndTurnCommand(action="end_turn"),
    )
    await games.execute(
        historical.id,
        guest.id,
        RollCommand(action="roll"),
    )

    current = await games.create("classic-demo", host)
    await games.join(current.id, guest)
    await games.start(current.id, host.id)
    await games.execute(current.id, host.id, RollCommand(action="roll"))
    history = await games.board_history(current.id, host.id)
    property_stats = next(
        item for item in history.properties if item.tile_id == "property_03"
    )

    assert history.game_count == 1
    assert history.movement_count == 2
    assert history.position_landings[3] == 2
    assert property_stats.landings == 2
    assert property_stats.landing_percent == 100
    assert property_stats.purchases == 1
    assert property_stats.average_purchase_price == 60
    assert property_stats.rent_payments == 1
    assert property_stats.total_rent == 4
    assert property_stats.average_rent == 4


async def test_surviving_debtor_is_excluded_when_only_one_bidder_remains(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    creditor = await create_user(session, "single-creditor@example.com", "Creditor")
    debtor = await create_user(session, "single-debtor@example.com", "Debtor")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", creditor)
    await games.join(game.id, debtor)
    await games.start(game.id, creditor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].balance = 0
        persisted.owners["property_01"] = debtor.id
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            creditor_id=creditor.id,
            amount=20,
            reason=DebtReason.RENT,
            tile_id="property_03",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        debtor.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )

    assert not game.players[1].bankrupt
    assert game.active_auction is not None
    assert game.active_auction.eligible_player_ids == [creditor.id]
    game = await games.execute(
        game.id,
        creditor.id,
        PassAuctionCommand(action="pass_auction"),
    )
    assert game.active_auction is None
    assert "property_01" not in game.owners


async def test_three_consecutive_doubles_send_player_to_jail(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "doubles@example.com", "Doubles")
    second = await create_user(session, "doubles-guest@example.com", "Guest")
    rolls = iter([(5, 5), (5, 5), (5, 5)])
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: next(rolls),
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    for _ in range(2):
        game = await games.execute(game.id, first.id, RollCommand(action="roll"))
        game = await games.execute(
            game.id,
            first.id,
            EndTurnCommand(action="end_turn"),
        )
        assert game.current_player.user_id == first.id

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))

    assert game.players[0].in_jail
    assert game.players[0].position == 10
    assert game.phase.value == "waiting_for_end"
    roll_event = game.events[-2]
    assert roll_event.type == "dice.rolled"
    assert roll_event.data["from_position"] == 20
    assert roll_event.data["to_position"] == 20
    assert roll_event.data["position"] == 20
    assert roll_event.data["steps"] == 0
    assert roll_event.data["movement"] == "step"
    assert game.events[-1].type == "jail.entered"
    assert game.events[-1].data["reason"] == "consecutive_doubles"
    assert game.events[-1].data["from_position"] == 20
    assert game.events[-1].data["to_position"] == 10
    assert game.events[-1].data["position"] == 10
    assert game.events[-1].data["steps"] == 0
    assert game.events[-1].data["movement"] == "teleport"


async def test_jail_can_be_left_with_fine_or_held_card(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "jail@example.com", "Jailed")
    second = await create_user(session, "jail-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].in_jail = True
        persisted.players[0].position = 10
        persisted.players[0].jail_card_ids = ["opportunity_jail_free"]
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        first.id,
        UseJailCardCommand(action="use_jail_card"),
    )
    assert not game.players[0].in_jail
    assert game.players[0].jail_card_ids == []

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].in_jail = True
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        first.id,
        PayJailFineCommand(action="pay_jail_fine"),
    )
    assert not game.players[0].in_jail
    assert game.players[0].balance == 1450


async def test_card_draw_order_and_effect_are_persisted(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "cards@example.com", "Cards")
    second = await create_user(session, "cards-guest@example.com", "Guest")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (3, 4),
        card_shuffler=lambda card_ids: (
            [
                "opportunity_crossword",
                *[
                    card_id
                    for card_id in card_ids
                    if card_id != "opportunity_crossword"
                ],
            ]
            if "opportunity_crossword" in card_ids
            else card_ids
        ),
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))

    assert game.last_card_id is None
    assert game.pending_card_draw is not None
    assert game.pending_card_draw.card_id is None
    assert game.players[0].balance == 1500
    assert game.deck_cursors["opportunity"] == 0
    assert game.events[-1].type == "card.selection_started"

    game = await games.execute(
        game.id,
        first.id,
        ChooseCardCommand(action="choose_card", card_index=0),
    )

    assert game.last_card_id == "opportunity_crossword"
    assert game.pending_card_draw is not None
    assert game.pending_card_draw.card_id == "opportunity_crossword"
    assert game.deck_cursors["opportunity"] == 1
    assert game.events[-1].type == "card.drawn"

    persisted = await games.execute(
        game.id,
        first.id,
        ContinueCardCommand(action="continue_card"),
    )

    assert persisted.pending_card_draw is None
    assert persisted.players[0].balance == 1600
    assert persisted.events[-2].type == "card.continued"
    assert persisted.events[-1].type == "card.cash_applied"


async def test_building_inventory_is_consumed_and_returned(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "supply@example.com", "Builder")
    second = await create_user(session, "supply-guest@example.com", "Guest")
    packs = PackLoader(packs_dir)
    games = GameService(session, packs)
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    group_ids = [
        tile.id
        for tile in packs.load("classic-demo").board.tiles
        if tile.group == "light_blue"
    ]
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        for property_id in group_ids:
            persisted.owners[property_id] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        first.id,
        BuildPropertyCommand(action="build_property", property_id=group_ids[0]),
    )
    assert game.houses_remaining == 31
    game = await games.execute(
        game.id,
        first.id,
        SellBuildingCommand(action="sell_building", property_id=group_ids[0]),
    )
    assert game.houses_remaining == 32

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.houses_remaining = 0
        await GameRepository(session).save(persisted, len(persisted.events))
    with pytest.raises(ConflictError, match="no houses"):
        await games.execute(
            game.id,
            first.id,
            BuildPropertyCommand(action="build_property", property_id=group_ids[0]),
        )


async def test_bankruptcy_to_bank_starts_sequential_property_auctions(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    current_time = datetime(2026, 7, 29, 12, 0, tzinfo=UTC)
    debtor = await create_user(session, "bank-debtor@example.com", "Debtor")
    bidder = await create_user(session, "bank-bidder@example.com", "Bidder")
    other = await create_user(session, "bank-other@example.com", "Other")
    games = GameService(
        session,
        PackLoader(packs_dir),
        clock=lambda: current_time,
    )
    game = await games.create("classic-demo", debtor)
    await games.join(game.id, bidder)
    await games.join(game.id, other)
    await games.start(game.id, debtor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 0
        persisted.owners["property_01"] = debtor.id
        persisted.owners["property_03"] = debtor.id
        persisted.active_debt = DebtState(
            debtor_id=debtor.id,
            amount=500,
            reason=DebtReason.TAX,
            tile_id="tax_04",
        )
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game.id,
        debtor.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_01"
    assert game.bank_auction_queue == ["property_03"]

    await games.execute(
        game.id,
        bidder.id,
        PassAuctionCommand(action="pass_auction"),
    )
    game = await games.execute(
        game.id,
        other.id,
        PassAuctionCommand(action="pass_auction"),
    )
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_03"

    await games.execute(
        game.id,
        bidder.id,
        BidCommand(action="bid", amount=100),
    )
    game = await games.execute(
        game.id,
        other.id,
        PassAuctionCommand(action="pass_auction"),
    )
    assert game.active_auction is not None
    deadline = game.active_auction.bid_deadline
    assert deadline is not None
    current_time += timedelta(seconds=5)
    game = await games.settle_expired_auction(game.id, deadline)
    assert game is not None
    assert game.active_auction is None
    assert game.bank_auction_queue == []
    assert game.owners["property_03"] == bidder.id


async def test_lobby_settings_control_players_and_spectators(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "settings-host@example.com", "Host")
    guest = await create_user(session, "settings-guest@example.com", "Guest")
    outsider = await create_user(
        session,
        "settings-outsider@example.com",
        "Outsider",
    )
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(max_players=20),
    )
    assert game.settings.max_players == 20
    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(
            max_players=2,
            allow_spectators=False,
            auction_deposit_percent=15,
            auction_minimum_bid_percent=75,
        ),
    )
    assert game.settings.max_players == 2
    assert not game.settings.allow_spectators
    assert game.settings.auction_deposit_percent == 15
    assert game.settings.auction_minimum_bid_percent == 75

    await games.join(game.id, guest)
    with pytest.raises(ConflictError, match="full"):
        await games.join(game.id, outsider)
    with pytest.raises(ConflictError, match="disabled"):
        await games.watch(game.id, outsider)
    with pytest.raises(ForbiddenError, match="only the host"):
        await games.update_settings(
            game.id,
            guest.id,
            UpdateGameSettingsRequest(max_players=3),
        )


async def test_spectator_can_reconnect_but_cannot_issue_commands(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "watch-host@example.com", "Host")
    viewer = await create_user(session, "watch-viewer@example.com", "Viewer")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)

    game = await games.watch(game.id, viewer)
    assert game.spectators[0].user_id == viewer.id
    assert (await games.get(game.id, viewer.id)).id == game.id
    await session.rollback()
    with pytest.raises(ForbiddenError, match="participant"):
        await games.execute(game.id, viewer.id, RollCommand(action="roll"))

    game = await games.leave(game.id, viewer.id)
    assert game.spectators == []
    assert game.events[-1].type == "spectator.left"


async def test_lobby_host_leave_transfers_host_and_can_cancel_empty_room(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "leave-host@example.com", "Host")
    guest = await create_user(session, "leave-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    await games.join(game.id, guest)

    game = await games.leave(game.id, host.id)
    assert game.host_user_id == guest.id
    assert [player.user_id for player in game.players] == [guest.id]
    assert game.events[-1].type == "host.transferred"

    game = await games.leave(game.id, guest.id)
    assert game.status.value == "cancelled"
    assert game.players == []
    assert game.events[-1].type == "game.cancelled"


async def test_resignation_liquidates_assets_and_advances_the_turn(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "resign-first@example.com", "First")
    second = await create_user(session, "resign-second@example.com", "Second")
    third = await create_user(session, "resign-third@example.com", "Third")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.join(game.id, third)
    await games.start(game.id, first.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 0
        persisted.owners["property_01"] = first.id
        persisted.owners["property_03"] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.leave(game.id, first.id)

    assert game.players[0].bankrupt
    assert game.current_player.user_id == second.id
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_01"
    assert game.bank_auction_queue == ["property_03"]
    assert any(event.type == "player.resigned" for event in game.events)


async def test_optional_rules_change_salary_and_decline_behavior(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "rules-host@example.com", "Host")
    guest = await create_user(session, "rules-guest@example.com", "Guest")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 1),
    )
    game = await games.create("classic-demo", host)
    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(
                auction_unpurchased_properties=False,
                double_salary_on_start=True,
            )
        ),
    )
    assert not game.settings.rules.auction_unpurchased_properties
    await games.join(game.id, guest)
    await games.start(game.id, host.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.players[0].position = 38
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    assert game.players[0].position == 0
    assert game.players[0].balance == 1900
    assert game.events[-2].type == "salary.collected"

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.players[0].position = 1
        persisted.phase = TurnPhase.WAITING_FOR_ROLL
        persisted.extra_roll_pending = False
        await GameRepository(session).save(persisted, previous_sequence)
    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    assert game.pending_tile_id == "property_03"
    game = await games.execute(
        game.id,
        host.id,
        DeclinePropertyCommand(action="decline_property"),
    )
    assert game.active_auction is None
    assert game.pending_tile_id is None
    assert game.events[-1].type == "property.declined"


async def test_card_movement_supports_relative_and_nearest_destinations(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "moves-first@example.com", "First")
    second = await create_user(session, "moves-second@example.com", "Second")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (3, 4),
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    pack = PackLoader(packs_dir).load("classic-demo")
    opportunity = next(deck for deck in pack.board.decks if deck.id == "opportunity")

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.players[0].position = 38
        persisted.owners["transport_05"] = second.id
        persisted.deck_orders["opportunity"] = [
            "opportunity_nearest_transport",
            *[
                card.id
                for card in opportunity.cards
                if card.id != "opportunity_nearest_transport"
            ],
        ]
        persisted.deck_cursors["opportunity"] = 0
        games._draw_card(persisted, persisted.players[0], "opportunity")
        games._choose_card(persisted, first.id, 0)
        games._continue_card(persisted, first.id)
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].position == 5
    assert game.players[0].balance == 1650
    assert game.players[1].balance == 1550
    nearest_move = next(
        event
        for event in reversed(game.events)
        if event.type == "card.player_moved"
        and event.data["card_id"] == "opportunity_nearest_transport"
    )
    assert nearest_move.data["from_position"] == 38
    assert nearest_move.data["to_position"] == 5
    assert nearest_move.data["position"] == 5
    assert nearest_move.data["steps"] == 7
    assert nearest_move.data["movement"] == "step"

    await session.rollback()
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.players[0].position = 8
        persisted.deck_orders["opportunity"] = [
            "opportunity_back",
            *[
                card.id
                for card in opportunity.cards
                if card.id != "opportunity_back"
            ],
        ]
        persisted.deck_cursors["opportunity"] = 0
        games._draw_card(persisted, persisted.players[0], "opportunity")
        games._choose_card(persisted, first.id, 0)
        games._continue_card(persisted, first.id)
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].position == 5
    backward_move = next(
        event
        for event in reversed(game.events)
        if event.type == "card.player_moved"
        and event.data["card_id"] == "opportunity_back"
    )
    assert backward_move.data["from_position"] == 8
    assert backward_move.data["to_position"] == 5
    assert backward_move.data["position"] == 5
    assert backward_move.data["steps"] == -3
    assert backward_move.data["movement"] == "step"


async def test_repairs_card_uses_owned_house_and_hotel_counts(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "repairs-first@example.com", "First")
    second = await create_user(session, "repairs-second@example.com", "Second")
    games = GameService(
        session,
        PackLoader(packs_dir),
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)
    pack = PackLoader(packs_dir).load("classic-demo")
    community = next(deck for deck in pack.board.decks if deck.id == "community")

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.owners["property_01"] = first.id
        persisted.owners["property_03"] = first.id
        persisted.building_levels["property_01"] = 2
        persisted.building_levels["property_03"] = 5
        persisted.deck_orders["community"] = [
            "community_repairs",
            *[
                card.id
                for card in community.cards
                if card.id != "community_repairs"
            ],
        ]
        persisted.deck_cursors["community"] = 0
        games._draw_card(persisted, persisted.players[0], "community")
        games._choose_card(persisted, first.id, 0)
        games._continue_card(persisted, first.id)
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].balance == 1305
    assert game.events[-2].type == "card.repairs_assessed"
    assert game.events[-2].data["amount"] == 195


async def test_cash_each_card_resumes_queued_payments_after_debt(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "each-first@example.com", "First")
    second = await create_user(session, "each-second@example.com", "Second")
    third = await create_user(session, "each-third@example.com", "Third")
    games = GameService(
        session,
        PackLoader(packs_dir),
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.join(game.id, third)
    await games.start(game.id, first.id)
    pack = PackLoader(packs_dir).load("classic-demo")
    community = next(deck for deck in pack.board.decks if deck.id == "community")

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.players[1].balance = 5
        persisted.deck_orders["community"] = [
            "community_collect_each",
            *[
                card.id
                for card in community.cards
                if card.id != "community_collect_each"
            ],
        ]
        persisted.deck_cursors["community"] = 0
        games._draw_card(persisted, persisted.players[0], "community")
        games._choose_card(persisted, first.id, 0)
        games._continue_card(persisted, first.id)
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.active_debt is not None
    assert game.active_debt.debtor_id == second.id
    assert len(game.pending_card_payments) == 1

    await session.rollback()
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[1].balance = 10
        await GameRepository(session).save(persisted, len(persisted.events))
    game = await games.execute(
        game.id,
        second.id,
        PayDebtCommand(action="pay_debt"),
    )
    assert game.active_debt is None
    assert game.pending_card_payments == []
    assert game.players[0].balance == 1520
    assert game.players[2].balance == 1490


async def test_free_parking_rule_collects_bank_charges(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "parking-first@example.com", "First")
    second = await create_user(session, "parking-second@example.com", "Second")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.update_settings(
        game.id,
        first.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(free_parking_jackpot=True)
        ),
    )
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        games._charge_player(
            persisted,
            persisted.players[0],
            amount=100,
            creditor_id=None,
            reason=DebtReason.TAX,
            tile_id="tax_04",
        )
        persisted.players[0].position = 20
        games._resolve_landed_tile(
            persisted,
            persisted.players[0],
            "free_20",
            0,
        )
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.bank_pot == 0
    assert game.players[0].balance == 1500
    assert game.events[-1].type == "free_parking.collected"


async def test_percentage_tax_uses_total_player_net_worth(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(session, "net-worth-tax@example.com", "Taxpayer")
    second = await create_user(session, "net-worth-tax-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        pack = games._pack(persisted)
        tax_tile = next(tile for tile in pack.board.tiles if tile.id == "tax_04")
        percentage_tax = tax_tile.model_copy(
            update={"amount": None, "net_worth_percent": 10}
        )
        persisted.pack_snapshot = pack.model_copy(
            update={
                "board": pack.board.model_copy(
                    update={
                        "tiles": [
                            percentage_tax if tile.id == tax_tile.id else tile
                            for tile in pack.board.tiles
                        ]
                    }
                )
            }
        )
        persisted.players[0].balance = 1000
        persisted.owners["property_01"] = first.id
        persisted.building_levels["property_01"] = 2
        previous_sequence = len(persisted.events)
        games._resolve_landed_tile(
            persisted,
            persisted.players[0],
            "tax_04",
            0,
        )
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].balance == 884
    assert game.events[-1].data["amount"] == 116


async def test_extended_board_auction_taxes_and_discounted_card_purchase(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    packs = PackLoader(packs_dir)
    pack = packs.load("extended-demo")
    first_id = uuid4()
    second_id = uuid4()
    first = PlayerState(user_id=first_id, display_name="First", balance=2800)
    second = PlayerState(user_id=second_id, display_name="Second", balance=2800)
    game = GameState(
        host_user_id=first_id,
        pack_id="extended-demo",
        pack_version="2.0.0",
        status=GameStatus.PLAYING,
        players=[first, second],
        houses_remaining=48,
        hotels_remaining=18,
    )
    games = GameService(session, packs)

    for property_id in ("property_01", "property_03", "property_05"):
        game.owners[property_id] = first_id
    game.building_levels["property_01"] = 2
    game.building_levels["property_03"] = 5
    assert games._tax_amount(game, first, pack.board.tiles[44]) == 50
    assert games._tax_amount(game, first, pack.board.tiles[61]) == 125

    games._resolve_landed_tile(game, first, "auction_13", 7)
    assert game.pending_auction_selector_id == first_id
    games._select_auction_property(game, first_id, "property_07")
    assert game.active_auction is not None
    assert game.active_auction.minimum_bid == 70
    assert game.active_auction.deposit_amount == 10
    with pytest.raises(ConflictError, match="below the auction minimum"):
        games._bid(game, first_id, 69)
    games._bid(game, first_id, 70)
    assert game.active_auction.current_bid == 70
    assert first.balance == 2790

    games._refund_all_auction_deposits(game, reason="test_cleanup")
    game.active_auction = None
    game.owners.clear()
    first.balance = 2800
    first.position = 0
    advance_card = next(
        card
        for deck in pack.board.decks
        for card in deck.cards
        if card.id == "opportunity_advance_five"
    )
    games._remaining_effects = 8
    games._apply_effect(
        game,
        first,
        advance_card.resolved_effects()[0],
        source_id=advance_card.id,
    )
    assert game.pending_tile_id == "property_05"
    assert game.pending_purchase_discount_percent == 10
    games._buy_property(game, first)
    assert first.balance == 2728
    assert game.owners["property_05"] == first_id


async def test_extended_portfolio_cards_use_authoritative_owned_state(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    packs = PackLoader(packs_dir)
    pack = packs.load("extended-demo")
    player_id = uuid4()
    player = PlayerState(user_id=player_id, display_name="Owner", balance=2800)
    game = GameState(
        host_user_id=player_id,
        pack_id="extended-demo",
        pack_version="2.0.0",
        status=GameStatus.PLAYING,
        players=[player],
        owners={"property_01": player_id, "property_03": player_id},
        mortgaged_property_ids=["property_03"],
    )
    games = GameService(session, packs)
    cards = {
        card.id: card
        for deck in pack.board.decks
        for card in deck.cards
    }

    games._remaining_effects = 8
    games._apply_effect(
        game,
        player,
        cards["community_audit"].resolved_effects()[0],
        source_id="community_audit",
    )
    assert player.balance == 2750
    games._apply_effect(
        game,
        player,
        cards["community_renewal_subsidy"].resolved_effects()[0],
        source_id="community_renewal_subsidy",
    )
    assert player.balance == 2800
    games._apply_effect(
        game,
        player,
        cards["community_refinance"].resolved_effects()[0],
        source_id="community_refinance",
    )
    assert player.balance == 2770
    assert game.mortgaged_property_ids == []


@pytest.mark.parametrize("pack_id", ["classic-demo", "extended-demo"])
async def test_complete_match_reaches_a_winner_using_public_commands(
    pack_id: str,
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    first = await create_user(
        session,
        f"complete-first-{pack_id}@example.com",
        "First",
    )
    second = await create_user(
        session,
        f"complete-second-{pack_id}@example.com",
        "Second",
    )
    packs = PackLoader(packs_dir)
    games = GameService(
        session,
        packs,
        dice_roller=lambda: (1, 2),
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create(pack_id, first)
    game = await games.join(game.id, second)
    extra_players = [
        await create_user(
            session,
            f"complete-extra-{index}-{pack_id}@example.com",
            f"Extra {index}",
        )
        for index in range(2, packs.load(pack_id).manifest.min_players)
    ]
    for extra_player in extra_players:
        game = await games.join(game.id, extra_player)
    game = await games.start(game.id, first.id)
    if extra_players:
        async with session.begin():
            persisted = await GameRepository(session).get(game.id, for_update=True)
            for player in persisted.players[2:]:
                player.bankrupt = True
            await GameRepository(session).save(persisted, len(persisted.events))
            game = persisted
    tiles = {tile.id: tile for tile in packs.load(pack_id).board.tiles}

    for _command_number in range(2500):
        if game.status.value == "finished":
            break
        if game.pending_card_draw is not None:
            command = (
                ChooseCardCommand(action="choose_card", card_index=0)
                if game.pending_card_draw.card_id is None
                else ContinueCardCommand(action="continue_card")
            )
            game = await games.execute(
                game.id,
                game.pending_card_draw.player_id,
                command,
            )
            continue
        if game.active_debt is not None:
            debtor = next(
                player
                for player in game.players
                if player.user_id == game.active_debt.debtor_id
            )
            command = (
                PayDebtCommand(action="pay_debt")
                if debtor.balance >= game.active_debt.amount
                else DeclareBankruptcyCommand(action="declare_bankruptcy")
            )
            game = await games.execute(game.id, debtor.user_id, command)
            continue
        if game.active_auction is not None:
            bidder_id = next(
                player_id
                for player_id in game.active_auction.eligible_player_ids
                if player_id not in game.active_auction.passed_player_ids
                and player_id != game.active_auction.current_bidder_id
            )
            game = await games.execute(
                game.id,
                bidder_id,
                PassAuctionCommand(action="pass_auction"),
            )
            continue
        if game.pending_auction_selector_id is not None:
            property_id = next(
                tile.id
                for tile in tiles.values()
                if tile.is_purchasable and tile.id not in game.owners
            )
            game = await games.execute(
                game.id,
                game.pending_auction_selector_id,
                SelectAuctionPropertyCommand(
                    action="select_auction_property",
                    property_id=property_id,
                ),
            )
            continue

        current = game.current_player
        assert current is not None
        if game.phase is TurnPhase.WAITING_FOR_ROLL:
            game = await games.execute(
                game.id,
                current.user_id,
                RollCommand(action="roll"),
            )
        elif game.phase is TurnPhase.BUY_DECISION:
            assert game.pending_tile_id is not None
            tile = tiles[game.pending_tile_id]
            command = (
                BuyPropertyCommand(action="buy_property")
                if current.balance >= (tile.price or 0)
                else DeclinePropertyCommand(action="decline_property")
            )
            game = await games.execute(game.id, current.user_id, command)
        else:
            game = await games.execute(
                game.id,
                current.user_id,
                EndTurnCommand(action="end_turn"),
            )
    else:
        pytest.fail(f"{pack_id} did not finish within the command limit")

    active_players = [player for player in game.players if not player.bankrupt]
    assert len(active_players) == 1
    assert game.events[-1].type == "game.finished"
    assert game.events[-1].data["winner_id"] == str(active_players[0].user_id)
    assert game.active_debt is None
    assert game.active_auction is None
    assert [event.sequence for event in game.events] == list(
        range(1, len(game.events) + 1)
    )
    assert any(event.type == "dice.rolled" for event in game.events)
    assert any(event.type == "property.purchased" for event in game.events)
    assert any(event.type == "player.bankrupt" for event in game.events)

    persisted = await games.get(game.id, active_players[0].user_id)
    assert persisted.model_dump(mode="json") == game.model_dump(mode="json")
