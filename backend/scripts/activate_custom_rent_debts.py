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
            ).activate_custom_rent_debts(game_id)
        print(
            "custom rent debts enabled",
            f"game={game.id}",
            f"status={game.status.value}",
            f"sequence={game.event_sequence}",
        )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enable custom rent debt terms in an existing game.",
    )
    parser.add_argument("game_id", type=UUID)
    args = parser.parse_args()
    asyncio.run(activate(args.game_id))


if __name__ == "__main__":
    main()
