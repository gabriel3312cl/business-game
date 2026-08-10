from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.economic_simulation import advance_economic_week
from business_game.application.economy import initialize_bank
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
    EconomicDifficulty,
    EconomicSeason,
    EndTurnCommand,
    GameSettings,
    GameState,
    OptionalRules,
    PlayerState,
    RollCommand,
    UserCreate,
)


def economic_game(packs_dir: Path, difficulty: EconomicDifficulty) -> tuple[GameState, object]:
    pack = PackLoader(packs_dir).load("classic-demo")
    host_id = uuid4()
    game = GameState(
        id=UUID("d6b09198-7f05-4f18-8c18-05ab3d398090"),
        host_user_id=host_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        players=[
            PlayerState(
                user_id=host_id,
                display_name="Host",
                balance=pack.manifest.starting_balance,
            ),
            PlayerState(
                user_id=uuid4(),
                display_name="Guest",
                balance=pack.manifest.starting_balance,
            ),
        ],
        settings=GameSettings(
            economic_difficulty=difficulty,
            rules=OptionalRules(stock_market_enabled=True),
        ),
    )
    game.economy.current_date = date(2026, 8, 10)
    initialize_bank(game, pack)
    return game, pack


def test_economic_week_advances_calendar_and_explains_market(
    packs_dir: Path,
) -> None:
    game, pack = economic_game(packs_dir, EconomicDifficulty.STANDARD)

    event = advance_economic_week(game, pack)

    assert game.economy.current_date == date(2026, 8, 17)
    assert game.economy.elapsed_weeks == 1
    assert game.economy.season is EconomicSeason.WINTER
    assert event["date"] == "2026-08-17"
    assert event["difficulty"] == "standard"
    assert game.economy.last_market_movements
    assert all(
        movement.primary_cause
        in {"company_action", "economic_event", "weather", "market_sentiment"}
        for movement in game.economy.last_market_movements
    )
    assert all(
        abs(movement.change_basis_points) <= 900
        for movement in game.economy.last_market_movements
    )


def test_same_game_and_week_produce_same_authoritative_outcome(
    packs_dir: Path,
) -> None:
    first, pack = economic_game(packs_dir, EconomicDifficulty.STANDARD)
    second = first.model_copy(deep=True)

    first_event = advance_economic_week(first, pack)
    second_event = advance_economic_week(second, pack)

    assert first_event == second_event
    assert first.economy == second.economy
    assert first.bank.investments == second.bank.investments


def test_difficulty_scales_market_risk_without_changing_the_calendar(
    packs_dir: Path,
) -> None:
    novice, pack = economic_game(packs_dir, EconomicDifficulty.NOVICE)
    realistic = novice.model_copy(deep=True)
    realistic.settings.economic_difficulty = EconomicDifficulty.REALISTIC

    advance_economic_week(novice, pack)
    advance_economic_week(realistic, pack)

    novice_moves = {
        movement.instrument_id: abs(movement.change_basis_points)
        for movement in novice.economy.last_market_movements
    }
    realistic_moves = {
        movement.instrument_id: abs(movement.change_basis_points)
        for movement in realistic.economy.last_market_movements
    }
    assert novice.economy.current_date == realistic.economy.current_date
    assert all(
        realistic_moves[instrument_id] >= movement
        for instrument_id, movement in novice_moves.items()
    )


async def test_created_difficulty_and_completed_round_advance_one_week(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await UserService(session).register(
        UserCreate(
            email="economic-host@example.com",
            password="correct-horse-battery",
            display_name="Host",
        )
    )
    guest = await UserService(session).register(
        UserCreate(
            email="economic-guest@example.com",
            password="correct-horse-battery",
            display_name="Guest",
        )
    )
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 3),
        clock=lambda: datetime(2026, 8, 10, 12, tzinfo=UTC),
    )
    game = await games.create(
        "classic-demo",
        host,
        economic_difficulty=EconomicDifficulty.PRO,
    )
    await games.join(game.id, guest)
    game = await games.start(game.id, host.id)

    for player in (host, guest):
        game = await games.execute(game.id, player.id, RollCommand(action="roll"))
        game = await games.execute(
            game.id,
            player.id,
            EndTurnCommand(action="end_turn"),
        )

    assert game.settings.economic_difficulty is EconomicDifficulty.PRO
    assert game.economy.current_date == date(2026, 8, 17)
    assert game.economy.elapsed_weeks == 1
    week_event = next(
        event for event in game.events if event.type == "economy.week_advanced"
    )
    assert week_event.data["difficulty"] == "pro"
