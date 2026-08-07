from __future__ import annotations

import argparse
import asyncio
from uuid import UUID

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService
from business_game.config import settings
from business_game.infrastructure.database import engine, session_factory


async def activate(game_id: UUID) -> None:
    try:
        async with session_factory() as session:
            game = await GameService(
                session,
                PackLoader(settings.packs_dir),
            ).activate_financial_features(game_id)
        print(
            "financial features enabled",
            f"game={game.id}",
            f"base={game.bank.monetary_base}",
            f"cash={game.bank.cash}",
            f"investments={len(game.bank.investments)}",
            f"sequence={game.event_sequence}",
        )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enable loans and investments in an existing game.",
    )
    parser.add_argument("game_id", type=UUID)
    args = parser.parse_args()
    asyncio.run(activate(args.game_id))


if __name__ == "__main__":
    main()
