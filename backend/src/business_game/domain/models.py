from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


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
    tile_id: str
    collect_start: bool = True


class MoveRelativeCardEffect(ContentModel):
    type: Literal["move_relative"]
    steps: int = Field(ge=-116, le=116)
    collect_start: bool = False

    @model_validator(mode="after")
    def validate_steps(self) -> MoveRelativeCardEffect:
        if self.steps == 0:
            raise ValueError("relative card movement cannot be zero")
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


CardEffect = Annotated[
    CashCardEffect
    | MoveToCardEffect
    | MoveRelativeCardEffect
    | MoveToNearestCardEffect
    | RepairsCardEffect
    | CashEachCardEffect
    | GoToJailCardEffect
    | GetOutOfJailCardEffect,
    Field(discriminator="type"),
]


def _effect_must_be_terminal(effect: CardEffect) -> bool:
    return isinstance(
        effect,
        (
            MoveToCardEffect,
            MoveRelativeCardEffect,
            MoveToNearestCardEffect,
            RepairsCardEffect,
            CashEachCardEffect,
            GoToJailCardEffect,
        ),
    ) or (isinstance(effect, CashCardEffect) and effect.amount < 0)


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


class CardDeckDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name_key: str | None = Field(default=None, min_length=1)
    cards: list[CardDefinition] = Field(min_length=1, max_length=100)


class PropertyGroupDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name_key: str
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class TileDefinition(ContentModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    kind: TileKind
    name_key: str
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
            TileKind.TAX: {"amount", "net_worth_percent"},
            TileKind.CARD: {"deck_id"},
            TileKind.JAIL: {"landing_effects"},
            TileKind.GO_TO_JAIL: set(),
            TileKind.FREE: {"landing_effects"},
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
        if self.kind is TileKind.TAX and (
            (self.amount is None) == (self.net_worth_percent is None)
        ):
            raise ValueError(
                "tax tiles require exactly one of amount or net_worth_percent"
            )
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


class OptionalRules(ContentModel):
    auction_unpurchased_properties: bool = True
    free_parking_jackpot: bool = False
    double_salary_on_start: bool = False


class OptionalRulesUpdate(BaseModel):
    auction_unpurchased_properties: bool | None = None
    free_parking_jackpot: bool | None = None
    double_salary_on_start: bool | None = None

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

    @model_validator(mode="after")
    def validate_perimeter(self) -> PackManifest:
        if self.tile_count != self.side_length * 4 - 4:
            raise ValueError("tile_count must match a square perimeter")
        if self.default_locale not in self.locales:
            raise ValueError("default_locale must be listed in locales")
        if self.min_players > self.max_players:
            raise ValueError("min_players cannot exceed max_players")
        if len(self.configurable_rules) != len(set(self.configurable_rules)):
            raise ValueError("configurable_rules cannot contain duplicates")
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


class TokenResponse(BaseModel):
    access_token: str
    user_id: UUID
    token_type: Literal["bearer"] = "bearer"


class PlayerState(BaseModel):
    user_id: UUID
    display_name: str
    position: int = 0
    balance: int = 1500
    bankrupt: bool = False
    in_jail: bool = False
    jail_failed_rolls: int = Field(default=0, ge=0)
    jail_card_ids: list[str] = Field(default_factory=list, max_length=20)


class SpectatorState(BaseModel):
    user_id: UUID
    display_name: str


class GameSettings(BaseModel):
    max_players: int | None = Field(default=None, ge=2, le=12)
    allow_spectators: bool = True
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
    TAX = "tax"
    CARD = "card"
    JAIL_FINE = "jail_fine"
    RESIGNATION = "resignation"


class DebtState(BaseModel):
    debtor_id: UUID
    creditor_id: UUID | None = None
    amount: int = Field(gt=0)
    reason: DebtReason
    tile_id: str


class CardPaymentState(BaseModel):
    payer_id: UUID
    recipient_id: UUID
    amount: int = Field(gt=0)
    card_id: str


class AuctionState(BaseModel):
    property_id: str
    current_bid: int = Field(default=0, ge=0)
    current_bidder_id: UUID | None = None
    bid_deadline: datetime | None = None
    eligible_player_ids: list[UUID] = Field(min_length=2, max_length=12)
    passed_player_ids: list[UUID] = Field(default_factory=list, max_length=12)


class TradeOffer(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    proposer_id: UUID
    recipient_id: UUID
    offered_cash: int = Field(default=0, ge=0)
    requested_cash: int = Field(default=0, ge=0)
    offered_property_ids: list[str] = Field(default_factory=list, max_length=40)
    requested_property_ids: list[str] = Field(default_factory=list, max_length=40)
    status: TradeStatus = TradeStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None


class GameEvent(BaseModel):
    sequence: int
    type: str
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    data: dict[str, object] = Field(default_factory=dict)


class GameState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    host_user_id: UUID
    pack_id: str
    pack_version: str
    pack_snapshot: ContentPack | None = Field(default=None, exclude=True)
    status: GameStatus = GameStatus.LOBBY
    players: list[PlayerState] = Field(default_factory=list)
    spectators: list[SpectatorState] = Field(default_factory=list, max_length=50)
    settings: GameSettings = Field(default_factory=GameSettings)
    current_player_index: int = 0
    phase: TurnPhase = TurnPhase.WAITING_FOR_ROLL
    owners: dict[str, UUID] = Field(default_factory=dict)
    pending_tile_id: str | None = None
    active_auction: AuctionState | None = None
    active_debt: DebtState | None = None
    pending_card_payments: list[CardPaymentState] = Field(
        default_factory=list,
        max_length=12,
    )
    bank_pot: int = Field(default=0, ge=0)
    mortgaged_property_ids: list[str] = Field(default_factory=list)
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
    last_card_id: str | None = None
    trades: list[TradeOffer] = Field(default_factory=list, max_length=100)
    last_roll: tuple[int, int] | None = None
    events: list[GameEvent] = Field(default_factory=list)

    @property
    def current_player(self) -> PlayerState | None:
        if not self.players:
            return None
        return self.players[self.current_player_index]

    @model_validator(mode="after")
    def validate_economic_state(self) -> GameState:
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
        if len(self.mortgaged_property_ids) != len(
            set(self.mortgaged_property_ids)
        ):
            raise ValueError("mortgaged properties cannot be repeated")
        owner_ids = set(self.owners)
        mortgaged_ids = set(self.mortgaged_property_ids)
        building_ids = set(self.building_levels)
        if not mortgaged_ids.issubset(owner_ids):
            raise ValueError("mortgaged properties must have an owner")
        if not building_ids.issubset(owner_ids):
            raise ValueError("developed properties must have an owner")
        if mortgaged_ids & building_ids:
            raise ValueError("a mortgaged property cannot have buildings")
        if self.active_debt is not None and not any(
            player.user_id == self.active_debt.debtor_id for player in self.players
        ):
            raise ValueError("the debt debtor must be a game participant")
        for payment in self.pending_card_payments:
            if payment.payer_id not in player_ids or payment.recipient_id not in player_ids:
                raise ValueError("card payments require game participants")
            if payment.payer_id == payment.recipient_id:
                raise ValueError("card payments require different participants")
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


class SellBuildingCommand(BaseModel):
    action: Literal["sell_building"]
    property_id: str


class PayDebtCommand(BaseModel):
    action: Literal["pay_debt"]


class DeclareBankruptcyCommand(BaseModel):
    action: Literal["declare_bankruptcy"]


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
    | PayJailFineCommand
    | UseJailCardCommand
    | MortgagePropertyCommand
    | UnmortgagePropertyCommand
    | BuildPropertyCommand
    | SellBuildingCommand
    | PayDebtCommand
    | DeclareBankruptcyCommand
    | ProposeTradeCommand
    | AcceptTradeCommand
    | RejectTradeCommand
    | CancelTradeCommand,
    Field(discriminator="action"),
]


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


class UpdateGameSettingsRequest(BaseModel):
    max_players: int | None = Field(default=None, ge=2, le=12)
    allow_spectators: bool | None = None
    rules: OptionalRulesUpdate | None = None

    @model_validator(mode="after")
    def validate_change(self) -> UpdateGameSettingsRequest:
        if (
            self.max_players is None
            and self.allow_spectators is None
            and self.rules is None
        ):
            raise ValueError("at least one setting must be provided")
        return self
