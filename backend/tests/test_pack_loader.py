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
    assert len(classic.board.tiles) == 40
    assert classic.messages["pack.name"] == "Ciudad Clásica"
    classic_property = next(
        tile for tile in classic.board.tiles if tile.kind.value == "property"
    )
    assert classic_property.mortgage_value is not None
    assert classic_property.build_cost is not None
    assert len(classic_property.rent_levels or []) == 6
    assert {deck.id for deck in classic.board.decks} == {
        "community",
        "opportunity",
    }
    assert classic.manifest.default_rules.auction_unpurchased_properties
    assert len(classic.manifest.configurable_rules) == 3

    assert extended.manifest.side_length == 17
    assert len(extended.board.tiles) == 64
    assert extended.messages["pack.name"] == "Extended World"
    assert extended.board.tiles[16].kind.value == "jail"
    assert extended.board.tiles[32].kind.value == "free"
    assert extended.board.tiles[48].kind.value == "go_to_jail"


def test_rejects_an_unavailable_pack_version(packs_dir: Path) -> None:
    with pytest.raises(NotFoundError, match="version '0.9.0'"):
        PackLoader(packs_dir).load("classic-demo", version="0.9.0")
