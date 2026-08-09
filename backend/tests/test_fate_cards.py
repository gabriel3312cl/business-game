from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.models import (
    AllPlayersMoveRelativeCardEffect,
    EqualizeCashCardEffect,
    PlayerState,
    SalaryCashCardEffect,
    SwapPositionCardEffect,
    UserCreate,
)


def test_fate_collection_is_large_portable_and_localized(packs_dir: Path) -> None:
    loader = PackLoader(packs_dir)

    for pack_id in ("classic-demo", "extended-demo"):
        pack = loader.load(pack_id, "es")
        collections = {
            (deck.id, collection.id): collection
            for deck in pack.board.decks
            for collection in deck.collections
        }

        opportunity = collections[("opportunity", "fate")]
        community = collections[("community", "fate")]
        assert len(opportunity.card_ids) == 15
        assert len(community.card_ids) == 15
        assert pack.messages[opportunity.name_key] == "Giros del Destino"
        assert pack.messages[community.name_key] == "Giros del Destino"
        assert all(
            card.message_key in pack.messages
            for deck in pack.board.decks
            for card in deck.cards
            if card.id in opportunity.card_ids + community.card_ids
        )


async def _fate_game(
    packs_dir: Path,
    session: AsyncSession,
    pack_id: str = "classic-demo",
):
    host = await UserService(session).register(
        UserCreate(
            email="fate-effects@example.com",
            password="correct-horse-battery",
            display_name="Fate Host",
        )
    )
    service = GameService(session, PackLoader(packs_dir))
    game = await service.create(pack_id, host)
    game.players.extend(
        [
            PlayerState(user_id=uuid4(), display_name="Rich"),
            PlayerState(user_id=uuid4(), display_name="Poor"),
        ]
    )
    return service, game


@pytest.mark.parametrize(
    ("pack_id", "expected_increase"),
    [("classic-demo", 300), ("extended-demo", 450)],
)
async def test_salary_effect_scales_with_board_economy(
    packs_dir: Path,
    session: AsyncSession,
    pack_id: str,
    expected_increase: int,
) -> None:
    service, game = await _fate_game(packs_dir, session, pack_id)
    player = game.players[0]
    player.balance = 1_000

    service._apply_effect(
        game,
        player,
        SalaryCashCardEffect(type="salary_cash", salary_percent=150),
        source_id="test_salary",
    )

    assert player.balance == 1_000 + expected_increase
    assert game.events[-1].type == "card.cash_applied"
    assert game.events[-1].data["amount"] == expected_increase


async def test_equalize_cash_targets_player_by_net_worth(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    service, game = await _fate_game(packs_dir, session)
    player, rich, poor = game.players
    player.balance = 1_000
    rich.balance = 3_000
    poor.balance = 500

    service._apply_effect(
        game,
        player,
        EqualizeCashCardEffect(type="equalize_cash", target="wealthiest"),
        source_id="test_equalize",
    )

    assert player.balance == rich.balance == 2_000
    assert poor.balance == 500
    assert game.events[-1].type == "card.cash_equalized"
    assert game.events[-1].data["target_player_id"] == str(rich.user_id)


async def test_swap_position_does_not_resolve_destinations(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    service, game = await _fate_game(packs_dir, session)
    player, rich, poor = game.players
    player.position = 2
    rich.position = 7
    poor.position = 12
    player.balance = 1_000
    rich.balance = 3_000
    poor.balance = 500

    service._apply_effect(
        game,
        player,
        SwapPositionCardEffect(type="swap_position", target="wealthiest"),
        source_id="test_swap",
    )

    assert player.position == 7
    assert rich.position == 2
    assert poor.position == 12
    assert [event.type for event in game.events[-2:]] == [
        "card.player_moved",
        "card.player_moved",
    ]
    assert game.pending_tile_id is None


async def test_mass_movement_moves_every_active_player_and_collects_salary(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    service, game = await _fate_game(packs_dir, session)
    player, second, bankrupt = game.players
    player.position = 38
    second.position = 5
    bankrupt.position = 10
    bankrupt.bankrupt = True
    initial_balance = player.balance

    service._apply_effect(
        game,
        player,
        AllPlayersMoveRelativeCardEffect(
            type="all_players_move_relative",
            steps=5,
            collect_start=True,
        ),
        source_id="test_mass_move",
    )

    assert player.position == 3
    assert player.balance == initial_balance + 200
    assert second.position == 10
    assert bankrupt.position == 10
    moved_ids = {
        event.data["player_id"]
        for event in game.events
        if event.type == "card.player_moved"
    }
    assert moved_ids == {str(player.user_id), str(second.user_id)}
