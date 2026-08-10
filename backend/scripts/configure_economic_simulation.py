from __future__ import annotations

import argparse
import asyncio
from uuid import UUID

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.models import EconomicDifficulty
from business_game.infrastructure.database import engine, session_factory


async def configure(game_id: UUID, difficulty: EconomicDifficulty) -> None:
    try:
        async with session_factory() as session:
            game = await GameService(
                session,
                PackLoader(settings.packs_dir),
            ).configure_economic_simulation(game_id, difficulty)
        print(
            "economic simulation configured",
            f"game={game.id}",
            f"difficulty={game.settings.economic_difficulty.value}",
            f"date={game.economy.current_date.isoformat()}",
            f"season={game.economy.season.value}",
            f"sequence={game.event_sequence}",
        )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Configure the economic simulation of an existing game.",
    )
    parser.add_argument("game_id", type=UUID)
    parser.add_argument(
        "difficulty",
        type=EconomicDifficulty,
        choices=list(EconomicDifficulty),
    )
    args = parser.parse_args()
    asyncio.run(configure(args.game_id, args.difficulty))


if __name__ == "__main__":
    main()
