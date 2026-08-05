from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from business_game.domain.models import (
    BoardDefinition,
    BoardMode,
    CardDeckDefinition,
    CardEffect,
    ContentPack,
    MoveRelativeCardEffect,
    MoveToCardEffect,
    MoveToNearestCardEffect,
    OptionalRules,
    PackManifest,
    PropertyGroupDefinition,
    RuleOptionName,
    TileDefinition,
    TileKind,
)


class EditablePackContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=5, ge=5, le=5)
    name_key: str = Field(min_length=1, max_length=120)
    side_length: int = Field(ge=5, le=30)
    default_locale: str = Field(min_length=2, max_length=10)
    messages: dict[str, dict[str, str]] = Field(min_length=1, max_length=20)
    min_players: int = Field(default=2, ge=2, le=12)
    max_players: int = Field(default=6, ge=2, le=12)
    starting_balance: int = Field(default=1500, ge=1)
    pass_start_salary: int = Field(default=200, ge=0)
    mortgage_interest_percent: int = Field(default=10, ge=0, le=100)
    building_sell_percent: int = Field(default=50, ge=0, le=100)
    monopoly_rent_multiplier: int = Field(default=2, ge=1, le=10)
    jail_fine: int = Field(default=50, ge=0)
    jail_max_failed_rolls: int = Field(default=3, ge=1, le=10)
    max_consecutive_doubles: int = Field(default=3, ge=1, le=10)
    house_supply: int = Field(default=32, ge=0, le=1000)
    hotel_supply: int = Field(default=12, ge=0, le=1000)
    default_rules: OptionalRules = Field(default_factory=OptionalRules)
    configurable_rules: list[RuleOptionName] = Field(default_factory=list)
    groups: list[PropertyGroupDefinition] = Field(default_factory=list, max_length=40)
    tiles: list[TileDefinition] = Field(min_length=16, max_length=116)
    decks: list[CardDeckDefinition] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_content(self) -> EditablePackContent:
        expected_tiles = self.side_length * 4 - 4
        if len(self.tiles) != expected_tiles:
            raise ValueError(
                f"tiles must contain exactly {expected_tiles} entries for "
                f"a {self.side_length}x{self.side_length} board"
            )
        if self.min_players > self.max_players:
            raise ValueError("min_players cannot exceed max_players")
        if self.default_locale not in self.messages:
            raise ValueError("default_locale must exist in messages")
        if len(self.configurable_rules) != len(set(self.configurable_rules)):
            raise ValueError("configurable_rules cannot contain duplicates")

        tile_ids = [tile.id for tile in self.tiles]
        if len(tile_ids) != len(set(tile_ids)):
            raise ValueError("tile ids must be unique")
        for required_kind in (TileKind.START, TileKind.JAIL, TileKind.GO_TO_JAIL):
            if sum(tile.kind is required_kind for tile in self.tiles) != 1:
                raise ValueError(
                    f"the board must contain exactly one '{required_kind.value}' tile"
                )
        corner_positions = {
            0,
            self.side_length - 1,
            2 * (self.side_length - 1),
            3 * (self.side_length - 1),
        }
        for index, tile in enumerate(self.tiles):
            if (
                tile.kind in {TileKind.START, TileKind.JAIL, TileKind.GO_TO_JAIL}
                and index not in corner_positions
            ):
                raise ValueError(
                    f"special tile '{tile.id}' must occupy a board corner"
                )
        group_ids = [group.id for group in self.groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("property group ids must be unique")
        known_groups = set(group_ids)
        referenced_groups = {
            tile.group for tile in self.tiles if tile.kind is TileKind.PROPERTY
        }
        if missing_groups := sorted(referenced_groups - known_groups):
            raise ValueError(f"properties reference unknown groups: {missing_groups}")
        unused_groups = known_groups - referenced_groups
        if unused_groups:
            raise ValueError(f"property groups are unused: {sorted(unused_groups)}")

        deck_ids = [deck.id for deck in self.decks]
        if len(deck_ids) != len(set(deck_ids)):
            raise ValueError("deck ids must be unique")
        known_decks = set(deck_ids)
        for tile in self.tiles:
            if tile.deck_id is not None and tile.deck_id not in known_decks:
                raise ValueError(
                    f"tile '{tile.id}' references unknown deck '{tile.deck_id}'"
                )
        card_ids = [card.id for deck in self.decks for card in deck.cards]
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("card ids must be unique across all decks")

        required_keys = {
            self.name_key,
            *(group.name_key for group in self.groups),
            *(tile.name_key for tile in self.tiles),
            *(deck.name_key for deck in self.decks if deck.name_key is not None),
            *(
                card.message_key
                for deck in self.decks
                for card in deck.cards
            ),
            *(
                card.title_key
                for deck in self.decks
                for card in deck.cards
                if card.title_key is not None
            ),
        }
        for locale, locale_messages in self.messages.items():
            if not locale.strip():
                raise ValueError("locale names cannot be blank")
            if missing := sorted(required_keys - locale_messages.keys()):
                raise ValueError(f"locale '{locale}' misses keys: {missing}")

        self._validate_effect_references()
        self._validate_movement_cycles()
        return self

    def to_pack(
        self,
        *,
        pack_id: str,
        version: str,
        locale: str | None = None,
    ) -> ContentPack:
        groups_by_id = {group.id: group for group in self.groups}
        tiles = [
            tile.model_copy(
                update={
                    "color": (
                        groups_by_id[tile.group].color
                        if tile.kind is TileKind.PROPERTY
                        and tile.group is not None
                        and tile.color is None
                        else tile.color
                    )
                }
            )
            for tile in self.tiles
        ]
        selected_locale = (
            locale if locale is not None and locale in self.messages else self.default_locale
        )
        manifest = PackManifest(
            schema_version=5,
            id=pack_id,
            version=version,
            name_key=self.name_key,
            board_mode=BoardMode.CUSTOM,
            side_length=self.side_length,
            tile_count=len(tiles),
            default_locale=self.default_locale,
            locales=sorted(self.messages),
            min_players=self.min_players,
            max_players=self.max_players,
            starting_balance=self.starting_balance,
            pass_start_salary=self.pass_start_salary,
            mortgage_interest_percent=self.mortgage_interest_percent,
            building_sell_percent=self.building_sell_percent,
            monopoly_rent_multiplier=self.monopoly_rent_multiplier,
            jail_fine=self.jail_fine,
            jail_max_failed_rolls=self.jail_max_failed_rolls,
            max_consecutive_doubles=self.max_consecutive_doubles,
            house_supply=self.house_supply,
            hotel_supply=self.hotel_supply,
            default_rules=self.default_rules,
            configurable_rules=self.configurable_rules,
        )
        return ContentPack(
            manifest=manifest,
            board=BoardDefinition(
                tiles=tiles,
                decks=self.decks,
                groups=self.groups,
            ),
            messages=self.messages[selected_locale],
        )

    def _validate_effect_references(self) -> None:
        known_tile_ids = {tile.id for tile in self.tiles}
        available_kinds = {tile.kind.value for tile in self.tiles}
        for source_id, effect in self._iter_effects():
            if isinstance(effect, MoveToCardEffect) and effect.tile_id not in known_tile_ids:
                raise ValueError(
                    f"effect on '{source_id}' references unknown tile '{effect.tile_id}'"
                )
            if (
                isinstance(effect, MoveToNearestCardEffect)
                and effect.tile_kind not in available_kinds
            ):
                raise ValueError(
                    f"effect on '{source_id}' references unavailable tile kind "
                    f"'{effect.tile_kind}'"
                )

    def _validate_movement_cycles(self) -> None:
        positions = {tile.id: index for index, tile in enumerate(self.tiles)}
        effects_by_source: dict[str, list[CardEffect]] = {
            tile.id: list(tile.landing_effects) for tile in self.tiles
        }
        for tile in self.tiles:
            if tile.kind is not TileKind.CARD or tile.deck_id is None:
                continue
            deck = next(deck for deck in self.decks if deck.id == tile.deck_id)
            effects_by_source[tile.id].extend(
                effect
                for card in deck.cards
                for effect in card.resolved_effects()
            )

        edges: dict[str, set[str]] = {tile.id: set() for tile in self.tiles}
        for source_id, effects in effects_by_source.items():
            source_position = positions[source_id]
            for effect in effects:
                destination = self._movement_destination(
                    effect,
                    source_position=source_position,
                )
                if destination is not None and effects_by_source.get(destination):
                    edges[source_id].add(destination)

        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(tile_id: str) -> None:
            if tile_id in visiting:
                raise ValueError(
                    f"landing/card movement effects contain a cycle at '{tile_id}'"
                )
            if tile_id in visited:
                return
            visiting.add(tile_id)
            for destination in edges[tile_id]:
                visit(destination)
            visiting.remove(tile_id)
            visited.add(tile_id)

        for tile_id in edges:
            visit(tile_id)

    def _movement_destination(
        self,
        effect: CardEffect,
        *,
        source_position: int,
    ) -> str | None:
        if isinstance(effect, MoveToCardEffect):
            return effect.tile_id
        if isinstance(effect, MoveRelativeCardEffect):
            return self.tiles[
                (source_position + effect.steps) % len(self.tiles)
            ].id
        if isinstance(effect, MoveToNearestCardEffect):
            candidates = [
                index
                for index, tile in enumerate(self.tiles)
                if tile.kind.value == effect.tile_kind
            ]
            target_position = min(
                candidates,
                key=lambda index: (
                    (index - source_position) % len(self.tiles) or len(self.tiles)
                ),
            )
            return self.tiles[target_position].id
        return None

    def _iter_effects(self) -> list[tuple[str, CardEffect]]:
        effects = [
            (tile.id, effect)
            for tile in self.tiles
            for effect in tile.landing_effects
        ]
        effects.extend(
            (card.id, effect)
            for deck in self.decks
            for card in deck.cards
            for effect in card.resolved_effects()
        )
        return effects


class BoardProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    document: dict[str, Any]


class BoardProjectUpdate(BaseModel):
    revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    document: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_change(self) -> BoardProjectUpdate:
        if (
            self.name is None
            and self.description is None
            and self.document is None
        ):
            raise ValueError("at least one project field must be provided")
        return self


class BoardRevisionRequest(BaseModel):
    revision: int = Field(ge=1)


class PublishBoardRequest(BoardRevisionRequest):
    version: str | None = Field(
        default=None,
        max_length=30,
        pattern=r"^\d+\.\d+\.\d+$",
    )

    @field_validator("version", mode="before")
    @classmethod
    def normalize_version(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        parts = value.strip().split(".")
        if 1 <= len(parts) <= 3 and all(part.isdigit() for part in parts):
            normalized = [str(int(part)) for part in parts]
            return ".".join(normalized + ["0"] * (3 - len(normalized)))
        return value


class BoardValidationIssue(BaseModel):
    path: str
    message: str


class BoardValidationResult(BaseModel):
    valid: bool
    errors: list[BoardValidationIssue] = Field(default_factory=list)
    warnings: list[BoardValidationIssue] = Field(default_factory=list)


class BoardDraft(BaseModel):
    id: UUID
    revision: int
    status: Literal["draft", "published"]
    name: str
    description: str
    document: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    published_pack_id: str | None = None
    published_version: str | None = None


class PublishedBoardVersion(BaseModel):
    project_id: UUID
    pack_id: str
    version: str
    manifest: PackManifest
    published_at: datetime


class BoardAsset(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    content_type: Literal["image/svg+xml"]
    size_bytes: int
    sha256: str
    path: str
    created_at: datetime
