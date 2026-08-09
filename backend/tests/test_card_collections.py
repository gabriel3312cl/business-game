from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.card_collections import select_deck_collections
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError
from business_game.domain.models import ContentPack, CreateGameRequest, UserCreate


def test_selects_and_combines_collections_without_mutating_source(
    packs_dir: Path,
) -> None:
    source = PackLoader(packs_dir).load("classic-demo", "es")

    resolved, selected = select_deck_collections(
        source,
        {
            "opportunity": ["classic", "finance"],
            "community": ["finance"],
        },
    )

    assert selected == {
        "opportunity": ["classic", "finance"],
        "community": ["finance"],
    }
    assert {deck.id: len(deck.cards) for deck in resolved.board.decks} == {
        "opportunity": 19,
        "community": 4,
    }
    assert {deck.id: len(deck.cards) for deck in source.board.decks} == {
        "opportunity": 40,
        "community": 41,
    }


def test_rejects_unknown_or_empty_collection_selection(packs_dir: Path) -> None:
    pack = PackLoader(packs_dir).load("classic-demo", "es")

    with pytest.raises(ConflictError, match="unknown collections"):
        select_deck_collections(pack, {"opportunity": ["missing"]})
    with pytest.raises(ConflictError, match="at least one"):
        select_deck_collections(pack, {"opportunity": []})


def test_accepts_all_available_collections_per_deck(packs_dir: Path) -> None:
    pack = PackLoader(packs_dir).load("classic-demo", "es")
    all_collections = {
        deck.id: [collection.id for collection in deck.collections]
        for deck in pack.board.decks
        if deck.collections
    }

    resolved, selected = select_deck_collections(pack, all_collections)
    persisted = ContentPack.model_validate(resolved.model_dump())
    request = CreateGameRequest(
        pack_id="classic-demo",
        deck_collection_ids=all_collections,
    )

    assert selected == all_collections
    assert request.deck_collection_ids == all_collections
    assert {
        deck.id: deck.default_collection_ids for deck in persisted.board.decks
    } == all_collections
    assert {
        deck.id: [card.id for card in deck.cards] for deck in resolved.board.decks
    } == {deck.id: [card.id for card in deck.cards] for deck in pack.board.decks}


def test_semantic_targets_resolve_on_both_builtin_boards(packs_dir: Path) -> None:
    loader = PackLoader(packs_dir)

    for pack_id, expected_tile_id in (
        ("classic-demo", "property_24"),
        ("extended-demo", "property_27"),
    ):
        pack = loader.load(pack_id, "es")
        target = next(
            tile for tile in pack.board.tiles if "illinois_avenue" in tile.card_tags
        )
        card = next(
            card
            for deck in pack.board.decks
            for card in deck.cards
            if card.id == "opportunity_illinois"
        )

        assert target.id == expected_tile_id
        assert card.resolved_effects()[0].tile_tag == "illinois_avenue"


async def test_game_snapshot_persists_selected_collections(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    user = await UserService(session).register(
        UserCreate(
            email="decks@example.com",
            password="correct-horse-battery",
            display_name="Deck Host",
        )
    )
    game = await GameService(session, PackLoader(packs_dir)).create(
        "classic-demo",
        user,
        deck_collection_ids={
            "opportunity": ["classic", "finance"],
            "community": ["finance"],
        },
    )

    assert game.deck_collection_ids == {
        "opportunity": ["classic", "finance"],
        "community": ["finance"],
    }
    assert game.pack_snapshot is not None
    assert {deck.id: len(deck.cards) for deck in game.pack_snapshot.board.decks} == {
        "opportunity": 19,
        "community": 4,
    }


async def test_create_game_api_accepts_collection_selection(
    client: AsyncClient,
) -> None:
    created = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "deck-api@example.com",
            "password": "correct-horse-battery",
            "display_name": "Deck API",
            "locale": "es",
        },
    )
    assert created.status_code == 201
    token = await client.post(
        "/api/v1/auth/token",
        data={"username": "deck-api@example.com", "password": "correct-horse-battery"},
    )
    headers = {"Authorization": f"Bearer {token.json()['access_token']}"}

    response = await client.post(
        "/api/v1/games",
        headers=headers,
        json={
            "pack_id": "classic-demo",
            "deck_collection_ids": {
                "opportunity": ["classic", "finance"],
                "community": ["finance"],
            },
        },
    )

    assert response.status_code == 201
    assert response.json()["deck_collection_ids"] == {
        "opportunity": ["classic", "finance"],
        "community": ["finance"],
    }
