from __future__ import annotations

import re
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class ContentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TileKind(StrEnum):
    START = "start"
    PROPERTY = "property"
    TAX = "tax"
    CARD = "card"
    JAIL = "jail"
    GO_TO_JAIL = "go_to_jail"
    FREE = "free"
    TRANSPORT = "transport"
    UTILITY = "utility"


class BoardMode(StrEnum):
    CLASSIC = "classic"
    EXTENDED = "extended"
    CUSTOM = "custom"


class CashCardEffect(ContentModel):
    type: Literal["cash"]
    amount: int


class MoveToCardEffect(ContentModel):
    type: Literal["move_to"]
    tile_id: str | None = None
    tile_tag: str | None = Field(
        default=None,
        pattern=r"^[a-z0-9][a-z0-9_-]*$",
    )
    collect_start: bool = True

    @model_validator(mode="after")
    def validate_target(self) -> MoveToCardEffect:
        if (self.tile_id is None) == (self.tile_tag is None):
            raise ValueError("move_to requires exactly one of tile_id or tile_tag")
        return self


class MoveRelativeCardEffect(ContentModel):
    type: Literal["move_relative"]
    steps: int = Field(ge=-116, le=116)
    collect_start: bool = False
    purchase_discount_percent: int | None = Field(default=None, ge=1, le=100)

    @model_validator(mode="after")
    def validate_steps(self) -> MoveRelativeCardEffect:
        if self.steps == 0:
            raise ValueError("relative card movement cannot be zero")
        if self.purchase_discount_percent is not None and self.steps < 1:
            raise ValueError("purchase discounts require forward movement")
        return self


class MoveToNearestCardEffect(ContentModel):
    type: Literal["move_to_nearest"]
    tile_kind: Literal["transport", "utility"]
    collect_start: bool = True
    rent_multiplier: int = Field(default=1, ge=1, le=10)
    dice_multiplier: int | None = Field(default=None, ge=1, le=20)

    @model_validator(mode="after")
    def validate_rent_mode(self) -> MoveToNearestCardEffect:
        if self.tile_kind != "utility" and self.dice_multiplier is not None:
            raise ValueError("dice_multiplier is only valid for utilities")
        return self


class RepairsCardEffect(ContentModel):
    type: Literal["repairs"]
    house_amount: int = Field(ge=0)
    hotel_amount: int = Field(ge=0)


class CashEachCardEffect(ContentModel):
    type: Literal["cash_each"]
    amount: int

    @model_validator(mode="after")
    def validate_amount(self) -> CashEachCardEffect:
        if self.amount == 0:
            raise ValueError("cash_each amount cannot be zero")
        return self


class GoToJailCardEffect(ContentModel):
    type: Literal["go_to_jail"]


class GetOutOfJailCardEffect(ContentModel):
    type: Literal["get_out_of_jail"]


class MoveToNearestAuctionCardEffect(ContentModel):
    type: Literal["move_to_nearest_auction"]


class CompleteGroupsCashCardEffect(ContentModel):
    type: Literal["complete_groups_cash"]
    threshold: int = Field(ge=1, le=40)
    amount_if_at_least: int
    amount_otherwise: int


class OwnedPropertiesCashCardEffect(ContentModel):
    type: Literal["owned_properties_cash"]
    amount_per_property: int


class MortgagedPropertiesCashCardEffect(ContentModel):
    type: Literal["mortgaged_properties_cash"]
    amount_per_property: int = Field(ge=0)


class RefinanceMortgageCardEffect(ContentModel):
    type: Literal["refinance_mortgage"]


class SalaryCashCardEffect(ContentModel):
    type: Literal["salary_cash"]
    salary_percent: int = Field(ge=-500, le=500)

    @model_validator(mode="after")
    def validate_percentage(self) -> SalaryCashCardEffect:
        if self.salary_percent == 0:
            raise ValueError("salary_cash percentage cannot be zero")
        return self


class EqualizeCashCardEffect(ContentModel):
    type: Literal["equalize_cash"]
    target: Literal["wealthiest", "poorest"]


class SwapPositionCardEffect(ContentModel):
    type: Literal["swap_position"]
    target: Literal["wealthiest", "poorest"]


class AllPlayersMoveRelativeCardEffect(ContentModel):
    type: Literal["all_players_move_relative"]
    steps: int = Field(ge=-116, le=116)
    collect_start: bool = False

    @model_validator(mode="after")
    def validate_steps(self) -> AllPlayersMoveRelativeCardEffect:
        if self.steps == 0:
            raise ValueError("all-player relative movement cannot be zero")
        return self


ImmediateCardEffect = Annotated[
    CashCardEffect
    | MoveToCardEffect
    | MoveRelativeCardEffect
    | MoveToNearestCardEffect
    | RepairsCardEffect
    | CashEachCardEffect
    | GoToJailCardEffect
    | GetOutOfJailCardEffect
    | MoveToNearestAuctionCardEffect
    | CompleteGroupsCashCardEffect
    | OwnedPropertiesCashCardEffect
    | MortgagedPropertiesCashCardEffect
    | RefinanceMortgageCardEffect
    | SalaryCashCardEffect
    | EqualizeCashCardEffect
    | SwapPositionCardEffect
    | AllPlayersMoveRelativeCardEffect,
    Field(discriminator="type"),
]


class CardChoiceOutcomeDefinition(ContentModel):
    weight: int = Field(ge=1, le=100)
    result_key: str = Field(min_length=1)
    effects: list[ImmediateCardEffect] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def validate_effects(self) -> CardChoiceOutcomeDefinition:
        _validate_effect_order(self.effects)
        return self


class CardChoiceOptionDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    label_key: str = Field(min_length=1)
    outcomes: list[CardChoiceOutcomeDefinition] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def validate_weights(self) -> CardChoiceOptionDefinition:
        if sum(outcome.weight for outcome in self.outcomes) != 100:
            raise ValueError("card choice outcome weights must total 100")
        return self


class InteractiveChoiceCardEffect(ContentModel):
    type: Literal["interactive_choice"]
    prompt_key: str = Field(min_length=1)
    category: Literal[
        "scam",
        "lottery",
        "employment",
        "contest",
        "social",
        "mystery",
    ]
    choices: list[CardChoiceOptionDefinition] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def validate_choice_ids(self) -> InteractiveChoiceCardEffect:
        ids = [choice.id for choice in self.choices]
        if len(ids) != len(set(ids)):
            raise ValueError("interactive card choices cannot be repeated")
        return self


CardEffect = Annotated[
    CashCardEffect
    | MoveToCardEffect
    | MoveRelativeCardEffect
    | MoveToNearestCardEffect
    | RepairsCardEffect
    | CashEachCardEffect
    | GoToJailCardEffect
    | GetOutOfJailCardEffect
    | MoveToNearestAuctionCardEffect
    | CompleteGroupsCashCardEffect
    | OwnedPropertiesCashCardEffect
    | MortgagedPropertiesCashCardEffect
    | RefinanceMortgageCardEffect
    | SalaryCashCardEffect
    | EqualizeCashCardEffect
    | SwapPositionCardEffect
    | AllPlayersMoveRelativeCardEffect
    | InteractiveChoiceCardEffect,
    Field(discriminator="type"),
]


def _effect_must_be_terminal(effect: CardEffect) -> bool:
    return isinstance(
        effect,
        (
            MoveToCardEffect,
            MoveRelativeCardEffect,
            MoveToNearestCardEffect,
            MoveToNearestAuctionCardEffect,
            RepairsCardEffect,
            CashEachCardEffect,
            CompleteGroupsCashCardEffect,
            OwnedPropertiesCashCardEffect,
            MortgagedPropertiesCashCardEffect,
            GoToJailCardEffect,
            SwapPositionCardEffect,
            AllPlayersMoveRelativeCardEffect,
            InteractiveChoiceCardEffect,
        ),
    ) or (
        isinstance(effect, CashCardEffect) and effect.amount < 0
    ) or (
        isinstance(effect, SalaryCashCardEffect) and effect.salary_percent < 0
    )


def _validate_effect_order(effects: list[CardEffect]) -> None:
    if any(_effect_must_be_terminal(effect) for effect in effects[:-1]):
        raise ValueError(
            "movement, charging, repairs and go_to_jail effects must be terminal"
        )


class CardDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    message_key: str
    title_key: str | None = Field(default=None, min_length=1)
    effect: CardEffect | None = None
    effects: list[CardEffect] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_effects(self) -> CardDefinition:
        if self.effect is None and not self.effects:
            raise ValueError("cards require at least one effect")
        if self.effect is not None and self.effects:
            raise ValueError("use either effect or effects, not both")
        _validate_effect_order(self.resolved_effects())
        return self

    def resolved_effects(self) -> list[CardEffect]:
        return self.effects or ([self.effect] if self.effect is not None else [])


class CardCollectionDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name_key: str
    card_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_card_ids(self) -> CardCollectionDefinition:
        if len(self.card_ids) != len(set(self.card_ids)):
            raise ValueError("card collection ids cannot contain duplicates")
        return self


class CardDeckDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name_key: str | None = Field(default=None, min_length=1)
    cards: list[CardDefinition] = Field(min_length=1, max_length=100)
    collections: list[CardCollectionDefinition] = Field(default_factory=list, max_length=20)
    default_collection_ids: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_collections(self) -> CardDeckDefinition:
        collection_ids = [collection.id for collection in self.collections]
        if len(collection_ids) != len(set(collection_ids)):
            raise ValueError("card collection ids must be unique within a deck")
        known_cards = {card.id for card in self.cards}
        for collection in self.collections:
            if missing := sorted(set(collection.card_ids) - known_cards):
                raise ValueError(
                    f"card collection '{collection.id}' references unknown cards: {missing}"
                )
        if self.default_collection_ids:
            if len(self.default_collection_ids) != len(set(self.default_collection_ids)):
                raise ValueError("default card collections cannot contain duplicates")
            if missing := sorted(set(self.default_collection_ids) - set(collection_ids)):
                raise ValueError(f"default card collections are unknown: {missing}")
        elif self.collections:
            raise ValueError("decks with collections require default_collection_ids")
        return self


class PropertyGroupDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name_key: str
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class TileDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    kind: TileKind
    name_key: str
    card_tags: list[
        Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")]
    ] = Field(default_factory=list, max_length=20)
    deck_id: str | None = None
    group: str | None = None
    color: str | None = None
    icon: Literal[
        "flag",
        "bank",
        "gavel",
        "question",
        "police",
        "weekend",
        "train",
        "bolt",
        "ticket",
        "star",
        "money",
        "home",
        "store",
        "gift",
        "car",
        "plane",
    ] | None = None
    icon_background: Literal["circle", "rounded", "square", "none"] | None = None
    asset_path: str | None = Field(
        default=None,
        max_length=200,
        pattern=(
            r"^(?:/assets/[a-z0-9_-]+(?:/[a-z0-9_-]+)*"
            r"|/api/v1/board-assets/[0-9a-f-]{36})\.svg$"
        ),
    )
    purchasable: bool | None = None
    price: int | None = Field(default=None, ge=0)
    base_rent: int | None = Field(default=None, ge=0)
    mortgage_value: int | None = Field(default=None, ge=0)
    build_cost: int | None = Field(default=None, ge=0)
    hotel_cost: int | None = Field(default=None, ge=0)
    rent_levels: list[int] | None = Field(
        default=None,
        min_length=1,
        max_length=12,
    )
    rent_multipliers: list[int] | None = Field(
        default=None,
        min_length=1,
        max_length=12,
    )
    amount: int | None = Field(default=None, ge=0)
    net_worth_percent: int | None = Field(default=None, ge=1, le=100)
    complete_group_amount: int | None = Field(default=None, ge=0)
    house_amount: int | None = Field(default=None, ge=0)
    hotel_amount: int | None = Field(default=None, ge=0)
    auction_minimum_bid: int | None = Field(default=None, ge=1)
    landing_effects: list[CardEffect] = Field(default_factory=list, max_length=8)

    @property
    def is_purchasable(self) -> bool:
        if self.kind is TileKind.PROPERTY:
            return True
        if self.kind in {TileKind.TRANSPORT, TileKind.UTILITY}:
            return self.purchasable is not False
        return False

    @model_validator(mode="after")
    def validate_economic_fields(self) -> TileDefinition:
        fields_by_kind: dict[TileKind, set[str]] = {
            TileKind.START: {"landing_effects"},
            TileKind.PROPERTY: {
                "group",
                "purchasable",
                "price",
                "base_rent",
                "mortgage_value",
                "build_cost",
                "hotel_cost",
                "rent_levels",
            },
            TileKind.TAX: {
                "amount",
                "net_worth_percent",
                "complete_group_amount",
                "house_amount",
                "hotel_amount",
            },
            TileKind.CARD: {"deck_id"},
            TileKind.JAIL: {"landing_effects"},
            TileKind.GO_TO_JAIL: set(),
            TileKind.FREE: {"auction_minimum_bid", "landing_effects"},
            TileKind.TRANSPORT: {
                "purchasable",
                "price",
                "base_rent",
                "mortgage_value",
                "rent_levels",
                "landing_effects",
            },
            TileKind.UTILITY: {
                "purchasable",
                "price",
                "base_rent",
                "mortgage_value",
                "rent_multipliers",
                "landing_effects",
            },
        }
        optional_values: dict[str, object | None] = {
            "deck_id": self.deck_id,
            "group": self.group,
            "purchasable": self.purchasable,
            "price": self.price,
            "base_rent": self.base_rent,
            "mortgage_value": self.mortgage_value,
            "build_cost": self.build_cost,
            "hotel_cost": self.hotel_cost,
            "rent_levels": self.rent_levels,
            "rent_multipliers": self.rent_multipliers,
            "amount": self.amount,
            "net_worth_percent": self.net_worth_percent,
            "complete_group_amount": self.complete_group_amount,
            "house_amount": self.house_amount,
            "hotel_amount": self.hotel_amount,
            "auction_minimum_bid": self.auction_minimum_bid,
            "landing_effects": self.landing_effects or None,
        }
        unsupported = sorted(
            field
            for field, value in optional_values.items()
            if value is not None and field not in fields_by_kind[self.kind]
        )
        if unsupported:
            fields = ", ".join(unsupported)
            raise ValueError(
                f"'{self.kind.value}' tiles cannot define: {fields}"
            )
        if self.kind is TileKind.PROPERTY and self.purchasable is False:
            raise ValueError("properties cannot disable purchasing")
        if (
            self.kind in {TileKind.TRANSPORT, TileKind.UTILITY}
            and not self.is_purchasable
            and any(
                value is not None
                for value in (
                    self.price,
                    self.base_rent,
                    self.mortgage_value,
                    self.rent_levels,
                    self.rent_multipliers,
                )
            )
        ):
            raise ValueError(
                "non-purchasable transports and utilities cannot define "
                "economic fields"
            )
        if self.is_purchasable and (self.price is None or self.base_rent is None):
            raise ValueError("purchasable tiles require price and base_rent")
        if self.is_purchasable and self.mortgage_value is None:
            raise ValueError("purchasable tiles require mortgage_value")
        if self.kind is TileKind.PROPERTY and (
            self.group is None
            or self.build_cost is None
            or self.rent_levels is None
            or len(self.rent_levels) != 6
        ):
            raise ValueError(
                "properties require group, build_cost and six rent levels"
            )
        if (
            self.kind is TileKind.TRANSPORT
            and self.is_purchasable
            and self.rent_levels is None
        ):
            raise ValueError("transports require rent_levels")
        if (
            self.kind is TileKind.UTILITY
            and self.is_purchasable
            and self.rent_multipliers is None
        ):
            raise ValueError("utilities require rent_multipliers")
        if self.rent_levels is not None:
            if any(value < 0 for value in self.rent_levels):
                raise ValueError("rent levels cannot be negative")
            if self.rent_levels[0] != self.base_rent:
                raise ValueError("the first rent level must equal base_rent")
            if any(
                current > following
                for current, following in zip(
                    self.rent_levels,
                    self.rent_levels[1:],
                    strict=False,
                )
            ):
                raise ValueError("property rent levels must be non-decreasing")
        if self.rent_multipliers is not None and any(
            value < 0 for value in self.rent_multipliers
        ):
            raise ValueError("rent multipliers cannot be negative")
        tax_modes = (
            self.amount is not None,
            self.net_worth_percent is not None,
            self.complete_group_amount is not None,
            self.house_amount is not None or self.hotel_amount is not None,
        )
        if self.kind is TileKind.TAX and sum(tax_modes) != 1:
            raise ValueError(
                "tax tiles require exactly one fixed, net worth, group or building mode"
            )
        if (self.house_amount is None) != (self.hotel_amount is None):
            raise ValueError("building taxes require both house and hotel amounts")
        if self.kind is TileKind.CARD and self.deck_id is None:
            raise ValueError("card tiles require deck_id")
        if self.landing_effects and self.is_purchasable:
            raise ValueError("purchasable tiles cannot define landing_effects")
        if self.landing_effects and self.kind in {
            TileKind.CARD,
            TileKind.GO_TO_JAIL,
            TileKind.TAX,
        }:
            raise ValueError(
                f"'{self.kind.value}' tiles use fixed landing behavior and cannot "
                "define landing_effects"
            )
        if any(
            isinstance(effect, GetOutOfJailCardEffect)
            for effect in self.landing_effects
        ):
            raise ValueError(
                "get_out_of_jail is only valid inside a card definition"
            )
        _validate_effect_order(self.landing_effects)
        return self


class RuleOptionName(StrEnum):
    AUCTION_UNPURCHASED_PROPERTIES = "auction_unpurchased_properties"
    FREE_PARKING_JACKPOT = "free_parking_jackpot"
    DOUBLE_SALARY_ON_START = "double_salary_on_start"
    LOANS_ENABLED = "loans_enabled"
    STOCK_MARKET_ENABLED = "stock_market_enabled"
    CUSTOM_RENT_DEBTS_ENABLED = "custom_rent_debts_enabled"


class OptionalRules(ContentModel):
    auction_unpurchased_properties: bool = True
    free_parking_jackpot: bool = False
    double_salary_on_start: bool = False
    loans_enabled: bool = False
    stock_market_enabled: bool = False
    custom_rent_debts_enabled: bool = False


class OptionalRulesUpdate(BaseModel):
    auction_unpurchased_properties: bool | None = None
    free_parking_jackpot: bool | None = None
    double_salary_on_start: bool | None = None
    loans_enabled: bool | None = None
    stock_market_enabled: bool | None = None
    custom_rent_debts_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_change(self) -> OptionalRulesUpdate:
        if not self.model_fields_set:
            raise ValueError("at least one optional rule must be provided")
        return self


class PackManifest(ContentModel):
    schema_version: Literal[4, 5]
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    name_key: str
    board_mode: BoardMode
    side_length: int = Field(ge=3, le=30)
    tile_count: int = Field(ge=8, le=116)
    default_locale: str
    locales: list[str] = Field(min_length=1)
    min_players: int = Field(default=2, ge=2, le=20)
    max_players: int = Field(default=6, ge=2, le=20)
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
    bank_money_supply: int | None = Field(default=None, ge=1)
    bank_minimum_reserve_percent: int = Field(default=20, ge=0, le=90)
    loan_interest_percent: int = Field(default=15, ge=0, le=100)
    loan_term_laps: int = Field(default=5, ge=1, le=20)
    loan_max_term_laps: int = Field(default=10, ge=1, le=20)
    loan_salary_payment_percent: int = Field(default=35, ge=1, le=100)
    investment_share_count: int = Field(default=20, ge=1, le=1000)
    investment_dividend_percent: int = Field(default=30, ge=0, le=80)
    investment_transaction_fee_percent: int = Field(default=1, ge=0, le=25)
    investment_revenue_fee_percent: int = Field(default=5, ge=0, le=25)
    investment_max_ownership_percent: int = Field(default=30, ge=1, le=100)
    investment_spread_percent: int = Field(default=1, ge=0, le=15)
    loan_investment_max_net_worth_percent: int = Field(default=20, ge=1, le=50)
    loan_investment_reserve_salary_percent: int = Field(default=50, ge=0, le=200)
    loan_investment_installment_reserve: int = Field(default=2, ge=1, le=10)
    default_rules: OptionalRules = Field(default_factory=OptionalRules)
    configurable_rules: list[RuleOptionName] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_perimeter(self) -> PackManifest:
        if self.tile_count != self.side_length * 4 - 4:
            raise ValueError("tile_count must match a square perimeter")
        if self.default_locale not in self.locales:
            raise ValueError("default_locale must be listed in locales")
        if self.min_players > self.max_players:
            raise ValueError("min_players cannot exceed max_players")
        if self.loan_term_laps > self.loan_max_term_laps:
            raise ValueError("loan_term_laps cannot exceed loan_max_term_laps")
        if len(self.configurable_rules) != len(set(self.configurable_rules)):
            raise ValueError("configurable_rules cannot contain duplicates")
        if (
            self.investment_dividend_percent
            + self.investment_revenue_fee_percent
            > 100
        ):
            raise ValueError(
                "investment dividends and revenue fees cannot exceed 100 percent"
            )
        return self


class BoardDefinition(ContentModel):
    tiles: list[TileDefinition]
    decks: list[CardDeckDefinition] = Field(default_factory=list, max_length=20)
    groups: list[PropertyGroupDefinition] = Field(default_factory=list, max_length=40)


class ContentPack(BaseModel):
    manifest: PackManifest
    board: BoardDefinition
    messages: dict[str, str]


class User(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=40)
    locale: str = Field(default="es", min_length=2, max_length=10)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=2, max_length=40)
    locale: str = Field(default="es", min_length=2, max_length=10)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=40)
    locale: str | None = Field(default=None, min_length=2, max_length=10)


PanelId = Literal["room", "heatmap", "players", "management", "chat"]
PanelZone = Literal["left", "right"]
PANEL_IDS = {"room", "heatmap", "players", "management", "chat"}
ManagementPanelId = Literal["properties", "trades", "debts", "bank", "market"]
MANAGEMENT_PANEL_IDS = {"properties", "trades", "debts", "bank", "market"}
WorkspacePanelId = Literal[
    "room",
    "heatmap",
    "players",
    "properties",
    "trades",
    "debts",
    "bank",
    "market",
    "chat",
]
WORKSPACE_PANEL_IDS = {
    "room",
    "heatmap",
    "players",
    "properties",
    "trades",
    "debts",
    "bank",
    "market",
    "chat",
}
WorkspacePanelPlacement = Literal["left", "right", "floating"]


class ManagementPanelLayoutPreferences(ContentModel):
    order: list[ManagementPanelId] = Field(
        default_factory=lambda: ["properties", "trades", "debts", "bank", "market"],
        min_length=5,
        max_length=5,
    )
    visible: list[ManagementPanelId] = Field(
        default_factory=lambda: ["properties"],
        min_length=1,
        max_length=5,
    )
    heights: dict[ManagementPanelId, int] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def include_debt_panel(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        order = normalized.get("order")
        if isinstance(order, list) and "debts" not in order:
            order = list(order)
            insert_at = order.index("trades") + 1 if "trades" in order else len(order)
            order.insert(insert_at, "debts")
            normalized["order"] = order
        return normalized

    @model_validator(mode="after")
    def validate_complete_layout(self) -> ManagementPanelLayoutPreferences:
        if (
            len(set(self.order)) != len(self.order)
            or set(self.order) != MANAGEMENT_PANEL_IDS
        ):
            raise ValueError("management order must contain every panel exactly once")
        if len(set(self.visible)) != len(self.visible):
            raise ValueError("visible management panels must be unique")
        if not set(self.heights).issubset(MANAGEMENT_PANEL_IDS):
            raise ValueError("management heights contain an unknown panel")
        if any(height < 144 or height > 4000 for height in self.heights.values()):
            raise ValueError("management heights must be between 144 and 4000")
        return self


class WorkspacePanelWindowGeometry(ContentModel):
    x: int = Field(ge=0, le=10000)
    y: int = Field(ge=0, le=10000)
    width: int = Field(ge=280, le=2000)
    height: int = Field(ge=180, le=4000)


class WorkspacePanelLayoutPreferences(ContentModel):
    compact: bool = False
    order: list[WorkspacePanelId] = Field(min_length=9, max_length=9)
    visible: list[WorkspacePanelId] = Field(min_length=1, max_length=9)
    heights: dict[WorkspacePanelId, int] = Field(default_factory=dict)
    placements: dict[WorkspacePanelId, WorkspacePanelPlacement] = Field(
        default_factory=lambda: {
            panel_id: "right" for panel_id in WORKSPACE_PANEL_IDS
        }
    )
    windows: dict[WorkspacePanelId, WorkspacePanelWindowGeometry] = Field(
        default_factory=dict
    )

    @model_validator(mode="before")
    @classmethod
    def include_debt_panel(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        order = normalized.get("order")
        if isinstance(order, list) and "debts" not in order:
            order = list(order)
            insert_at = order.index("trades") + 1 if "trades" in order else len(order)
            order.insert(insert_at, "debts")
            normalized["order"] = order
        placements = normalized.get("placements")
        if isinstance(placements, dict) and "debts" not in placements:
            normalized["placements"] = {**placements, "debts": "right"}
        return normalized

    @model_validator(mode="after")
    def validate_complete_layout(self) -> WorkspacePanelLayoutPreferences:
        if (
            len(set(self.order)) != len(self.order)
            or set(self.order) != WORKSPACE_PANEL_IDS
        ):
            raise ValueError("workspace order must contain every panel exactly once")
        if len(set(self.visible)) != len(self.visible):
            raise ValueError("visible workspace panels must be unique")
        if set(self.placements) != WORKSPACE_PANEL_IDS:
            raise ValueError("workspace placements must contain every panel exactly once")
        if not set(self.heights).issubset(WORKSPACE_PANEL_IDS):
            raise ValueError("workspace heights contain an unknown panel")
        if not set(self.windows).issubset(WORKSPACE_PANEL_IDS):
            raise ValueError("workspace windows contain an unknown panel")
        if any(height < 144 or height > 4000 for height in self.heights.values()):
            raise ValueError("workspace heights must be between 144 and 4000")
        return self


class PanelLayoutPreferences(ContentModel):
    order: list[PanelId] = Field(min_length=5, max_length=5)
    zones: dict[PanelId, PanelZone]
    heights: dict[PanelId, int] = Field(default_factory=dict)
    management: ManagementPanelLayoutPreferences = Field(
        default_factory=ManagementPanelLayoutPreferences
    )
    rail: WorkspacePanelLayoutPreferences | None = None

    @model_validator(mode="after")
    def validate_complete_layout(self) -> PanelLayoutPreferences:
        if len(set(self.order)) != len(self.order) or set(self.order) != PANEL_IDS:
            raise ValueError("panel order must contain every panel exactly once")
        if set(self.zones) != PANEL_IDS:
            raise ValueError("panel zones must contain every panel exactly once")
        if not set(self.heights).issubset(PANEL_IDS):
            raise ValueError("panel heights contain an unknown panel")
        if any(height < 144 or height > 4000 for height in self.heights.values()):
            raise ValueError("panel heights must be between 144 and 4000")
        return self


SoundId = Annotated[
    str,
    Field(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$"),
]


class AudioPreferences(ContentModel):
    muted: bool
    volume: float = Field(ge=0, le=1)
    disabled_sounds: list[SoundId] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_unique_disabled_sounds(self) -> AudioPreferences:
        if len(set(self.disabled_sounds)) != len(self.disabled_sounds):
            raise ValueError("disabled sounds must be unique")
        return self


TokenShape = Literal["circle", "rounded", "diamond", "hexagon", "shield", "star"]
TokenFillMode = Literal["solid", "gradient", "pattern"]
TokenPattern = Literal["dots", "stripes", "checker", "waves"]
TokenIcon = Literal[
    "number",
    "micro",
    "bus",
    "completo",
    "terremoto",
    "cerro",
    "cat",
    "emoji",
]


class TokenAppearancePreferences(ContentModel):
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: str = Field(
        default="#9d8cff",
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    fill: TokenFillMode = "solid"
    gradient_angle: int = Field(default=135, ge=0, le=360)
    pattern: TokenPattern = "dots"
    shape: TokenShape
    icon: TokenIcon
    emoji: str | None = Field(default=None, max_length=16)

    @field_validator("emoji")
    @classmethod
    def normalize_emoji(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("emoji cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_emoji_icon(self) -> TokenAppearancePreferences:
        if self.icon == "emoji" and self.emoji is None:
            raise ValueError("emoji is required when the emoji icon is selected")
        return self


class AutomationPreferences(ContentModel):
    auto_reject_trades: bool = False
    auto_roll_dice: bool = False
    auto_end_turns: bool = False


class VisualEffectsPreferences(ContentModel):
    intensity: Literal["full", "soft", "off"] = "full"


PlayerSortPreference = Literal["turnOrder", "netWorth", "cash", "name"]


class UserPreferences(ContentModel):
    panel_layout: PanelLayoutPreferences | None = None
    audio_settings: AudioPreferences | None = None
    token_appearance: TokenAppearancePreferences | None = None
    automation_settings: AutomationPreferences | None = None
    visual_effects: VisualEffectsPreferences | None = None
    player_sort: PlayerSortPreference | None = None


class UserPreferencesUpdate(ContentModel):
    panel_layout: PanelLayoutPreferences | None = None
    audio_settings: AudioPreferences | None = None
    token_appearance: TokenAppearancePreferences | None = None
    automation_settings: AutomationPreferences | None = None
    visual_effects: VisualEffectsPreferences | None = None
    player_sort: PlayerSortPreference | None = None

    @model_validator(mode="after")
    def validate_non_empty_update(self) -> UserPreferencesUpdate:
        if (
            self.panel_layout is None
            and self.audio_settings is None
            and self.token_appearance is None
            and self.automation_settings is None
            and self.visual_effects is None
            and self.player_sort is None
        ):
            raise ValueError("at least one preference must be provided")
        return self


class TokenResponse(BaseModel):
    access_token: str
    user_id: UUID
    token_type: Literal["bearer"] = "bearer"


class BotPersonality(StrEnum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"
    NEGOTIATOR = "negotiator"


class BotController(StrEnum):
    STANDARD = "standard"
    AI = "ai"


class PlayerState(BaseModel):
    user_id: UUID
    display_name: str
    appearance_slot: int | None = Field(default=None, ge=0, le=19)
    is_bot: bool = False
    bot_personality: BotPersonality | None = None
    bot_controller: BotController | None = None
    position: int = 0
    balance: int = 1500
    pending_dividend_units: int = Field(default=0, ge=0)
    bankrupt: bool = False
    in_jail: bool = False
    jail_failed_rolls: int = Field(default=0, ge=0)
    jail_card_ids: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_controller(self) -> PlayerState:
        if self.is_bot:
            if self.bot_personality is None:
                raise ValueError("bot players require a personality")
            if self.bot_controller is None:
                self.bot_controller = BotController.STANDARD
        elif self.bot_personality is not None or self.bot_controller is not None:
            raise ValueError("human players cannot have bot configuration")
        return self


class SpectatorState(BaseModel):
    user_id: UUID
    display_name: str


class EconomicDifficulty(StrEnum):
    NOVICE = "novice"
    EASY = "easy"
    STANDARD = "standard"
    PRO = "pro"
    REALISTIC = "realistic"


class EconomicSeason(StrEnum):
    SUMMER = "summer"
    AUTUMN = "autumn"
    WINTER = "winter"
    SPRING = "spring"


class WeatherCondition(StrEnum):
    CLEAR = "clear"
    RAIN = "rain"
    STORM = "storm"
    HEATWAVE = "heatwave"
    COLD_WAVE = "cold_wave"
    DROUGHT = "drought"


class EconomicCycle(StrEnum):
    EXPANSION = "expansion"
    SLOWDOWN = "slowdown"
    RECESSION = "recession"
    RECOVERY = "recovery"


class EconomicEventState(BaseModel):
    kind: Literal[
        "innovation_boom",
        "supply_shock",
        "credit_tightening",
        "consumer_boom",
        "labor_dispute",
        "fiscal_stimulus",
    ]
    remaining_weeks: int = Field(ge=1, le=12)
    intensity: int = Field(ge=1, le=3)


class MarketMovementState(BaseModel):
    instrument_id: str = Field(min_length=1, max_length=160)
    previous_price: int = Field(gt=0)
    current_price: int = Field(gt=0)
    change_basis_points: int = Field(ge=-3000, le=3000)
    primary_cause: str = Field(min_length=1, max_length=80)


class EconomicSimulationState(BaseModel):
    current_date: date = Field(
        default_factory=lambda: datetime.now(UTC).date(),
    )
    elapsed_weeks: int = Field(default=0, ge=0)
    season: EconomicSeason = EconomicSeason.SUMMER
    weather: WeatherCondition = WeatherCondition.CLEAR
    weather_intensity: int = Field(default=1, ge=1, le=3)
    cycle: EconomicCycle = EconomicCycle.EXPANSION
    annual_growth_basis_points: int = Field(default=220, ge=-1500, le=2000)
    annual_inflation_basis_points: int = Field(default=300, ge=0, le=5000)
    policy_rate_basis_points: int = Field(default=450, ge=0, le=5000)
    unemployment_basis_points: int = Field(default=650, ge=100, le=5000)
    consumer_confidence: int = Field(default=100, ge=0, le=200)
    market_sentiment: int = Field(default=5, ge=-100, le=100)
    active_events: list[EconomicEventState] = Field(default_factory=list, max_length=5)
    last_market_movements: list[MarketMovementState] = Field(
        default_factory=list,
        max_length=8,
    )
    last_company_action: str | None = Field(default=None, max_length=80)
    last_company_instrument_id: str | None = Field(default=None, max_length=160)


class GameSettings(BaseModel):
    max_players: int | None = Field(default=None, ge=2, le=20)
    allow_spectators: bool = True
    auction_deposit_percent: int = Field(default=10, ge=0, le=100)
    auction_minimum_bid_percent: int = Field(default=70, ge=0, le=100)
    economic_difficulty: EconomicDifficulty = EconomicDifficulty.STANDARD
    rules: OptionalRules = Field(default_factory=OptionalRules)


class TurnPhase(StrEnum):
    WAITING_FOR_ROLL = "waiting_for_roll"
    BUY_DECISION = "buy_decision"
    WAITING_FOR_END = "waiting_for_end"


class GameStatus(StrEnum):
    LOBBY = "lobby"
    PLAYING = "playing"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class TradeStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class DebtReason(StrEnum):
    RENT = "rent"
    RENT_INSTALLMENT = "rent_installment"
    TAX = "tax"
    CARD = "card"
    JAIL_FINE = "jail_fine"
    BANK_LOAN = "bank_loan"
    RESIGNATION = "resignation"


class RentDebtPlanTemplate(StrEnum):
    FRIENDLY = "friendly"
    STANDARD = "standard"
    FLEXIBLE = "flexible"
    CUSTOM = "custom"


class RentDebtPlanProposal(BaseModel):
    installments: int = Field(ge=0, le=12)
    interest_percent: int = Field(ge=0, le=100)
    template: RentDebtPlanTemplate
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def validate_terms(self) -> RentDebtPlanProposal:
        if self.installments == 1:
            raise ValueError("installment settlements require at least two payments")
        if len(self.requested_property_ids) != len(set(self.requested_property_ids)):
            raise ValueError("requested properties cannot be repeated")
        if self.installments == 0 and not self.requested_property_ids:
            raise ValueError("a settlement requires installments or properties")
        if self.installments == 0 and self.interest_percent != 0:
            raise ValueError("a property-only settlement cannot charge interest")
        return self


class DebtState(BaseModel):
    debtor_id: UUID
    creditor_id: UUID | None = None
    amount: int = Field(gt=0)
    reason: DebtReason
    tile_id: str
    installment_plan_id: UUID | None = None
    plan_proposal: RentDebtPlanProposal | None = None
    collection_demanded: bool = False


class RentDebtPlanState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    debtor_id: UUID
    creditor_id: UUID
    tile_id: str
    original_amount: int = Field(gt=0)
    interest_percent: int = Field(ge=0, le=100)
    total_amount: int = Field(gt=0)
    remaining_amount: int = Field(gt=0)
    installments_total: int = Field(ge=2, le=12)
    installments_remaining: int = Field(ge=1, le=12)
    template: RentDebtPlanTemplate
    created_at_sequence: int = Field(ge=0)


class CardPaymentState(BaseModel):
    payer_id: UUID
    recipient_id: UUID
    amount: int = Field(gt=0)
    card_id: str


class AuctionState(BaseModel):
    property_id: str
    minimum_bid: int = Field(default=1, ge=1)
    current_bid: int = Field(default=0, ge=0)
    current_bidder_id: UUID | None = None
    bid_deadline: datetime | None = None
    deposit_amount: int = Field(default=0, ge=0)
    deposits: dict[UUID, int] = Field(default_factory=dict, max_length=20)
    eligible_player_ids: list[UUID] = Field(min_length=1, max_length=20)
    passed_player_ids: list[UUID] = Field(default_factory=list, max_length=20)


class TradeOffer(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    proposer_id: UUID
    recipient_id: UUID
    offered_cash: int = Field(default=0, ge=0)
    requested_cash: int = Field(default=0, ge=0)
    offered_property_ids: list[str] = Field(default_factory=list, max_length=40)
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)
    parent_trade_id: UUID | None = None
    status: TradeStatus = TradeStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None


class TradeSideAnalysis(BaseModel):
    player_id: UUID
    role: Literal["proposer", "recipient"]
    verdict: Literal["accept", "counter", "reject"]
    convenience_level: Literal[
        "very_favorable",
        "favorable",
        "balanced",
        "unfavorable",
        "very_unfavorable",
    ]
    reason_code: str
    estimated_gain: int = Field(ge=0)
    estimated_cost: int = Field(ge=0)
    estimated_surplus: int
    risk_adjusted_surplus: int
    cash_before: int
    cash_after: int
    liquidity_floor: int = Field(ge=0)
    payment_probability_before: int = Field(ge=0, le=100)
    payment_probability_after: int = Field(ge=0, le=100)
    expected_payments_before: int = Field(ge=0)
    expected_payments_after: int = Field(ge=0)
    expected_rent_income_before: int = Field(ge=0)
    expected_rent_income_after: int = Field(ge=0)
    highest_payment_before: int = Field(ge=0)
    highest_payment_after: int = Field(ge=0)


class TradeAnalysisResponse(BaseModel):
    trade_id: UUID
    perspective: Literal["proposer", "recipient"]
    verdict: Literal["accept", "counter", "reject"]
    convenience_level: Literal[
        "very_favorable",
        "favorable",
        "balanced",
        "unfavorable",
        "very_unfavorable",
    ]
    reason_code: str
    estimated_gain: int = Field(ge=0)
    estimated_cost: int = Field(ge=0)
    estimated_surplus: int
    risk_adjusted_surplus: int
    cash_after: int
    liquidity_floor: int = Field(ge=0)
    proposer_analysis: TradeSideAnalysis
    recipient_analysis: TradeSideAnalysis
    snapshot_sequence: int = Field(ge=0)


class PropertyHistoricalStats(BaseModel):
    tile_id: str
    landings: int = Field(default=0, ge=0)
    landing_percent: float = Field(default=0, ge=0, le=100)
    rent_payments: int = Field(default=0, ge=0)
    total_rent: int = Field(default=0, ge=0)
    average_rent: int = Field(default=0, ge=0)
    purchases: int = Field(default=0, ge=0)
    average_purchase_price: int = Field(default=0, ge=0)
    auction_sales: int = Field(default=0, ge=0)
    average_auction_price: int = Field(default=0, ge=0)


class BoardHistoricalStats(BaseModel):
    pack_id: str
    game_count: int = Field(ge=0)
    movement_count: int = Field(ge=0)
    position_landings: list[Annotated[int, Field(ge=0)]]
    properties: list[PropertyHistoricalStats]


class BotRelationshipState(BaseModel):
    bot_id: UUID
    player_id: UUID
    score: int = Field(default=0, ge=-100, le=100)
    interaction_count: int = Field(default=0, ge=0)
    last_reason: str | None = None
    last_event_sequence: int | None = Field(default=None, ge=1)


class BankLoanState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    player_id: UUID
    principal: int = Field(gt=0)
    interest_amount: int = Field(ge=0)
    interest_paid: int = Field(default=0, ge=0)
    interest_percent: int = Field(default=15, ge=0, le=100)
    remaining_balance: int = Field(gt=0)
    installment_amount: int = Field(gt=0)
    installments_remaining: int = Field(gt=0)
    scheduled_payments_made: int = Field(default=0, ge=0)
    issued_at_sequence: int = Field(ge=0)


class BankCreditProfileState(BaseModel):
    score: int = Field(default=600, ge=300, le=850)
    successful_loans: int = Field(default=0, ge=0)
    on_time_payments: int = Field(default=0, ge=0)
    late_payments: int = Field(default=0, ge=0)
    defaults: int = Field(default=0, ge=0)
    total_borrowed: int = Field(default=0, ge=0)
    current_interest_percent: int = Field(default=15, ge=0, le=100)
    current_limit: int = Field(default=0, ge=0)
    maximum_term_laps: int = Field(default=10, ge=1, le=20)


class InvestmentInstrumentState(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    tile_id: str = Field(min_length=1, max_length=120)
    name_key: str = Field(min_length=1, max_length=200)
    instrument_kind: Literal["asset", "bank", "jail", "tax", "index"] = "asset"
    total_shares: int = Field(gt=0)
    available_shares: int = Field(ge=0)
    base_price: int = Field(gt=0)
    current_price: int = Field(gt=0)
    dividend_percent: int = Field(ge=0, le=80)
    transaction_fee_percent: int = Field(ge=0, le=25)
    revenue_fee_percent: int = Field(ge=0, le=25)
    max_ownership_percent: int = Field(ge=1, le=100)
    spread_percent: int = Field(default=2, ge=0, le=15)
    holdings: dict[UUID, Annotated[int, Field(gt=0)]] = Field(
        default_factory=dict,
    )
    gross_revenue: int = Field(default=0, ge=0)
    period_revenue: int = Field(default=0, ge=0)
    dividends_paid: int = Field(default=0, ge=0)
    dividends_accrued_units: int = Field(default=0, ge=0)
    pending_dividend_units: dict[UUID, Annotated[int, Field(ge=0)]] = Field(
        default_factory=dict,
    )
    last_settlement_sequence: int = Field(default=0, ge=0)
    buy_volume: int = Field(default=0, ge=0)
    sell_volume: int = Field(default=0, ge=0)
    trade_volume: int = Field(default=0, ge=0)
    trade_count: int = Field(default=0, ge=0)
    last_trade_price: int | None = Field(default=None, gt=0)
    session_high: int = Field(default=0, ge=0)
    session_low: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_share_supply(self) -> InvestmentInstrumentState:
        held_shares = sum(self.holdings.values())
        if held_shares + self.available_shares > self.total_shares:
            raise ValueError("investment shares cannot exceed the instrument supply")
        return self


class MarketOrderSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class MarketOrderState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    instrument_id: str = Field(min_length=1, max_length=160)
    player_id: UUID
    side: MarketOrderSide
    limit_price: int = Field(gt=0)
    original_quantity: int = Field(gt=0, le=1000)
    remaining_quantity: int = Field(gt=0, le=1000)
    reserved_cash: int = Field(default=0, ge=0)
    created_at_sequence: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_reservation(self) -> MarketOrderState:
        if self.remaining_quantity > self.original_quantity:
            raise ValueError("remaining order quantity cannot exceed the original")
        if self.side is MarketOrderSide.SELL and self.reserved_cash != 0:
            raise ValueError("sell orders cannot reserve cash")
        return self


class BankState(BaseModel):
    initialized: bool = False
    monetary_base: int = Field(default=0, ge=0)
    cash: int = Field(default=0, ge=0)
    emergency_issuance: int = Field(default=0, ge=0)
    dividend_cash_reserve: int = Field(default=0, ge=0)
    dividend_unfunded_units: int = Field(default=0, ge=0, lt=10_000)
    market_round: int = Field(default=0, ge=0)
    minimum_reserve_percent: int = Field(default=20, ge=0, le=90)
    loans: list[BankLoanState] = Field(default_factory=list, max_length=20)
    credit_profiles: dict[UUID, BankCreditProfileState] = Field(
        default_factory=dict,
    )
    investments: list[InvestmentInstrumentState] = Field(
        default_factory=list,
        max_length=40,
    )
    market_orders: list[MarketOrderState] = Field(default_factory=list, max_length=200)


class GameEvent(BaseModel):
    sequence: int
    type: str
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    data: dict[str, object] = Field(default_factory=dict)


class PendingCardChoiceState(BaseModel):
    player_id: UUID
    card_id: str
    effect: InteractiveChoiceCardEffect


class PendingCardChoiceResultState(BaseModel):
    player_id: UUID
    card_id: str
    effect: InteractiveChoiceCardEffect
    choice_id: str
    choice_label_key: str
    result_key: str
    resolved_sequence: int = Field(ge=1)


class PendingCardDrawState(BaseModel):
    player_id: UUID
    deck_id: str
    card_id: str | None = None
    selected_index: int | None = Field(default=None, ge=0, le=6)
    offer_count: int = Field(default=7, ge=1, le=7)
    draw_sequence: int = Field(ge=1)
    reveal_sequence: int | None = Field(default=None, ge=1)


class GameState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    host_user_id: UUID
    pack_id: str
    pack_version: str
    pack_snapshot: ContentPack | None = Field(default=None, exclude=True)
    deck_collection_ids: dict[str, list[str]] = Field(default_factory=dict)
    status: GameStatus = GameStatus.LOBBY
    players: list[PlayerState] = Field(default_factory=list)
    spectators: list[SpectatorState] = Field(default_factory=list, max_length=50)
    settings: GameSettings = Field(default_factory=GameSettings)
    economy: EconomicSimulationState = Field(
        default_factory=EconomicSimulationState,
    )
    current_player_index: int = 0
    phase: TurnPhase = TurnPhase.WAITING_FOR_ROLL
    owners: dict[str, UUID] = Field(default_factory=dict)
    pending_tile_id: str | None = None
    pending_purchase_discount_percent: int = Field(default=0, ge=0, le=100)
    pending_auction_selector_id: UUID | None = None
    pending_auction_minimum_bid: int | None = Field(default=None, ge=1)
    active_auction: AuctionState | None = None
    active_debt: DebtState | None = None
    rent_debt_plans: list[RentDebtPlanState] = Field(
        default_factory=list,
        max_length=100,
    )
    pending_card_payments: list[CardPaymentState] = Field(
        default_factory=list,
        max_length=20,
    )
    pending_card_draw: PendingCardDrawState | None = None
    pending_card_choice: PendingCardChoiceState | None = None
    pending_card_choice_result: PendingCardChoiceResultState | None = None
    bank: BankState = Field(default_factory=BankState)
    bank_pot: int = Field(default=0, ge=0)
    mortgaged_property_ids: list[str] = Field(default_factory=list)
    trade_unavailable_property_ids: list[str] = Field(default_factory=list)
    building_levels: dict[
        str,
        Annotated[int, Field(ge=1, le=5)],
    ] = Field(default_factory=dict)
    houses_remaining: int = Field(default=0, ge=0)
    hotels_remaining: int = Field(default=0, ge=0)
    consecutive_doubles: int = Field(default=0, ge=0)
    extra_roll_pending: bool = False
    deck_orders: dict[str, list[str]] = Field(default_factory=dict)
    deck_cursors: dict[str, int] = Field(default_factory=dict)
    bank_auction_queue: list[str] = Field(default_factory=list)
    bank_auction_excluded_player_ids: dict[str, UUID] = Field(default_factory=dict)
    last_card_id: str | None = None
    trades: list[TradeOffer] = Field(default_factory=list, max_length=100)
    bot_relationships: list[BotRelationshipState] = Field(
        default_factory=list,
        max_length=132,
    )
    last_roll: tuple[int, int] | None = None
    events: list[GameEvent] = Field(default_factory=list)
    event_sequence: int = Field(default=0, ge=0)

    @property
    def current_player(self) -> PlayerState | None:
        if not self.players:
            return None
        return self.players[self.current_player_index]

    @model_validator(mode="after")
    def validate_economic_state(self) -> GameState:
        used_appearance_slots: set[int] = set()
        for player in self.players:
            if (
                player.appearance_slot is None
                or player.appearance_slot in used_appearance_slots
            ):
                player.appearance_slot = next(
                    (
                        slot
                        for slot in range(20)
                        if slot not in used_appearance_slots
                    ),
                    None,
                )
                if player.appearance_slot is None:
                    raise ValueError("games support at most 20 player appearances")
            used_appearance_slots.add(player.appearance_slot)
        if self.events:
            sequences = [event.sequence for event in self.events]
            if sequences != list(range(sequences[0], sequences[0] + len(sequences))):
                raise ValueError("game event sequences must be contiguous")
            if self.event_sequence == 0:
                self.event_sequence = sequences[-1]
            elif self.event_sequence != sequences[-1]:
                raise ValueError("event_sequence must match the latest game event")
        if self.players and self.current_player_index >= len(self.players):
            raise ValueError("current_player_index is outside the player list")
        player_ids = {player.user_id for player in self.players}
        spectator_ids = {spectator.user_id for spectator in self.spectators}
        if len(player_ids) != len(self.players):
            raise ValueError("players cannot be repeated")
        if len(spectator_ids) != len(self.spectators):
            raise ValueError("spectators cannot be repeated")
        if player_ids & spectator_ids:
            raise ValueError("a user cannot be a player and spectator")
        if self.bank.initialized:
            expected_cash = (
                self.bank.monetary_base
                + self.bank.emergency_issuance
                - sum(player.balance for player in self.players)
                - self.bank_pot
            )
            if expected_cash < 0:
                self.bank.emergency_issuance += -expected_cash
                expected_cash = 0
            self.bank.cash = expected_cash
            loan_player_ids = [loan.player_id for loan in self.bank.loans]
            if len(loan_player_ids) != len(set(loan_player_ids)):
                raise ValueError("a player cannot have more than one bank loan")
            if not set(loan_player_ids).issubset(player_ids):
                raise ValueError("bank loans require an active game player")
            investment_ids = [item.id for item in self.bank.investments]
            if len(investment_ids) != len(set(investment_ids)):
                raise ValueError("investment instruments cannot be repeated")
            investment_tile_ids = [item.tile_id for item in self.bank.investments]
            if len(investment_tile_ids) != len(set(investment_tile_ids)):
                raise ValueError("a tile cannot back more than one investment")
            if any(
                not set(instrument.holdings).issubset(player_ids)
                for instrument in self.bank.investments
            ):
                raise ValueError("investment holders must be game players")
            instrument_by_id = {
                instrument.id: instrument for instrument in self.bank.investments
            }
            if any(
                order.player_id not in player_ids
                or order.instrument_id not in instrument_by_id
                for order in self.bank.market_orders
            ):
                raise ValueError("market orders require valid players and instruments")
            for instrument in self.bank.investments:
                reserved_shares = sum(
                    order.remaining_quantity
                    for order in self.bank.market_orders
                    if order.instrument_id == instrument.id
                    and order.side is MarketOrderSide.SELL
                )
                if (
                    sum(instrument.holdings.values())
                    + instrument.available_shares
                    + reserved_shares
                    != instrument.total_shares
                ):
                    raise ValueError(
                        "held, available, and reserved investment shares must match supply"
                    )
        relationship_pairs = [
            (relationship.bot_id, relationship.player_id)
            for relationship in self.bot_relationships
        ]
        if len(relationship_pairs) != len(set(relationship_pairs)):
            raise ValueError("bot relationships cannot be repeated")
        if any(bot_id == player_id for bot_id, player_id in relationship_pairs):
            raise ValueError("a bot cannot have a relationship with itself")
        if len(self.mortgaged_property_ids) != len(
            set(self.mortgaged_property_ids)
        ):
            raise ValueError("mortgaged properties cannot be repeated")
        if len(self.trade_unavailable_property_ids) != len(
            set(self.trade_unavailable_property_ids)
        ):
            raise ValueError("trade-unavailable properties cannot be repeated")
        owner_ids = set(self.owners)
        mortgaged_ids = set(self.mortgaged_property_ids)
        trade_unavailable_ids = set(self.trade_unavailable_property_ids)
        building_ids = set(self.building_levels)
        if not mortgaged_ids.issubset(owner_ids):
            raise ValueError("mortgaged properties must have an owner")
        if not building_ids.issubset(owner_ids):
            raise ValueError("developed properties must have an owner")
        if not trade_unavailable_ids.issubset(owner_ids):
            raise ValueError("trade-unavailable properties must have an owner")
        if mortgaged_ids & building_ids:
            raise ValueError("a mortgaged property cannot have buildings")
        if self.active_debt is not None and not any(
            player.user_id == self.active_debt.debtor_id for player in self.players
        ):
            raise ValueError("the debt debtor must be a game participant")
        if any(
            plan.debtor_id not in player_ids or plan.creditor_id not in player_ids
            for plan in self.rent_debt_plans
        ):
            raise ValueError("rent debt plans require game participants")
        if any(plan.debtor_id == plan.creditor_id for plan in self.rent_debt_plans):
            raise ValueError("rent debt plans require different participants")
        plan_ids = [plan.id for plan in self.rent_debt_plans]
        if len(plan_ids) != len(set(plan_ids)):
            raise ValueError("rent debt plans cannot be repeated")
        if (
            self.active_debt is not None
            and self.active_debt.installment_plan_id is not None
            and self.active_debt.installment_plan_id not in plan_ids
        ):
            raise ValueError("an installment debt requires its rent debt plan")
        if (
            self.pending_auction_selector_id is not None
            and self.pending_auction_selector_id not in player_ids
        ):
            raise ValueError("the auction selector must be a game participant")
        if (self.pending_auction_selector_id is None) != (
            self.pending_auction_minimum_bid is None
        ):
            raise ValueError("auction selection requires a selector and minimum bid")
        for payment in self.pending_card_payments:
            if payment.payer_id not in player_ids or payment.recipient_id not in player_ids:
                raise ValueError("card payments require game participants")
            if payment.payer_id == payment.recipient_id:
                raise ValueError("card payments require different participants")
        if (
            self.pending_card_choice is not None
            and self.pending_card_choice.player_id not in player_ids
        ):
            raise ValueError("a pending card choice requires a game participant")
        if (
            self.pending_card_choice_result is not None
            and self.pending_card_choice_result.player_id not in player_ids
        ):
            raise ValueError("a pending card choice result requires a game participant")
        if (
            self.pending_card_draw is not None
            and self.pending_card_draw.player_id not in player_ids
        ):
            raise ValueError("a pending card draw requires a game participant")
        if self.pending_card_draw is not None and self.pending_card_choice is not None:
            raise ValueError("a card draw and card choice cannot both be pending")
        return self


class RollCommand(BaseModel):
    action: Literal["roll"]


class BuyPropertyCommand(BaseModel):
    action: Literal["buy_property"]


class EndTurnCommand(BaseModel):
    action: Literal["end_turn"]


class DeclinePropertyCommand(BaseModel):
    action: Literal["decline_property"]


class BidCommand(BaseModel):
    action: Literal["bid"]
    amount: int = Field(gt=0)


class PassAuctionCommand(BaseModel):
    action: Literal["pass_auction"]


class SelectAuctionPropertyCommand(BaseModel):
    action: Literal["select_auction_property"]
    property_id: str


class PayJailFineCommand(BaseModel):
    action: Literal["pay_jail_fine"]


class UseJailCardCommand(BaseModel):
    action: Literal["use_jail_card"]


class MortgagePropertyCommand(BaseModel):
    action: Literal["mortgage_property"]
    property_id: str


class UnmortgagePropertyCommand(BaseModel):
    action: Literal["unmortgage_property"]
    property_id: str


class BuildPropertyCommand(BaseModel):
    action: Literal["build_property"]
    property_id: str


class BuildGroupRoundCommand(BaseModel):
    action: Literal["build_group_round"]
    group_id: str = Field(min_length=1, max_length=160)


class SellBuildingCommand(BaseModel):
    action: Literal["sell_building"]
    property_id: str


class SellGroupRoundCommand(BaseModel):
    action: Literal["sell_group_round"]
    group_id: str = Field(min_length=1, max_length=160)


class RequestLoanCommand(BaseModel):
    action: Literal["request_loan"]
    amount: int = Field(gt=0)


class RepayLoanCommand(BaseModel):
    action: Literal["repay_loan"]
    amount: int | None = Field(default=None, gt=0)


class BuySharesCommand(BaseModel):
    action: Literal["buy_shares"]
    instrument_id: str = Field(min_length=1, max_length=160)
    quantity: int = Field(gt=0, le=1000)


class SellSharesCommand(BaseModel):
    action: Literal["sell_shares"]
    instrument_id: str = Field(min_length=1, max_length=160)
    quantity: int = Field(gt=0, le=1000)


class PlaceLimitOrderCommand(BaseModel):
    action: Literal["place_limit_order"]
    instrument_id: str = Field(min_length=1, max_length=160)
    side: MarketOrderSide
    quantity: int = Field(gt=0, le=1000)
    limit_price: int = Field(gt=0)


class CancelMarketOrderCommand(BaseModel):
    action: Literal["cancel_market_order"]
    order_id: UUID


class PayDebtCommand(BaseModel):
    action: Literal["pay_debt"]


class PayRentDebtPlanCommand(BaseModel):
    action: Literal["pay_rent_debt_plan"]
    plan_id: UUID
    payment_kind: Literal["installment", "full"]


class DemandRentDebtCommand(BaseModel):
    action: Literal["demand_rent_debt"]


class ForgiveRentDebtCommand(BaseModel):
    action: Literal["forgive_rent_debt"]


class ProposeRentDebtPlanCommand(BaseModel):
    action: Literal["propose_rent_debt_plan"]
    installments: int = Field(ge=0, le=12)
    interest_percent: int = Field(ge=0, le=100)
    template: RentDebtPlanTemplate
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def validate_terms(self) -> ProposeRentDebtPlanCommand:
        if self.installments == 1:
            raise ValueError("installment settlements require at least two payments")
        if len(self.requested_property_ids) != len(set(self.requested_property_ids)):
            raise ValueError("requested properties cannot be repeated")
        if self.installments == 0 and not self.requested_property_ids:
            raise ValueError("a settlement requires installments or properties")
        if self.installments == 0 and self.interest_percent != 0:
            raise ValueError("a property-only settlement cannot charge interest")
        return self


class AcceptRentDebtPlanCommand(BaseModel):
    action: Literal["accept_rent_debt_plan"]


class RejectRentDebtPlanCommand(BaseModel):
    action: Literal["reject_rent_debt_plan"]


class DeclareBankruptcyCommand(BaseModel):
    action: Literal["declare_bankruptcy"]


class SetPropertyTradeAvailabilityCommand(BaseModel):
    action: Literal["set_property_trade_availability"]
    property_id: str = Field(min_length=1, max_length=160)
    available: bool


class ContinueCardCommand(BaseModel):
    action: Literal["continue_card"]


class ChooseCardCommand(BaseModel):
    action: Literal["choose_card"]
    card_index: int = Field(ge=0, le=6)


class ResolveCardChoiceCommand(BaseModel):
    action: Literal["resolve_card_choice"]
    choice_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")


class ContinueCardChoiceResultCommand(BaseModel):
    action: Literal["continue_card_choice_result"]


class ProposeTradeCommand(BaseModel):
    action: Literal["propose_trade"]
    recipient_id: UUID
    offered_cash: int = Field(default=0, ge=0)
    requested_cash: int = Field(default=0, ge=0)
    offered_property_ids: list[str] = Field(default_factory=list, max_length=40)
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def validate_contents(self) -> ProposeTradeCommand:
        if not any(
            (
                self.offered_cash,
                self.requested_cash,
                self.offered_property_ids,
                self.requested_property_ids,
            )
        ):
            raise ValueError("a trade must exchange cash or properties")
        if len(set(self.offered_property_ids)) != len(self.offered_property_ids):
            raise ValueError("offered properties cannot be repeated")
        if len(set(self.requested_property_ids)) != len(self.requested_property_ids):
            raise ValueError("requested properties cannot be repeated")
        if set(self.offered_property_ids) & set(self.requested_property_ids):
            raise ValueError("a property cannot be offered and requested")
        return self


class CounterTradeCommand(BaseModel):
    action: Literal["counter_trade"]
    trade_id: UUID
    offered_cash: int = Field(default=0, ge=0)
    requested_cash: int = Field(default=0, ge=0)
    offered_property_ids: list[str] = Field(default_factory=list, max_length=40)
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def validate_contents(self) -> CounterTradeCommand:
        if not any(
            (
                self.offered_cash,
                self.requested_cash,
                self.offered_property_ids,
                self.requested_property_ids,
            )
        ):
            raise ValueError("a counter-offer must exchange cash or properties")
        if len(set(self.offered_property_ids)) != len(self.offered_property_ids):
            raise ValueError("offered properties cannot be repeated")
        if len(set(self.requested_property_ids)) != len(self.requested_property_ids):
            raise ValueError("requested properties cannot be repeated")
        if set(self.offered_property_ids) & set(self.requested_property_ids):
            raise ValueError("a property cannot be offered and requested")
        return self


class AcceptTradeCommand(BaseModel):
    action: Literal["accept_trade"]
    trade_id: UUID


class RejectTradeCommand(BaseModel):
    action: Literal["reject_trade"]
    trade_id: UUID


class CancelTradeCommand(BaseModel):
    action: Literal["cancel_trade"]
    trade_id: UUID


GameCommand = Annotated[
    RollCommand
    | BuyPropertyCommand
    | EndTurnCommand
    | DeclinePropertyCommand
    | BidCommand
    | PassAuctionCommand
    | SelectAuctionPropertyCommand
    | PayJailFineCommand
    | UseJailCardCommand
    | MortgagePropertyCommand
    | UnmortgagePropertyCommand
    | BuildPropertyCommand
    | BuildGroupRoundCommand
    | SellBuildingCommand
    | SellGroupRoundCommand
    | RequestLoanCommand
    | RepayLoanCommand
    | BuySharesCommand
    | SellSharesCommand
    | PlaceLimitOrderCommand
    | CancelMarketOrderCommand
    | PayDebtCommand
    | PayRentDebtPlanCommand
    | DemandRentDebtCommand
    | ForgiveRentDebtCommand
    | ProposeRentDebtPlanCommand
    | AcceptRentDebtPlanCommand
    | RejectRentDebtPlanCommand
    | DeclareBankruptcyCommand
    | SetPropertyTradeAvailabilityCommand
    | ContinueCardCommand
    | ChooseCardCommand
    | ResolveCardChoiceCommand
    | ContinueCardChoiceResultCommand
    | ProposeTradeCommand
    | CounterTradeCommand
    | AcceptTradeCommand
    | RejectTradeCommand
    | CancelTradeCommand,
    Field(discriminator="action"),
]


class GameCommandRequest(BaseModel):
    command: GameCommand
    expected_sequence: int = Field(ge=0)
    command_id: UUID


class GameStateView(GameState):
    deck_orders: dict[str, list[str]] = Field(default_factory=dict, exclude=True)
    deck_cursors: dict[str, int] = Field(default_factory=dict, exclude=True)
    events_complete: bool = True


class CreateGameRequest(BaseModel):
    pack_id: str = Field(
        max_length=80,
        pattern=r"^[a-z0-9][a-z0-9_-]*$",
    )
    version: str | None = Field(
        default=None,
        max_length=30,
        pattern=r"^\d+\.\d+\.\d+$",
    )
    deck_collection_ids: dict[str, list[str]] = Field(default_factory=dict)
    economic_difficulty: EconomicDifficulty = EconomicDifficulty.STANDARD

    @model_validator(mode="after")
    def validate_deck_collections(self) -> CreateGameRequest:
        if len(self.deck_collection_ids) > 20:
            raise ValueError("too many deck selections")
        for deck_id, collection_ids in self.deck_collection_ids.items():
            if re.fullmatch(r"[a-z0-9][a-z0-9_-]*", deck_id) is None:
                raise ValueError("deck selection contains an invalid deck id")
            if not collection_ids:
                raise ValueError("select at least one collection per deck")
            if len(collection_ids) != len(set(collection_ids)):
                raise ValueError("deck selections cannot contain duplicates")
            if any(
                re.fullmatch(r"[a-z0-9][a-z0-9_-]*", item) is None
                for item in collection_ids
            ):
                raise ValueError("deck selection contains an invalid collection id")
        return self


class AddBotRequest(BaseModel):
    personality: BotPersonality = BotPersonality.BALANCED
    controller: BotController = BotController.STANDARD
    display_name: str | None = Field(default=None, min_length=2, max_length=40)


class UpdateGameSettingsRequest(BaseModel):
    max_players: int | None = Field(default=None, ge=2, le=20)
    allow_spectators: bool | None = None
    auction_deposit_percent: int | None = Field(default=None, ge=0, le=100)
    auction_minimum_bid_percent: int | None = Field(default=None, ge=0, le=100)
    economic_difficulty: EconomicDifficulty | None = None
    rules: OptionalRulesUpdate | None = None

    @model_validator(mode="after")
    def validate_change(self) -> UpdateGameSettingsRequest:
        if (
            self.max_players is None
            and self.allow_spectators is None
            and self.auction_deposit_percent is None
            and self.auction_minimum_bid_percent is None
            and self.economic_difficulty is None
            and self.rules is None
        ):
            raise ValueError("at least one setting must be provided")
        return self
