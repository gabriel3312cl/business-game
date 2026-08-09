import json
import re
from pathlib import Path

from business_game.domain.errors import NotFoundError
from business_game.domain.models import (
    BoardDefinition,
    ContentPack,
    InteractiveChoiceCardEffect,
    MoveToNearestAuctionCardEffect,
    PackManifest,
    TileKind,
)


class PackLoader:
    def __init__(self, root: Path):
        self.root = root

    def list(self) -> list[PackManifest]:
        manifests: list[PackManifest] = []
        if not self.root.exists():
            return manifests
        for path in sorted(self.root.glob("*/manifest.json")):
            manifests.append(PackManifest.model_validate_json(path.read_text()))
        return manifests

    def load(
        self,
        pack_id: str,
        locale: str | None = None,
        version: str | None = None,
    ) -> ContentPack:
        if re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", pack_id) is None:
            raise NotFoundError(f"pack '{pack_id}' was not found")
        pack_dir = self.root / pack_id
        if not pack_dir.is_dir():
            raise NotFoundError(f"pack '{pack_id}' was not found")

        manifest = PackManifest.model_validate_json(
            (pack_dir / "manifest.json").read_text()
        )
        if version is not None and manifest.version != version:
            raise NotFoundError(
                f"pack '{pack_id}' version '{version}' is not available"
            )
        board = BoardDefinition.model_validate_json((pack_dir / "board.json").read_text())
        if len(board.tiles) != manifest.tile_count:
            raise ValueError(
                f"pack '{pack_id}' declares {manifest.tile_count} tiles "
                f"but contains {len(board.tiles)}"
            )
        tile_ids = [tile.id for tile in board.tiles]
        if len(tile_ids) != len(set(tile_ids)):
            raise ValueError(f"pack '{pack_id}' contains duplicate tile ids")
        card_tags = [tag for tile in board.tiles for tag in tile.card_tags]
        if len(card_tags) != len(set(card_tags)):
            raise ValueError(f"pack '{pack_id}' contains duplicate card target tags")
        for required_kind in (TileKind.START, TileKind.JAIL, TileKind.GO_TO_JAIL):
            if sum(tile.kind is required_kind for tile in board.tiles) != 1:
                raise ValueError(
                    f"pack '{pack_id}' must contain exactly one "
                    f"'{required_kind.value}' tile"
                )
        deck_ids = [deck.id for deck in board.decks]
        if len(deck_ids) != len(set(deck_ids)):
            raise ValueError(f"pack '{pack_id}' contains duplicate deck ids")
        card_ids = [card.id for deck in board.decks for card in deck.cards]
        if len(card_ids) != len(set(card_ids)):
            raise ValueError(f"pack '{pack_id}' contains duplicate card ids")
        known_deck_ids = set(deck_ids)
        for tile in board.tiles:
            if tile.deck_id is not None and tile.deck_id not in known_deck_ids:
                raise ValueError(
                    f"pack '{pack_id}' tile '{tile.id}' references an unknown deck"
                )
        known_tile_ids = set(tile_ids)
        group_ids = [group.id for group in board.groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError(f"pack '{pack_id}' contains duplicate property groups")
        known_group_ids = set(group_ids)
        for tile in board.tiles:
            if (
                tile.kind is TileKind.PROPERTY
                and known_group_ids
                and tile.group not in known_group_ids
            ):
                raise ValueError(
                    f"pack '{pack_id}' tile '{tile.id}' references an unknown group"
                )
        for deck in board.decks:
            for card in deck.cards:
                for effect in card.resolved_effects():
                    self._validate_effect_reference(
                        pack_id,
                        card.id,
                        effect,
                        known_tile_ids,
                        board,
                    )
        for tile in board.tiles:
            for effect in tile.landing_effects:
                self._validate_effect_reference(
                    pack_id,
                    tile.id,
                    effect,
                    known_tile_ids,
                    board,
                )

        selected_locale = locale if locale in manifest.locales else manifest.default_locale
        messages = json.loads(
            (pack_dir / "locales" / f"{selected_locale}.json").read_text()
        )
        required_keys = {
            manifest.name_key,
            *(group.name_key for group in board.groups),
            *(tile.name_key for tile in board.tiles),
            *(deck.name_key for deck in board.decks if deck.name_key is not None),
            *(
                collection.name_key
                for deck in board.decks
                for collection in deck.collections
            ),
            *(card.message_key for deck in board.decks for card in deck.cards),
            *(
                card.title_key
                for deck in board.decks
                for card in deck.cards
                if card.title_key is not None
            ),
        }
        for deck in board.decks:
            for card in deck.cards:
                for effect in card.resolved_effects():
                    if not isinstance(effect, InteractiveChoiceCardEffect):
                        continue
                    required_keys.add(effect.prompt_key)
                    for choice in effect.choices:
                        required_keys.add(choice.label_key)
                        required_keys.update(
                            outcome.result_key for outcome in choice.outcomes
                        )
        missing = sorted(required_keys - messages.keys())
        if missing:
            raise ValueError(
                f"pack '{pack_id}' locale '{selected_locale}' misses keys: {missing}"
            )
        return ContentPack(manifest=manifest, board=board, messages=messages)

    @staticmethod
    def _validate_effect_reference(
        pack_id: str,
        source_id: str,
        effect: object,
        known_tile_ids: set[str],
        board: BoardDefinition,
    ) -> None:
        if isinstance(effect, InteractiveChoiceCardEffect):
            for choice in effect.choices:
                for outcome in choice.outcomes:
                    for outcome_effect in outcome.effects:
                        PackLoader._validate_effect_reference(
                            pack_id,
                            source_id,
                            outcome_effect,
                            known_tile_ids,
                            board,
                        )
            return
        target_id = getattr(effect, "tile_id", None)
        if target_id is not None and target_id not in known_tile_ids:
            raise ValueError(
                f"pack '{pack_id}' effect '{source_id}' references an unknown tile"
            )
        target_tag = getattr(effect, "tile_tag", None)
        if target_tag is not None and not any(
            target_tag in tile.card_tags for tile in board.tiles
        ):
            raise ValueError(
                f"pack '{pack_id}' effect '{source_id}' references an "
                f"unknown card target tag '{target_tag}'"
            )
        target_kind = getattr(effect, "tile_kind", None)
        if target_kind is not None and not any(
            tile.kind.value == target_kind for tile in board.tiles
        ):
            raise ValueError(
                f"pack '{pack_id}' effect '{source_id}' references an "
                f"unavailable tile kind '{target_kind}'"
            )
        if isinstance(effect, MoveToNearestAuctionCardEffect) and not any(
            tile.auction_minimum_bid is not None for tile in board.tiles
        ):
            raise ValueError(
                f"pack '{pack_id}' effect '{source_id}' requires an auction tile"
            )
