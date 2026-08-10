from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.economy import (
    derived_money_supply,
    initialize_bank,
    market_share_supply,
    synchronize_trade_volumes,
)
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError
from business_game.domain.models import (
    AuctionState,
    BuySharesCommand,
    DebtReason,
    DebtState,
    DeclareBankruptcyCommand,
    GameSettings,
    GameState,
    OptionalRules,
    OptionalRulesUpdate,
    PayDebtCommand,
    PayJailFineCommand,
    PlaceLimitOrderCommand,
    PlayerState,
    RepayLoanCommand,
    RequestLoanCommand,
    RollCommand,
    SellSharesCommand,
    TurnPhase,
    UpdateGameSettingsRequest,
    UserCreate,
)
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


def assert_money_is_conserved(game) -> None:
    circulation = sum(player.balance for player in game.players) + game.bank_pot
    assert (
        game.bank.cash + circulation
        == game.bank.monetary_base + game.bank.emergency_issuance
    )


async def enabled_game(
    packs_dir: Path,
    session: AsyncSession,
    *,
    dice=(1, 2),
):
    host = await create_user(session, "bank-host@example.com", "Host")
    guest = await create_user(session, "bank-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: dice)
    game = await games.create("classic-demo", host)
    game = await games.join(game.id, guest)
    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(
                loans_enabled=True,
                stock_market_enabled=True,
            )
        ),
    )
    game = await games.start(game.id, host.id)
    return games, game, host, guest


@pytest.mark.parametrize(
    ("player_count", "expected_money", "expected_shares"),
    [
        (6, 20_580, 20),
        (15, 51_450, 50),
        (16, 54_880, 54),
        (20, 68_600, 67),
    ],
)
def test_market_capacity_scales_from_active_players_at_start(
    packs_dir: Path,
    player_count: int,
    expected_money: int,
    expected_shares: int,
) -> None:
    pack = PackLoader(packs_dir).load("classic-demo")

    assert derived_money_supply(pack, player_count) == expected_money
    assert market_share_supply(pack, player_count) == expected_shares

    players = [
        PlayerState(
            user_id=uuid4(),
            display_name=f"Jugador {index + 1}",
            balance=pack.manifest.starting_balance,
        )
        for index in range(player_count)
    ]
    game = GameState(
        host_user_id=players[0].user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        players=players,
        settings=GameSettings(
            rules=OptionalRules(stock_market_enabled=True),
        ),
    )

    initialize_bank(game, pack)

    assert game.bank.monetary_base == expected_money
    assert {item.total_shares for item in game.bank.investments} == {
        expected_shares
    }


async def test_bank_tracks_supply_and_salary_backed_loans(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await enabled_game(
        packs_dir,
        session,
        dice=(1, 1),
    )
    assert game.bank.monetary_base == 20_580
    assert game.bank.cash == 17_580
    assert len(game.bank.investments) == 10
    assert game.bank.investments[-1].instrument_kind == "index"
    assert game.bank.investments[0].total_shares == 20
    started = next(event for event in game.events if event.type == "game.started")
    assert started.data["player_count"] == 2
    assert started.data["market_share_supply"] == 20
    assert started.data["bank_monetary_base"] == 20_580
    assert_money_is_conserved(game)

    game = await games.execute(
        game.id,
        host.id,
        RequestLoanCommand(action="request_loan", amount=300),
    )
    loan = game.bank.loans[0]
    assert loan.remaining_balance == 345
    assert loan.installment_amount == 69
    assert game.players[0].balance == 1800
    assert game.bank.cash == 17_280
    assert_money_is_conserved(game)

    game = await games.execute(
        game.id,
        host.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:transport_05",
            quantity=1,
        ),
    )
    assert game.bank.investments[0].holdings[host.id] == 1

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].position = 39
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        RollCommand(action="roll"),
    )
    assert game.bank.loans[0].remaining_balance == 276
    assert game.players[0].balance == 1905
    assert any(event.type == "bank.loan_payment" for event in game.events)
    assert_money_is_conserved(game)

    game = await games.execute(
        game.id,
        host.id,
        RepayLoanCommand(action="repay_loan"),
    )
    assert game.bank.loans == []
    assert game.bank.credit_profiles[host.id].score == 625
    assert game.bank.credit_profiles[host.id].successful_loans == 1
    assert_money_is_conserved(game)


async def test_active_auction_participant_can_request_a_loan_off_turn(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)

    with pytest.raises(ConflictError, match="it is not this player's turn"):
        await games.execute(
            game.id,
            guest.id,
            RequestLoanCommand(action="request_loan", amount=100),
        )

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.active_auction = AuctionState(
            property_id="property_03",
            minimum_bid=42,
            eligible_player_ids=[host.id, guest.id],
            passed_player_ids=[guest.id],
        )
        await GameRepository(session).save(persisted, persisted.event_sequence)

    with pytest.raises(
        ConflictError,
        match="only an active auction participant can request a loan",
    ):
        await games.execute(
            game.id,
            guest.id,
            RequestLoanCommand(action="request_loan", amount=100),
        )

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        assert persisted.active_auction is not None
        persisted.active_auction.passed_player_ids = []
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        guest.id,
        RequestLoanCommand(action="request_loan", amount=100),
    )

    guest_state = next(player for player in game.players if player.user_id == guest.id)
    assert guest_state.balance == 1600
    assert game.bank.loans[0].player_id == guest.id
    assert game.bank.loans[0].principal == 100
    assert game.active_auction is not None
    assert game.active_auction.property_id == "property_03"
    assert_money_is_conserved(game)

    with pytest.raises(ConflictError, match="already has an active bank loan"):
        await games.execute(
            game.id,
            guest.id,
            RequestLoanCommand(action="request_loan", amount=100),
        )


async def test_credit_can_resolve_active_debt_and_rewards_good_history(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    initial_profile = game.bank.credit_profiles[host.id]
    assert initial_profile.score == 600
    assert initial_profile.current_interest_percent == 15
    assert initial_profile.current_limit == 608

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 0
        persisted.active_debt = DebtState(
            debtor_id=host.id,
            creditor_id=guest.id,
            amount=50,
            reason=DebtReason.RENT,
            tile_id="property_01",
        )
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        RequestLoanCommand(action="request_loan", amount=50),
    )
    assert game.players[0].balance == 50
    assert game.bank.loans[0].interest_percent == 15

    game = await games.execute(
        game.id,
        host.id,
        PayDebtCommand(action="pay_debt"),
    )
    assert game.active_debt is None

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        profile = persisted.bank.credit_profiles[host.id]
        profile.score = 720
        persisted.bank.loans.clear()
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        RequestLoanCommand(action="request_loan", amount=700),
    )
    assert game.bank.loans[0].interest_percent == 11
    assert game.bank.loans[0].installments_remaining <= 10


async def test_credit_score_penalizes_a_bankruptcy_default(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    game = await games.execute(
        game.id,
        host.id,
        RequestLoanCommand(action="request_loan", amount=100),
    )
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].balance = 0
        persisted.active_debt = DebtState(
            debtor_id=host.id,
            creditor_id=guest.id,
            amount=500,
            reason=DebtReason.RENT,
            tile_id="property_01",
        )
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        DeclareBankruptcyCommand(action="declare_bankruptcy"),
    )
    profile = game.bank.credit_profiles[host.id]
    assert profile.score == 450
    assert profile.defaults == 1


async def test_investment_dividends_are_split_from_actual_rent(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    game = await games.execute(
        game.id,
        host.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:transport_05",
            quantity=5,
        ),
    )
    balance_after_investment = game.players[0].balance

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].position = 2
        persisted.owners["transport_05"] = guest.id
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        RollCommand(action="roll"),
    )
    dividend = next(
        event
        for event in reversed(game.events)
        if event.type == "investment.dividend_paid"
    )
    assert dividend.data["rent"] == 25
    assert dividend.data["dividends"] == 0
    assert dividend.data["dividend_accrued_units"] == 16_875
    assert dividend.data["bank_fee"] == 1
    assert game.players[0].balance == balance_after_investment - 25
    assert game.players[1].balance == 1523
    assert game.players[0].pending_dividend_units == 16_875
    assert_money_is_conserved(game)


async def test_fractional_dividends_keep_four_decimal_places(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await enabled_game(packs_dir, session)
    instrument = next(
        item
        for item in game.bank.investments
        if item.id == "market:institution:bank"
    )
    instrument.available_shares -= 1
    instrument.holdings[host.id] = 1
    instrument.dividend_percent = 17

    net_amount = games._distribute_institution_revenue(
        game,
        "bank",
        1,
        "market_fee",
    )

    event = game.events[-1]
    assert net_amount == 1
    assert event.type == "investment.institution_revenue"
    assert event.data["dividend_accrued_units"] == 76
    assert event.data["dividends"] == 0
    assert game.players[0].pending_dividend_units == 76
    assert instrument.dividends_accrued_units == 76


async def test_fractional_dividends_accumulate_until_they_are_paid(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await enabled_game(packs_dir, session)
    instrument = next(
        item
        for item in game.bank.investments
        if item.id == "market:institution:bank"
    )
    instrument.available_shares -= 5
    instrument.holdings[host.id] = 5
    balance_before = game.players[0].balance

    for _ in range(15):
        games._distribute_institution_revenue(game, "bank", 1, "market_fee")

    assert game.players[0].balance == balance_before
    assert game.players[0].pending_dividend_units == 10_125
    assert game.bank.dividend_unfunded_units == 125
    assert game.bank.dividend_cash_reserve == 1

    games._settle_market_dividends(game)
    games._sync_bank(game)

    event = game.events[-1]
    assert event.type == "investment.dividends_settled"
    assert event.data["amount"] == 1
    assert game.players[0].balance == balance_before + 1
    assert game.players[0].pending_dividend_units == 125
    assert game.bank.dividend_cash_reserve == 0
    assert game.bank.dividend_unfunded_units == 125
    assert instrument.dividends_paid == 1
    assert instrument.dividends_accrued_units == 10_125


async def test_leveraged_investing_requires_credit_quality_and_pays_loan_first(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    game = await games.execute(
        game.id,
        host.id,
        RequestLoanCommand(action="request_loan", amount=300),
    )
    game = await games.execute(
        game.id,
        host.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:transport_05",
            quantity=5,
        ),
    )
    instrument = next(
        item for item in game.bank.investments if item.id == "market:transport_05"
    )
    assert instrument.buy_volume == 5
    assert instrument.trade_volume == 5
    assert instrument.trade_count == 1
    assert instrument.last_trade_price == 25
    assert instrument.current_price == 26
    assert instrument.session_high == 26

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.players[0].position = 2
        persisted.owners["transport_05"] = guest.id
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    games._settle_market_dividends(game)
    loan = next(item for item in game.bank.loans if item.player_id == host.id)
    assert loan.remaining_balance == 344
    settlement = next(
        event
        for event in reversed(game.events)
        if event.type == "investment.dividends_settled"
    )
    assert settlement.data["loan_payments"][str(host.id)] == 1

    game = await games.execute(
        game.id,
        host.id,
        SellSharesCommand(
            action="sell_shares",
            instrument_id="market:transport_05",
            quantity=1,
        ),
    )
    instrument = next(
        item for item in game.bank.investments if item.id == "market:transport_05"
    )
    assert instrument.sell_volume == 1
    assert instrument.trade_volume == 6
    assert instrument.trade_count == 2

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.bank.credit_profiles[host.id].score = 565
        await GameRepository(session).save(persisted, persisted.event_sequence)

    with pytest.raises(ConflictError, match="credit score is too low"):
        await games.execute(
            game.id,
            host.id,
            BuySharesCommand(
                action="buy_shares",
                instrument_id="market:transport_15",
                quantity=1,
            ),
        )


async def test_jail_and_bank_instruments_use_real_game_revenue(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    game = await games.execute(
        game.id,
        host.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:institution:jail",
            quantity=5,
        ),
    )
    host_balance_after_jail_investment = game.players[0].balance

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 1
        persisted.players[1].in_jail = True
        persisted.phase = TurnPhase.WAITING_FOR_ROLL
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        guest.id,
        PayJailFineCommand(action="pay_jail_fine"),
    )
    jail = next(
        item
        for item in game.bank.investments
        if item.id == "market:institution:jail"
    )
    assert jail.gross_revenue == 50
    assert jail.dividends_paid == 0
    games._settle_market_dividends(game)
    games._sync_bank(game)
    assert jail.dividends_paid == 3
    assert game.players[0].balance == host_balance_after_jail_investment + 3
    assert_money_is_conserved(game)

    game = await games.execute(
        game.id,
        guest.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:institution:bank",
            quantity=5,
        ),
    )
    guest_balance_after_bank_investment = game.players[1].balance
    game = await games.execute(
        game.id,
        guest.id,
        RequestLoanCommand(action="request_loan", amount=300),
    )
    game = await games.execute(
        game.id,
        guest.id,
        RepayLoanCommand(action="repay_loan"),
    )
    bank = next(
        item
        for item in game.bank.investments
        if item.id == "market:institution:bank"
    )
    games._settle_market_dividends(game)
    games._sync_bank(game)
    assert bank.gross_revenue >= 45
    assert bank.dividends_paid >= 3
    assert game.players[1].balance > guest_balance_after_bank_investment - 45
    assert_money_is_conserved(game)


async def test_limit_orders_match_by_price_time_and_feed_market_orders(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await enabled_game(packs_dir, session)
    game = await games.execute(
        game.id,
        host.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:transport_05",
            quantity=3,
        ),
    )

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 1
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        guest.id,
        PlaceLimitOrderCommand(
            action="place_limit_order",
            instrument_id="market:transport_05",
            side="buy",
            quantity=2,
            limit_price=30,
        ),
    )
    assert game.players[1].balance == 1_438
    assert game.bank.market_orders[0].reserved_cash == 62

    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 0
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        host.id,
        PlaceLimitOrderCommand(
            action="place_limit_order",
            instrument_id="market:transport_05",
            side="sell",
            quantity=2,
            limit_price=29,
        ),
    )
    instrument = next(
        item for item in game.bank.investments if item.id == "market:transport_05"
    )
    assert game.bank.market_orders == []
    assert instrument.holdings[host.id] == 1
    assert instrument.holdings[guest.id] == 2
    assert instrument.buy_volume == 5
    assert instrument.sell_volume == 2
    assert instrument.trade_volume == 5
    instrument.trade_volume = 0
    synchronize_trade_volumes(game)
    assert instrument.trade_volume == 5
    assert game.players[1].balance == 1_439
    fill = next(
        event
        for event in reversed(game.events)
        if event.type == "investment.order_filled"
    )
    assert fill.data["unit_price"] == 30
    assert fill.data["quantity"] == 2
    assert_money_is_conserved(game)

    game = await games.execute(
        game.id,
        host.id,
        PlaceLimitOrderCommand(
            action="place_limit_order",
            instrument_id="market:transport_05",
            side="sell",
            quantity=1,
            limit_price=24,
        ),
    )
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        persisted.current_player_index = 1
        await GameRepository(session).save(persisted, persisted.event_sequence)

    game = await games.execute(
        game.id,
        guest.id,
        BuySharesCommand(
            action="buy_shares",
            instrument_id="market:transport_05",
            quantity=1,
        ),
    )
    instrument = next(
        item for item in game.bank.investments if item.id == "market:transport_05"
    )
    assert instrument.holdings.get(host.id, 0) == 0
    assert instrument.holdings[guest.id] == 3
    purchase = next(
        event
        for event in reversed(game.events)
        if event.type == "investment.shares_bought"
    )
    assert purchase.data["book_quantity"] == 1
    assert purchase.data["bank_quantity"] == 0
    assert_money_is_conserved(game)
