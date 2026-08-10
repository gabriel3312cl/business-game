from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from business_game.domain.models import (
    BankCreditProfileState,
    ContentPack,
    GameState,
    GameStatus,
    InvestmentInstrumentState,
    MarketOrderSide,
    PlayerState,
    TileKind,
)

MARKET_BASELINE_PLAYERS = 6


@dataclass(frozen=True)
class CreditOffer:
    interest_percent: int
    maximum_amount: int
    maximum_term_laps: int
    score: int


@dataclass(frozen=True)
class MarketQuote:
    gross: int
    average_price: int
    new_price: int
    spread_percent: int
    price_impact_percent: float


def scale_market_capacity(base_capacity: int, player_count: int) -> int:
    active_players = max(1, player_count)
    return max(
        base_capacity,
        (base_capacity * active_players + MARKET_BASELINE_PLAYERS - 1)
        // MARKET_BASELINE_PLAYERS,
    )


def derived_money_supply(
    pack: ContentPack,
    player_count: int = MARKET_BASELINE_PLAYERS,
) -> int:
    configured = pack.manifest.bank_money_supply
    purchase_total = sum(tile.price or 0 for tile in pack.board.tiles)
    board_based_supply = purchase_total * 18 // 5
    baseline_supply = configured or max(
        board_based_supply,
        pack.manifest.starting_balance * MARKET_BASELINE_PLAYERS,
    )
    scaled_supply = scale_market_capacity(baseline_supply, player_count)
    player_cash_floor = pack.manifest.starting_balance * max(1, player_count)
    return max(scaled_supply, player_cash_floor, 1)


def market_share_supply(pack: ContentPack, player_count: int) -> int:
    return scale_market_capacity(
        pack.manifest.investment_share_count,
        player_count,
    )


def synchronize_trade_volumes(game: GameState) -> None:
    event_volume: dict[str, int] = {}
    for event in game.events:
        instrument_id = event.data.get("instrument_id")
        quantity = event.data.get("quantity")
        if (
            not isinstance(instrument_id, str)
            or not isinstance(quantity, int)
            or isinstance(quantity, bool)
            or quantity <= 0
        ):
            continue
        if event.type in {"investment.shares_bought", "investment.shares_sold"} or (
            event.type == "investment.order_filled"
            and event.data.get("buy_order_id") is not None
            and event.data.get("sell_order_id") is not None
        ):
            event_volume[instrument_id] = event_volume.get(instrument_id, 0) + quantity
    for instrument in game.bank.investments:
        instrument.trade_volume = max(
            instrument.trade_volume,
            event_volume.get(instrument.id, 0),
        )


def initialize_bank(game: GameState, pack: ContentPack) -> None:
    was_initialized = game.bank.initialized
    player_count = sum(not player.bankrupt for player in game.players)
    if not game.bank.initialized:
        game.bank.initialized = True
        game.bank.minimum_reserve_percent = (
            pack.manifest.bank_minimum_reserve_percent
        )
    if game.status is GameStatus.LOBBY:
        game.bank.monetary_base = derived_money_supply(pack, player_count)
        game.bank.emergency_issuance = 0
    elif not was_initialized:
        game.bank.monetary_base = derived_money_supply(pack, player_count)
    ensure_investments(
        game,
        pack,
        player_count=player_count if game.status is GameStatus.LOBBY else None,
    )
    synchronize_trade_volumes(game)
    if not was_initialized:
        reconcile_bank(game)
    refresh_credit_profiles(game, pack)


def credit_profile(game: GameState, player_id: UUID) -> BankCreditProfileState:
    profile = game.bank.credit_profiles.get(player_id)
    if profile is None:
        profile = BankCreditProfileState()
        game.bank.credit_profiles[player_id] = profile
    return profile


def credit_offer(
    game: GameState,
    pack: ContentPack,
    player: PlayerState,
) -> CreditOffer:
    profile = game.bank.credit_profiles.get(player.user_id) or BankCreditProfileState()
    score = profile.score
    base_rate = pack.manifest.loan_interest_percent
    if score >= 780:
        rate_adjustment, limit_percent = -6, 170
    elif score >= 720:
        rate_adjustment, limit_percent = -4, 145
    elif score >= 660:
        rate_adjustment, limit_percent = -2, 125
    elif score >= 580:
        rate_adjustment, limit_percent = 0, 100
    elif score >= 500:
        rate_adjustment, limit_percent = 5, 70
    else:
        rate_adjustment, limit_percent = 10, 40
    interest_percent = max(1, base_rate + rate_adjustment)
    maximum_installment = (
        pack.manifest.pass_start_salary
        * pack.manifest.loan_salary_payment_percent
        * limit_percent
        // 10_000
    )
    income_capacity = (
        maximum_installment
        * pack.manifest.loan_max_term_laps
        * 100
        // (100 + interest_percent)
    )
    collateral = _collateral_value(game, pack, player.user_id)
    collateral_capacity = collateral * 30 * limit_percent // 10_000
    calculated_limit = max(income_capacity, collateral_capacity)
    reserve_capacity = max(
        0,
        available_bank_cash(game) - minimum_reserve(game),
    )
    has_active_loan = any(
        loan.player_id == player.user_id for loan in game.bank.loans
    )
    return CreditOffer(
        interest_percent=interest_percent,
        maximum_amount=0 if has_active_loan else min(calculated_limit, reserve_capacity),
        maximum_term_laps=pack.manifest.loan_max_term_laps,
        score=score,
    )


def refresh_credit_profiles(game: GameState, pack: ContentPack) -> None:
    for player in game.players:
        profile = credit_profile(game, player.user_id)
        offer = credit_offer(game, pack, player)
        profile.current_interest_percent = offer.interest_percent
        profile.current_limit = offer.maximum_amount
        profile.maximum_term_laps = offer.maximum_term_laps


def _collateral_value(game: GameState, pack: ContentPack, player_id: UUID) -> int:
    tiles = {tile.id: tile for tile in pack.board.tiles}
    property_collateral = sum(
        tiles[tile_id].mortgage_value or 0
        for tile_id, owner_id in game.owners.items()
        if owner_id == player_id and tile_id in tiles
    )
    building_collateral = sum(
        (tiles[tile_id].build_cost or 0)
        * level
        * pack.manifest.building_sell_percent
        // 100
        for tile_id, level in game.building_levels.items()
        if game.owners.get(tile_id) == player_id and tile_id in tiles
    )
    investment_collateral = sum(
        instrument.current_price * instrument.holdings.get(player_id, 0)
        for instrument in game.bank.investments
    )
    return property_collateral + building_collateral + investment_collateral


def ensure_investments(
    game: GameState,
    pack: ContentPack,
    *,
    player_count: int | None = None,
) -> None:
    if not game.settings.rules.stock_market_enabled:
        return
    share_supply = (
        market_share_supply(pack, player_count)
        if player_count is not None
        else pack.manifest.investment_share_count
    )
    existing_ids = {item.id for item in game.bank.investments}
    for tile in pack.board.tiles:
        if (
            f"market:{tile.id}" in existing_ids
            or tile.kind not in {TileKind.TRANSPORT, TileKind.UTILITY}
            or not tile.is_purchasable
            or len(game.bank.investments) >= 40
        ):
            continue
        reference_price = tile.price or max(1, pack.manifest.starting_balance // 10)
        share_price = max(10, reference_price // 8)
        game.bank.investments.append(
            InvestmentInstrumentState(
                id=f"market:{tile.id}",
                tile_id=tile.id,
                name_key=tile.name_key,
                total_shares=share_supply,
                available_shares=share_supply,
                base_price=share_price,
                current_price=share_price,
                dividend_percent=pack.manifest.investment_dividend_percent,
                transaction_fee_percent=(
                    pack.manifest.investment_transaction_fee_percent
                ),
                revenue_fee_percent=pack.manifest.investment_revenue_fee_percent,
                max_ownership_percent=(
                    pack.manifest.investment_max_ownership_percent
                ),
                spread_percent=pack.manifest.investment_spread_percent,
            )
        )
        existing_ids.add(f"market:{tile.id}")

    institution_specs = [
        (
            "bank",
            "institution:bank",
            "bankPanel.instrumentNames.bank",
            max(25, pack.manifest.starting_balance // 20),
        )
    ]
    jail_tile = next(
        (tile for tile in pack.board.tiles if tile.kind is TileKind.JAIL),
        None,
    )
    if jail_tile is not None:
        institution_specs.append(
            (
                "jail",
                jail_tile.id,
                "bankPanel.instrumentNames.jail",
                max(10, pack.manifest.jail_fine // 2),
            )
        )
    tax_tiles = [tile for tile in pack.board.tiles if tile.kind is TileKind.TAX]
    if tax_tiles:
        reference_tax = max(
            (tile.amount or pack.manifest.starting_balance // 10)
            for tile in tax_tiles
        )
        institution_specs.append(
            (
                "tax",
                "institution:tax",
                "bankPanel.instrumentNames.tax",
                max(10, reference_tax // 8),
            )
        )
    for instrument_kind, tile_id, name_key, base_price in institution_specs:
        instrument_id = f"market:institution:{instrument_kind}"
        if instrument_id in existing_ids or len(game.bank.investments) >= 40:
            continue
        game.bank.investments.append(
            InvestmentInstrumentState(
                id=instrument_id,
                tile_id=tile_id,
                name_key=name_key,
                instrument_kind=instrument_kind,
                total_shares=share_supply,
                available_shares=share_supply,
                base_price=base_price,
                current_price=base_price,
                dividend_percent=pack.manifest.investment_dividend_percent,
                transaction_fee_percent=(
                    pack.manifest.investment_transaction_fee_percent
                ),
                revenue_fee_percent=0,
                max_ownership_percent=(
                    pack.manifest.investment_max_ownership_percent
                ),
                spread_percent=pack.manifest.investment_spread_percent,
            )
        )
    index_id = "market:index:bgx"
    if index_id not in existing_ids and len(game.bank.investments) < 40:
        game.bank.investments.append(
            InvestmentInstrumentState(
                id=index_id,
                tile_id="institution:bgx",
                name_key="marketPanel.indexFundName",
                instrument_kind="index",
                total_shares=share_supply,
                available_shares=share_supply,
                base_price=100,
                current_price=100,
                dividend_percent=pack.manifest.investment_dividend_percent,
                transaction_fee_percent=(
                    pack.manifest.investment_transaction_fee_percent
                ),
                revenue_fee_percent=0,
                max_ownership_percent=(
                    pack.manifest.investment_max_ownership_percent
                ),
                spread_percent=pack.manifest.investment_spread_percent,
            )
        )
    for instrument in game.bank.investments:
        if player_count is not None:
            instrument.total_shares = share_supply
            instrument.available_shares = share_supply
        instrument.dividend_percent = pack.manifest.investment_dividend_percent
        instrument.transaction_fee_percent = (
            pack.manifest.investment_transaction_fee_percent
        )
        instrument.max_ownership_percent = (
            pack.manifest.investment_max_ownership_percent
        )
        instrument.spread_percent = pack.manifest.investment_spread_percent
        if instrument.session_high == 0:
            instrument.session_high = instrument.current_price
        if instrument.session_low == 0:
            instrument.session_low = instrument.current_price
    refresh_market_index(game)


def market_index_value(game: GameState) -> int:
    components = [
        instrument
        for instrument in game.bank.investments
        if instrument.instrument_kind != "index"
    ]
    if not components:
        return 100
    return max(
        1,
        round(
            sum(
                instrument.current_price * 100 / instrument.base_price
                for instrument in components
            )
            / len(components)
        ),
    )


def refresh_market_index(game: GameState) -> int:
    value = market_index_value(game)
    instrument = next(
        (
            item
            for item in game.bank.investments
            if item.instrument_kind == "index"
        ),
        None,
    )
    if instrument is None:
        return value
    instrument.current_price = value
    instrument.session_high = max(instrument.session_high, value)
    instrument.session_low = min(instrument.session_low or value, value)
    return value


def effective_spread_percent(
    instrument: InvestmentInstrumentState,
    *,
    opposite_order_depth: int = 0,
) -> int:
    volume = instrument.buy_volume + instrument.sell_volume
    imbalance = abs(instrument.buy_volume - instrument.sell_volume)
    imbalance_bonus = min(3, imbalance * 3 // max(1, volume))
    price_range = max(0, instrument.session_high - instrument.session_low)
    volatility_bonus = min(
        3,
        price_range * 10 // max(1, instrument.current_price),
    )
    liquid_depth = instrument.available_shares + opposite_order_depth
    liquidity_bonus = (
        2
        if liquid_depth * 4 < instrument.total_shares
        else 1
        if liquid_depth * 2 < instrument.total_shares
        else 0
    )
    return min(
        8,
        max(
            0,
            instrument.spread_percent
            + imbalance_bonus
            + volatility_bonus
            + liquidity_bonus,
        ),
    )


def market_order_quote(
    instrument: InvestmentInstrumentState,
    quantity: int,
    *,
    buying: bool,
    opposite_order_depth: int = 0,
) -> MarketQuote:
    mid_price = instrument.current_price
    spread_percent = effective_spread_percent(
        instrument,
        opposite_order_depth=opposite_order_depth,
    )
    spread = (mid_price * spread_percent + 50) // 100
    execution_price = (
        mid_price + spread if buying else max(1, mid_price - spread)
    )
    gross = execution_price * quantity
    market_depth = (
        instrument.available_shares + opposite_order_depth
        if buying
        else max(
            instrument.total_shares // 2,
            instrument.total_shares - instrument.available_shares,
        )
        + opposite_order_depth
    )
    impact_basis_points = min(
        500,
        quantity * 1000 // max(1, market_depth),
    )
    movement = (
        0
        if instrument.instrument_kind == "index"
        else (mid_price * impact_basis_points + 5_000) // 10_000
    )
    new_price = (
        mid_price + movement if buying else max(1, mid_price - movement)
    )
    return MarketQuote(
        gross=gross,
        average_price=execution_price,
        new_price=new_price,
        spread_percent=spread_percent,
        price_impact_percent=impact_basis_points / 100,
    )


def reconcile_bank(game: GameState) -> int:
    if not game.bank.initialized:
        return 0
    circulation = sum(player.balance for player in game.players) + game.bank_pot
    cash = game.bank.monetary_base + game.bank.emergency_issuance - circulation
    issued = max(0, -cash)
    if issued:
        game.bank.emergency_issuance += issued
        cash += issued
    game.bank.cash = cash
    return issued


def minimum_reserve(game: GameState) -> int:
    return (
        game.bank.monetary_base * game.bank.minimum_reserve_percent + 99
    ) // 100


def available_bank_cash(game: GameState) -> int:
    reserved_orders = sum(
        order.reserved_cash
        for order in game.bank.market_orders
        if order.side is MarketOrderSide.BUY
    )
    return max(
        0,
        game.bank.cash - game.bank.dividend_cash_reserve - reserved_orders,
    )
