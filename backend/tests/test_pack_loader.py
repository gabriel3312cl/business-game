import json
import shutil
from pathlib import Path

import pytest

from business_game.application.pack_loader import PackLoader
from business_game.domain.errors import NotFoundError


def test_loads_classic_and_extended_topologies(packs_dir: Path) -> None:
    loader = PackLoader(packs_dir)
    classic = loader.load("classic-demo", "es")
    extended = loader.load("extended-demo", "en")

    assert classic.manifest.side_length == 11
    assert classic.manifest.schema_version == 4
    assert classic.manifest.starting_balance == 1500
    assert classic.manifest.version == "2.0.0"
    assert classic.manifest.house_supply == 32
    assert classic.manifest.hotel_supply == 12
    assert len(classic.board.tiles) == 40
    assert classic.messages["pack.name"] == "Monopoly Clásico"
    classic_property = next(
        tile for tile in classic.board.tiles if tile.kind.value == "property"
    )
    assert classic_property.mortgage_value is not None
    assert classic_property.build_cost is not None
    assert len(classic_property.rent_levels or []) == 6
    assert len(classic.board.groups) == 8
    assert sum(tile.kind.value == "property" for tile in classic.board.tiles) == 22
    assert classic.board.tiles[1].rent_levels == [2, 10, 30, 90, 160, 250]
    assert classic.board.tiles[38].amount == 75
    assert classic.board.tiles[39].rent_levels == [50, 200, 600, 1400, 1700, 2000]
    assert {deck.id for deck in classic.board.decks} == {
        "community",
        "opportunity",
    }
    assert all(len(deck.cards) == 16 for deck in classic.board.decks)
    assert classic.manifest.default_rules.auction_unpurchased_properties
    assert len(classic.manifest.configurable_rules) == 3

    assert extended.manifest.side_length == 17
    assert extended.manifest.version == "2.0.0"
    assert extended.manifest.starting_balance == 2800
    assert extended.manifest.pass_start_salary == 300
    assert extended.manifest.jail_fine == 75
    assert extended.manifest.house_supply == 48
    assert extended.manifest.hotel_supply == 18
    assert len(extended.board.tiles) == 64
    assert extended.messages["pack.name"] == "Extended Monopoly"
    assert len(extended.board.groups) == 12
    assert sum(tile.kind.value == "property" for tile in extended.board.tiles) == 34
    assert sum(tile.kind.value == "transport" for tile in extended.board.tiles) == 6
    assert sum(tile.kind.value == "utility" for tile in extended.board.tiles) == 4
    assert sum(tile.price or 0 for tile in extended.board.tiles) == 11_380
    assert sum(tile.auction_minimum_bid == 10 for tile in extended.board.tiles) == 2
    assert all(len(deck.cards) == 20 for deck in extended.board.decks)
    assert extended.board.tiles[16].kind.value == "jail"
    assert extended.board.tiles[32].kind.value == "free"
    assert extended.board.tiles[48].kind.value == "go_to_jail"


def test_rejects_an_unavailable_pack_version(packs_dir: Path) -> None:
    with pytest.raises(NotFoundError, match="version '0.9.0'"):
        PackLoader(packs_dir).load("classic-demo", version="0.9.0")


def test_optional_deck_and_card_i18n_keys_are_validated_and_preserved(
    packs_dir: Path,
    tmp_path: Path,
) -> None:
    pack_dir = tmp_path / "classic-demo"
    shutil.copytree(packs_dir / "classic-demo", pack_dir)
    board_path = pack_dir / "board.json"
    board = json.loads(board_path.read_text())
    deck = board["decks"][0]
    deck["name_key"] = "deck.custom.name"
    deck["cards"][0]["title_key"] = "card.custom.title"
    board_path.write_text(json.dumps(board))

    messages_path = pack_dir / "locales" / "es.json"
    messages = json.loads(messages_path.read_text())
    messages["deck.custom.name"] = "Mazo personalizado"
    messages_path.write_text(json.dumps(messages))

    with pytest.raises(ValueError, match="card.custom.title"):
        PackLoader(tmp_path).load("classic-demo", locale="es")

    messages["card.custom.title"] = "Título personalizado"
    messages_path.write_text(json.dumps(messages))
    loaded = PackLoader(tmp_path).load("classic-demo", locale="es")

    assert loaded.board.decks[0].name_key == "deck.custom.name"
    assert loaded.board.decks[0].cards[0].title_key == "card.custom.title"
