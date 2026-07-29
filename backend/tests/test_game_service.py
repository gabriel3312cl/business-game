from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError, ForbiddenError
from business_game.domain.models import (
    AcceptTradeCommand,
    BidCommand,
    BuildPropertyCommand,
    BuyPropertyCommand,
    DebtReason,
    DebtState,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    EndTurnCommand,
    MortgagePropertyCommand,
    OptionalRulesUpdate,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    ProposeTradeCommand,
    RollCommand,
    SellBuildingCommand,
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
    first = await create_user(session, "auctioneer@example.com", "Auctioneer")
    second = await create_user(session, "bidder@example.com", "Bidder")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
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

    game = await games.execute(
        game.id,
        second.id,
        BidCommand(action="bid", amount=90),
    )
    game = await games.execute(
        game.id,
        first.id,
        PassAuctionCommand(action="pass_auction"),
    )

    assert game.active_auction is None
    assert game.owners["property_03"] == second.id
    assert next(player for player in game.players if player.user_id == second.id).balance == 1410
    assert game.current_player.user_id == first.id
    assert game.phase.value == "waiting_for_end"


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
    assert seller.balance == seller_balance_after_purchase + 125
    assert buyer.balance == 1500 - 125
    assert game.trades[-1].status.value == "accepted"


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
    assert game.players[0].balance == balance_after_purchase + 45
    assert game.mortgaged_property_ids == ["property_03"]

    game = await games.execute(
        game.id,
        first.id,
        UnmortgagePropertyCommand(
            action="unmortgage_property",
            property_id="property_03",
        ),
    )
    assert game.players[0].balance == balance_after_purchase - 5
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
        if tile.group == "group_2"
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
        persisted.players[0].balance = 50
        persisted.owners["property_01"] = first.id
        persisted.owners["property_02"] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))
    assert game.active_debt is not None
    assert game.active_debt.amount == 104

    await games.execute(
        game.id,
        first.id,
        MortgagePropertyCommand(action="mortgage_property", property_id="property_01"),
    )
    game = await games.execute(
        game.id,
        first.id,
        MortgagePropertyCommand(action="mortgage_property", property_id="property_02"),
    )
    assert game.players[0].balance == 125

    game = await games.execute(
        game.id,
        first.id,
        PayDebtCommand(action="pay_debt"),
    )
    assert game.active_debt is None
    assert game.players[0].balance == 21


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
    assert game.events[-1].type == "jail.entered"
    assert game.events[-1].data["reason"] == "consecutive_doubles"


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
        dice_roller=lambda: (4, 4),
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create("classic-demo", first)
    await games.join(game.id, second)
    await games.start(game.id, first.id)

    game = await games.execute(game.id, first.id, RollCommand(action="roll"))
    persisted = await games.get(game.id, first.id)

    assert game.last_card_id == "opportunity_bonus"
    assert game.players[0].balance == 1600
    assert persisted.deck_cursors["opportunity"] == 1
    assert persisted.events[-2].type == "card.drawn"
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
        if tile.group == "group_2"
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
    debtor = await create_user(session, "bank-debtor@example.com", "Debtor")
    bidder = await create_user(session, "bank-bidder@example.com", "Bidder")
    other = await create_user(session, "bank-other@example.com", "Other")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", debtor)
    await games.join(game.id, bidder)
    await games.join(game.id, other)
    await games.start(game.id, debtor.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 0
        persisted.owners["property_01"] = debtor.id
        persisted.owners["property_02"] = debtor.id
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
    assert game.bank_auction_queue == ["property_02"]

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
    assert game.active_auction.property_id == "property_02"

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
    assert game.active_auction is None
    assert game.bank_auction_queue == []
    assert game.owners["property_02"] == bidder.id


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
        UpdateGameSettingsRequest(max_players=2, allow_spectators=False),
    )
    assert game.settings.max_players == 2
    assert not game.settings.allow_spectators

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
        persisted.owners["property_02"] = first.id
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.leave(game.id, first.id)

    assert game.players[0].bankrupt
    assert game.current_player.user_id == second.id
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_01"
    assert game.bank_auction_queue == ["property_02"]
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
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].position == 5
    assert game.players[0].balance == 1650
    assert game.players[1].balance == 1550

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
        await GameRepository(session).save(persisted, previous_sequence)

    game = await games.get(game.id, first.id)
    assert game.players[0].position == 5


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
        persisted.owners["property_02"] = first.id
        persisted.building_levels["property_01"] = 2
        persisted.building_levels["property_02"] = 5
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
    game = await games.start(game.id, first.id)
    tiles = {tile.id: tile for tile in packs.load(pack_id).board.tiles}

    for _command_number in range(2500):
        if game.status.value == "finished":
            break
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
