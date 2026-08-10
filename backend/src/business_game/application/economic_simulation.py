from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from datetime import timedelta

from business_game.domain.models import (
    ContentPack,
    EconomicCycle,
    EconomicDifficulty,
    EconomicEventState,
    EconomicSeason,
    GameState,
    MarketMovementState,
    WeatherCondition,
)


@dataclass(frozen=True)
class DifficultyProfile:
    volatility_percent: int
    event_chance_percent: int
    maximum_weekly_move_basis_points: int
    mean_reversion_percent: int


DIFFICULTY_PROFILES = {
    EconomicDifficulty.NOVICE: DifficultyProfile(45, 7, 400, 22),
    EconomicDifficulty.EASY: DifficultyProfile(70, 10, 600, 16),
    EconomicDifficulty.STANDARD: DifficultyProfile(100, 14, 900, 11),
    EconomicDifficulty.PRO: DifficultyProfile(125, 19, 1300, 7),
    EconomicDifficulty.REALISTIC: DifficultyProfile(150, 24, 1800, 4),
}

WEATHER_BY_SEASON = {
    EconomicSeason.SUMMER: (
        WeatherCondition.CLEAR,
        WeatherCondition.CLEAR,
        WeatherCondition.HEATWAVE,
        WeatherCondition.DROUGHT,
        WeatherCondition.RAIN,
    ),
    EconomicSeason.AUTUMN: (
        WeatherCondition.CLEAR,
        WeatherCondition.RAIN,
        WeatherCondition.RAIN,
        WeatherCondition.STORM,
        WeatherCondition.COLD_WAVE,
    ),
    EconomicSeason.WINTER: (
        WeatherCondition.RAIN,
        WeatherCondition.RAIN,
        WeatherCondition.STORM,
        WeatherCondition.COLD_WAVE,
        WeatherCondition.CLEAR,
    ),
    EconomicSeason.SPRING: (
        WeatherCondition.CLEAR,
        WeatherCondition.CLEAR,
        WeatherCondition.RAIN,
        WeatherCondition.STORM,
        WeatherCondition.HEATWAVE,
    ),
}

# growth, inflation, confidence, sentiment, broad market basis points
WEATHER_EFFECTS = {
    WeatherCondition.CLEAR: (3, -1, 2, 2, 8),
    WeatherCondition.RAIN: (-2, 1, -1, -1, -8),
    WeatherCondition.STORM: (-10, 5, -5, -5, -45),
    WeatherCondition.HEATWAVE: (-5, 6, -3, -2, -18),
    WeatherCondition.COLD_WAVE: (-7, 5, -4, -3, -28),
    WeatherCondition.DROUGHT: (-12, 10, -6, -6, -55),
}

# growth, inflation, policy rate, confidence, sentiment, broad market bp
EVENT_EFFECTS = {
    "innovation_boom": (12, -2, -2, 7, 8, 90),
    "supply_shock": (-13, 16, 7, -8, -10, -120),
    "credit_tightening": (-9, -5, 15, -6, -8, -95),
    "consumer_boom": (10, 7, 4, 8, 7, 75),
    "labor_dispute": (-11, 8, 2, -7, -8, -105),
    "fiscal_stimulus": (11, 6, 3, 6, 6, 70),
}

EVENT_KINDS = tuple(EVENT_EFFECTS)
COMPANY_ACTIONS = {
    "expansion": 85,
    "efficiency_plan": 65,
    "new_contract": 105,
    "dividend_warning": -110,
    "labor_conflict": -90,
    "debt_restructuring": -70,
}


def initialize_economic_simulation(game: GameState) -> None:
    game.economy.season = season_for_month(game.economy.current_date.month)


def advance_economic_week(game: GameState, pack: ContentPack) -> dict[str, object]:
    economy = game.economy
    profile = DIFFICULTY_PROFILES[game.settings.economic_difficulty]
    economy.current_date += timedelta(days=7)
    economy.elapsed_weeks += 1
    economy.season = season_for_month(economy.current_date.month)
    roller = _week_random(game)

    economy.weather = roller.choice(WEATHER_BY_SEASON[economy.season])
    economy.weather_intensity = _weather_intensity(roller, economy.weather)
    weather_effect = WEATHER_EFFECTS[economy.weather]

    retained_events: list[EconomicEventState] = []
    for active_event in economy.active_events:
        if active_event.remaining_weeks > 1:
            retained_events.append(
                active_event.model_copy(
                    update={"remaining_weeks": active_event.remaining_weeks - 1},
                )
            )
    economy.active_events = retained_events
    started_event: EconomicEventState | None = None
    if (
        len(economy.active_events) < 3
        and roller.randrange(100) < profile.event_chance_percent
    ):
        kind = roller.choice(EVENT_KINDS)
        if all(event.kind != kind for event in economy.active_events):
            started_event = EconomicEventState(
                kind=kind,
                remaining_weeks=roller.randint(2, 6),
                intensity=roller.choices((1, 2, 3), weights=(60, 30, 10), k=1)[0],
            )
            economy.active_events.append(started_event)

    growth_effect = weather_effect[0] * economy.weather_intensity
    inflation_effect = weather_effect[1] * economy.weather_intensity
    policy_effect = 0
    confidence_effect = weather_effect[2] * economy.weather_intensity
    sentiment_effect = weather_effect[3] * economy.weather_intensity
    market_effect = weather_effect[4] * economy.weather_intensity
    for active_event in economy.active_events:
        effect = EVENT_EFFECTS[active_event.kind]
        growth_effect += effect[0] * active_event.intensity
        inflation_effect += effect[1] * active_event.intensity
        policy_effect += effect[2] * active_event.intensity
        confidence_effect += effect[3] * active_event.intensity
        sentiment_effect += effect[4] * active_event.intensity
        market_effect += effect[5] * active_event.intensity

    previous_growth = economy.annual_growth_basis_points
    economy.annual_growth_basis_points = _bounded_indicator(
        previous_growth,
        target=220,
        random_delta=roller.randint(-18, 18),
        effect=growth_effect,
        mean_reversion=profile.mean_reversion_percent,
        lower=-1500,
        upper=2000,
    )
    economy.annual_inflation_basis_points = _bounded_indicator(
        economy.annual_inflation_basis_points,
        target=300,
        random_delta=roller.randint(-10, 10),
        effect=inflation_effect,
        mean_reversion=profile.mean_reversion_percent,
        lower=0,
        upper=5000,
    )
    inflation_gap = economy.annual_inflation_basis_points - 300
    economy.policy_rate_basis_points = _bounded_indicator(
        economy.policy_rate_basis_points,
        target=450,
        random_delta=roller.randint(-5, 5),
        effect=policy_effect + inflation_gap // 40,
        mean_reversion=profile.mean_reversion_percent,
        lower=0,
        upper=5000,
    )
    growth_change = economy.annual_growth_basis_points - previous_growth
    economy.unemployment_basis_points = max(
        100,
        min(
            5000,
            economy.unemployment_basis_points
            - growth_change // 3
            + roller.randint(-4, 4),
        ),
    )
    economy.consumer_confidence = max(
        0,
        min(
            200,
            economy.consumer_confidence
            + confidence_effect
            + growth_change // 12
            + roller.randint(-2, 2),
        ),
    )
    economy.market_sentiment = max(
        -100,
        min(
            100,
            economy.market_sentiment
            + sentiment_effect
            + growth_change // 10
            + roller.randint(-3, 3),
        ),
    )
    economy.cycle = _economic_cycle(economy.annual_growth_basis_points, growth_change)

    company_action, company_instrument_id = _company_action(game, roller)
    economy.last_company_action = company_action
    economy.last_company_instrument_id = company_instrument_id
    economy.last_market_movements = _move_markets(
        game,
        pack,
        roller,
        profile,
        market_effect,
        company_action,
        company_instrument_id,
    )

    return {
        "date": economy.current_date.isoformat(),
        "elapsed_weeks": economy.elapsed_weeks,
        "season": economy.season.value,
        "weather": economy.weather.value,
        "weather_intensity": economy.weather_intensity,
        "cycle": economy.cycle.value,
        "difficulty": game.settings.economic_difficulty.value,
        "growth_basis_points": economy.annual_growth_basis_points,
        "inflation_basis_points": economy.annual_inflation_basis_points,
        "policy_rate_basis_points": economy.policy_rate_basis_points,
        "unemployment_basis_points": economy.unemployment_basis_points,
        "consumer_confidence": economy.consumer_confidence,
        "market_sentiment": economy.market_sentiment,
        "started_event": started_event.model_dump(mode="json") if started_event else None,
        "active_events": [event.model_dump(mode="json") for event in economy.active_events],
        "company_action": company_action,
        "company_instrument_id": company_instrument_id,
        "market_movements": [
            movement.model_dump(mode="json")
            for movement in economy.last_market_movements
        ],
    }


def season_for_month(month: int) -> EconomicSeason:
    if month in {12, 1, 2}:
        return EconomicSeason.SUMMER
    if month in {3, 4, 5}:
        return EconomicSeason.AUTUMN
    if month in {6, 7, 8}:
        return EconomicSeason.WINTER
    return EconomicSeason.SPRING


def _week_random(game: GameState) -> random.Random:
    digest = hashlib.sha256(
        f"{game.id}:{game.economy.elapsed_weeks}:economic-week".encode(),
    ).digest()
    return random.Random(int.from_bytes(digest[:8]))


def _weather_intensity(
    roller: random.Random,
    weather: WeatherCondition,
) -> int:
    if weather is WeatherCondition.CLEAR:
        return 1
    return roller.choices((1, 2, 3), weights=(62, 30, 8), k=1)[0]


def _bounded_indicator(
    current: int,
    *,
    target: int,
    random_delta: int,
    effect: int,
    mean_reversion: int,
    lower: int,
    upper: int,
) -> int:
    reversion = (target - current) * mean_reversion // 100
    return max(lower, min(upper, current + reversion + random_delta + effect))


def _economic_cycle(growth: int, growth_change: int) -> EconomicCycle:
    if growth < 0:
        return EconomicCycle.RECESSION
    if growth_change >= 12 and growth < 250:
        return EconomicCycle.RECOVERY
    if growth < 140 or growth_change < -20:
        return EconomicCycle.SLOWDOWN
    return EconomicCycle.EXPANSION


def _company_action(
    game: GameState,
    roller: random.Random,
) -> tuple[str | None, str | None]:
    candidates = [
        instrument
        for instrument in game.bank.investments
        if instrument.instrument_kind == "asset"
    ]
    if not game.settings.rules.stock_market_enabled or not candidates:
        return None, None
    if roller.randrange(100) >= 38:
        return None, None
    instrument = roller.choice(candidates)
    return roller.choice(tuple(COMPANY_ACTIONS)), instrument.id


def _move_markets(
    game: GameState,
    pack: ContentPack,
    roller: random.Random,
    profile: DifficultyProfile,
    broad_market_effect: int,
    company_action: str | None,
    company_instrument_id: str | None,
) -> list[MarketMovementState]:
    if not game.settings.rules.stock_market_enabled:
        return []
    tile_kind_by_id = {tile.id: tile.kind.value for tile in pack.board.tiles}
    movements: list[MarketMovementState] = []
    for instrument in game.bank.investments:
        if instrument.instrument_kind == "index":
            continue
        previous_price = instrument.current_price
        weather_sector_effect = _weather_sector_effect(
            game.economy.weather,
            tile_kind_by_id.get(instrument.tile_id),
            instrument.instrument_kind,
        )
        action_effect = (
            COMPANY_ACTIONS[company_action]
            if company_action is not None
            and instrument.id == company_instrument_id
            else 0
        )
        raw_basis_points = (
            broad_market_effect
            + game.economy.market_sentiment * 3
            + game.economy.annual_growth_basis_points // 8
            - max(0, game.economy.policy_rate_basis_points - 450) // 4
            + weather_sector_effect
            + action_effect
            + roller.randint(-85, 85)
        )
        change_basis_points = raw_basis_points * profile.volatility_percent // 100
        change_basis_points = max(
            -profile.maximum_weekly_move_basis_points,
            min(profile.maximum_weekly_move_basis_points, change_basis_points),
        )
        current_price = max(
            1,
            (previous_price * (10_000 + change_basis_points) + 5_000) // 10_000,
        )
        instrument.current_price = current_price
        instrument.session_high = max(instrument.session_high, current_price)
        instrument.session_low = min(
            instrument.session_low or current_price,
            current_price,
        )
        primary_cause = _primary_cause(
            action_effect,
            broad_market_effect,
            weather_sector_effect,
        )
        movements.append(
            MarketMovementState(
                instrument_id=instrument.id,
                previous_price=previous_price,
                current_price=current_price,
                change_basis_points=change_basis_points,
                primary_cause=primary_cause,
            )
        )
    movements.sort(key=lambda item: abs(item.change_basis_points), reverse=True)
    return movements[:8]


def _weather_sector_effect(
    weather: WeatherCondition,
    tile_kind: str | None,
    instrument_kind: str,
) -> int:
    if instrument_kind == "bank":
        return 35 if weather in {WeatherCondition.CLEAR, WeatherCondition.RAIN} else -25
    if tile_kind == "utility":
        return {
            WeatherCondition.HEATWAVE: 100,
            WeatherCondition.COLD_WAVE: 90,
            WeatherCondition.STORM: 55,
            WeatherCondition.DROUGHT: 45,
        }.get(weather, 0)
    if tile_kind == "transport":
        return {
            WeatherCondition.STORM: -120,
            WeatherCondition.COLD_WAVE: -80,
            WeatherCondition.DROUGHT: -30,
            WeatherCondition.CLEAR: 35,
        }.get(weather, 0)
    return 0


def _primary_cause(
    action_effect: int,
    broad_market_effect: int,
    weather_sector_effect: int,
) -> str:
    candidates = {
        "company_action": abs(action_effect),
        "economic_event": abs(broad_market_effect),
        "weather": abs(weather_sector_effect),
        "market_sentiment": 30,
    }
    return max(candidates, key=candidates.__getitem__)
