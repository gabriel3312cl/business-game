from __future__ import annotations

from uuid import UUID

from business_game.domain.models import (
    ContentPack,
    EconomicCycle,
    GameState,
    PlayerState,
    PublicProjectKind,
    TileDefinition,
    TileKind,
)

INFLATION_BASIS_POINTS = 10_000
WEEKS_PER_YEAR = 52
BUILDING_EQUITY_PERCENT = 80


def building_replacement_cost(tile: TileDefinition, level: int) -> int:
    if level <= 0:
        return 0
    if level >= 5:
        return 4 * (tile.build_cost or 0) + (tile.hotel_cost or tile.build_cost or 0)
    return level * (tile.build_cost or 0)


def indexed_amount(
    game: GameState,
    amount: int,
    pass_through_percent: int = 100,
) -> int:
    if amount <= 0 or not game.settings.advanced_economy_enabled:
        return max(0, amount)
    index_delta = game.economy.price_index_basis_points - INFLATION_BASIS_POINTS
    effective_index = INFLATION_BASIS_POINTS + (index_delta * pass_through_percent + 50) // 100
    return max(
        0,
        (amount * effective_index + INFLATION_BASIS_POINTS // 2) // INFLATION_BASIS_POINTS,
    )


def advance_price_index(game: GameState) -> None:
    economy = game.economy
    if not game.settings.advanced_economy_enabled:
        return
    if economy.inflation_base_week is None:
        economy.inflation_base_week = economy.elapsed_weeks
        return
    annual_inflation = economy.annual_inflation_basis_points
    if annual_inflation <= 0:
        return
    denominator = INFLATION_BASIS_POINTS * WEEKS_PER_YEAR
    increment = (
        economy.price_index_basis_points * annual_inflation + denominator // 2
    ) // denominator
    economy.price_index_basis_points = min(
        1_000_000,
        economy.price_index_basis_points + max(1, increment),
    )


def rent_cycle_percent(game: GameState, tile: TileDefinition) -> int:
    if not game.settings.advanced_economy_enabled or game.economy.elapsed_weeks < 12:
        return 100
    percent = {
        EconomicCycle.EXPANSION: 108,
        EconomicCycle.SLOWDOWN: 92,
        EconomicCycle.RECESSION: 85,
        EconomicCycle.RECOVERY: 105,
    }[game.economy.cycle]
    for event in game.economy.active_events:
        if event.kind == "consumer_boom" and tile.kind is TileKind.PROPERTY:
            percent += 5 * event.intensity
        elif (
            event.kind == "supply_shock"
            and tile.kind
            in {
                TileKind.TRANSPORT,
                TileKind.UTILITY,
            }
            or event.kind == "innovation_boom"
            and tile.kind is TileKind.UTILITY
        ):
            percent += 8 * event.intensity
        elif event.kind == "labor_dispute" and tile.kind is TileKind.TRANSPORT:
            percent -= 8 * event.intensity
        elif event.kind == "fiscal_stimulus" and tile.kind is TileKind.TRANSPORT:
            percent += 5 * event.intensity
        elif event.kind == "credit_tightening" and tile.kind is TileKind.PROPERTY:
            percent -= 3 * event.intensity
    return max(60, min(140, percent))


def indexed_rent(game: GameState, tile: TileDefinition, amount: int) -> int:
    rent = indexed_amount(game, amount, 65)
    rent = (rent * rent_cycle_percent(game, tile) + 50) // 100
    if any(debt.player_id == game.owners.get(tile.id) for debt in game.economy.operating_debts):
        rent = (rent * 75 + 50) // 100
    return max(0, rent)


def operating_cost_multiplier_percent(game: GameState) -> int:
    percent = 100
    for event in game.economy.active_events:
        if event.kind in {"labor_dispute", "supply_shock"}:
            percent += 10 * event.intensity
        elif event.kind == "innovation_boom":
            percent -= 5 * event.intensity
    return max(70, min(150, percent))


def operating_costs_by_player(
    game: GameState,
    pack: ContentPack,
) -> dict[UUID, int]:
    if not game.settings.advanced_economy_enabled:
        return {}
    costs: dict[UUID, int] = {}
    multiplier = operating_cost_multiplier_percent(game)
    tiles = {tile.id: tile for tile in pack.board.tiles}
    for property_id, level in game.building_levels.items():
        owner_id = game.owners.get(property_id)
        tile = tiles.get(property_id)
        if owner_id is None or tile is None or level <= 0:
            continue
        player = next(
            (candidate for candidate in game.players if candidate.user_id == owner_id),
            None,
        )
        if player is None or player.bankrupt:
            continue
        replacement_cost = indexed_amount(game, building_replacement_cost(tile, level))
        cost = (
            replacement_cost * game.settings.operating_cost_percent * multiplier + 9_999
        ) // 10_000
        if cost > 0:
            costs[owner_id] = costs.get(owner_id, 0) + cost
    return costs


def public_project_terms(
    game: GameState,
    pack: ContentPack,
    kind: PublicProjectKind,
) -> tuple[int, int, TileKind, int]:
    base = pack.manifest.starting_balance
    if kind is PublicProjectKind.RAIL_MODERNIZATION:
        minimum = indexed_amount(game, base * 4)
        return minimum, minimum * 140 // 100, TileKind.TRANSPORT, 0
    if kind is PublicProjectKind.URBAN_RENEWAL:
        minimum = indexed_amount(game, base * 6)
        return minimum, minimum * 150 // 100, TileKind.PROPERTY, 2
    minimum = indexed_amount(game, base * 5)
    return minimum, minimum * 140 // 100, TileKind.UTILITY, 0


def qualifies_for_public_project(
    game: GameState,
    pack: ContentPack,
    player_id: UUID,
    required_kind: TileKind,
    required_building_levels: int,
) -> bool:
    owned = [
        tile
        for tile in pack.board.tiles
        if tile.kind is required_kind
        and game.owners.get(tile.id) == player_id
        and tile.id not in game.mortgaged_property_ids
    ]
    if not owned:
        return False
    return sum(game.building_levels.get(tile.id, 0) for tile in owned) >= (required_building_levels)


def audited_net_worth(
    game: GameState,
    pack: ContentPack,
    player: PlayerState,
) -> int:
    total = player.balance
    for tile in pack.board.tiles:
        if game.owners.get(tile.id) != player.user_id:
            continue
        base_value = (
            tile.mortgage_value if tile.id in game.mortgaged_property_ids else tile.price
        ) or 0
        total += indexed_amount(game, base_value)
        level = game.building_levels.get(tile.id, 0)
        total += (
            indexed_amount(game, building_replacement_cost(tile, level))
            * BUILDING_EQUITY_PERCENT
            // 100
        )
    for instrument in game.bank.investments:
        total += instrument.current_price * instrument.holdings.get(player.user_id, 0)
    total -= sum(
        loan.remaining_balance for loan in game.bank.loans if loan.player_id == player.user_id
    )
    total -= sum(
        plan.remaining_amount for plan in game.rent_debt_plans if plan.debtor_id == player.user_id
    )
    total -= sum(
        debt.remaining_amount
        for debt in game.economy.operating_debts
        if debt.player_id == player.user_id
    )
    if game.active_debt is not None and game.active_debt.debtor_id == player.user_id:
        total -= game.active_debt.amount
    return max(0, total)
