"""Deal reasoning shared by scripted bots and AI-driven bots.

Every number here is an integer percentage so two runs over the same snapshot
always reach the same decision: the bot runner replays commands with an
``expected_sequence`` guard and any floating-point drift would desynchronise it.

Valuations stay anchored to the board price scale on purpose. A property is
worth what it costs plus what owning it changes about the rest of the portfolio,
so cash and properties can be compared one to one inside a trade.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from business_game.domain.models import (
    BotPersonality,
    ContentPack,
    GameState,
    PlayerState,
    ProposeTradeCommand,
    TileDefinition,
    TileKind,
    TradeAnalysisResponse,
    TradeOffer,
    TradeSideAnalysis,
    TradeStatus,
)

MONOPOLY_BASE_PERCENT = 190
MONOPOLY_MULTIPLIER_PERCENT = 15
PARTIAL_GROUP_PERCENT = 22
SAME_KIND_PERCENT = 25
MORTGAGED_PERCENT = 72
BUILDING_EQUITY_PERCENT = 80
RENT_ANCHOR_MULTIPLIER = 8
AVERAGE_DICE_ROLL = 7

MOOD_SPREAD = 9
BEHIND_RELIEF_PERCENT = 12
AHEAD_GUARD_PERCENT = 10
RELATIONSHIP_THRESHOLD_SPREAD = 12
COUNTER_WINDOW_PERCENT = 30
COUNTER_MARGIN_PERCENT = 106
PRICING_SAFETY_PERCENT = 105
SWEETENING_PERCENT = 110

MAX_WANTED_TARGETS = 4
MAX_SPARES_CONSIDERED = 4
MAX_CANDIDATES = 12
MAX_NEGOTIATION_ROUNDS = 3
MAX_COUNTER_LOOKBACK = 5
DICE_OUTCOME_COUNT = 36


class TradeVerdict(StrEnum):
    ACCEPT = "accept"
    COUNTER = "counter"
    REJECT = "reject"


@dataclass(frozen=True)
class PersonalityProfile:
    """Scripted temperament. The first six fields drive non-trade decisions."""

    cash_reserve_percent: int
    buy_required_percent: int
    auction_value_percent: int
    trade_accept_percent: int
    trade_offer_percent: int
    build_reserve_percent: int
    sociability: int
    patience: int
    blocking_appetite: int
    fairness: int
    grudge: int


PROFILES: dict[BotPersonality, PersonalityProfile] = {
    BotPersonality.CONSERVATIVE: PersonalityProfile(
        cash_reserve_percent=35,
        buy_required_percent=120,
        auction_value_percent=75,
        trade_accept_percent=115,
        trade_offer_percent=78,
        build_reserve_percent=40,
        sociability=45,
        patience=3,
        blocking_appetite=40,
        fairness=70,
        grudge=6,
    ),
    BotPersonality.BALANCED: PersonalityProfile(
        cash_reserve_percent=25,
        buy_required_percent=100,
        auction_value_percent=95,
        trade_accept_percent=103,
        trade_offer_percent=88,
        build_reserve_percent=28,
        sociability=65,
        patience=2,
        blocking_appetite=45,
        fairness=50,
        grudge=8,
    ),
    BotPersonality.AGGRESSIVE: PersonalityProfile(
        cash_reserve_percent=12,
        buy_required_percent=85,
        auction_value_percent=125,
        trade_accept_percent=98,
        trade_offer_percent=96,
        build_reserve_percent=12,
        sociability=55,
        patience=1,
        blocking_appetite=75,
        fairness=15,
        grudge=14,
    ),
    BotPersonality.NEGOTIATOR: PersonalityProfile(
        cash_reserve_percent=22,
        buy_required_percent=100,
        auction_value_percent=100,
        trade_accept_percent=95,
        trade_offer_percent=94,
        build_reserve_percent=25,
        sociability=95,
        patience=2,
        blocking_appetite=40,
        fairness=80,
        grudge=4,
    ),
}


def profile_for(player: PlayerState) -> PersonalityProfile:
    """Humans are read as balanced: their temperament is not public knowledge."""
    if not player.is_bot or player.bot_personality is None:
        return PROFILES[BotPersonality.BALANCED]
    return PROFILES[player.bot_personality]


@dataclass(frozen=True)
class TradeValuation:
    proposer_property_gain: int
    proposer_property_loss: int
    recipient_property_gain: int
    recipient_property_loss: int
    offered_cash: int
    requested_cash: int
    proposer_incoming_anchor: int = 0
    recipient_incoming_anchor: int = 0

    @property
    def proposer_gain(self) -> int:
        return self.proposer_property_gain + self.requested_cash

    @property
    def proposer_cost(self) -> int:
        return self.proposer_property_loss + self.offered_cash

    @property
    def recipient_gain(self) -> int:
        return self.recipient_property_gain + self.offered_cash

    @property
    def recipient_cost(self) -> int:
        return self.recipient_property_loss + self.requested_cash

    @property
    def proposer_surplus(self) -> int:
        return self.proposer_gain - self.proposer_cost

    @property
    def recipient_surplus(self) -> int:
        return self.recipient_gain - self.recipient_cost

    @property
    def joint_surplus(self) -> int:
        return self.proposer_surplus + self.recipient_surplus


@dataclass(frozen=True)
class TradeAssessment:
    verdict: TradeVerdict
    reason: str
    counter: ProposeTradeCommand | None = None


@dataclass(frozen=True)
class LandingExposure:
    payment_probability: int
    expected_payments: int
    expected_rent_income: int
    highest_payment: int


@dataclass(frozen=True)
class TradeCandidate:
    command: ProposeTradeCommand
    reason: str
    valuation: TradeValuation
    score: int


class NegotiationEngine:
    """Values portfolios and builds deals both sides can rationally accept."""

    def __init__(self, game: GameState, pack: ContentPack) -> None:
        self._game = game
        self._pack = pack
        self._tiles = {tile.id: tile for tile in pack.board.tiles}
        self._groups: dict[str, list[TileDefinition]] = {}
        self._kinds: dict[TileKind, list[TileDefinition]] = {}
        for tile in pack.board.tiles:
            if tile.kind is TileKind.PROPERTY and tile.group is not None:
                self._groups.setdefault(tile.group, []).append(tile)
            elif tile.kind in {TileKind.TRANSPORT, TileKind.UTILITY}:
                self._kinds.setdefault(tile.kind, []).append(tile)

    # ----------------------------------------------------------------- values

    def strategic_value(
        self,
        player_id: UUID,
        tile: TileDefinition,
        owners: dict[str, UUID],
    ) -> int:
        """What holding ``tile`` is worth to ``player_id`` under ``owners``."""
        if not tile.is_purchasable:
            return 0
        value = self._anchor(tile)
        if tile.kind is TileKind.PROPERTY and tile.group is not None:
            group = self._groups.get(tile.group, [tile])
            owned = sum(owners.get(item.id) == player_id for item in group)
            if len(group) > 1 and owned == len(group):
                monopoly_percent = (
                    MONOPOLY_BASE_PERCENT
                    + MONOPOLY_MULTIPLIER_PERCENT
                    * self._pack.manifest.monopoly_rent_multiplier
                )
                value = value * monopoly_percent // 100
            elif owned > 1:
                value = value * (100 + PARTIAL_GROUP_PERCENT * (owned - 1)) // 100
        elif tile.kind in {TileKind.TRANSPORT, TileKind.UTILITY}:
            peers = self._kinds.get(tile.kind, [tile])
            owned = sum(owners.get(item.id) == player_id for item in peers)
            value = value * (100 + SAME_KIND_PERCENT * max(owned - 1, 0)) // 100
        level = self._game.building_levels.get(tile.id, 0)
        if level:
            value += level * (tile.build_cost or 0) * BUILDING_EQUITY_PERCENT // 100
        if tile.id in self._game.mortgaged_property_ids:
            value = value * MORTGAGED_PERCENT // 100
        return value

    def portfolio_value(self, player_id: UUID, owners: dict[str, UUID]) -> int:
        return sum(
            self.strategic_value(player_id, tile, owners)
            for tile in self._pack.board.tiles
            if owners.get(tile.id) == player_id
        )

    def marginal_value(self, player_id: UUID, property_ids: list[str]) -> int:
        """Portfolio change from gaining ``property_ids``, synergy included."""
        if not property_ids:
            return 0
        owners = dict(self._game.owners)
        before = self.portfolio_value(player_id, owners)
        for property_id in property_ids:
            owners[property_id] = player_id
        return self.portfolio_value(player_id, owners) - before

    def separation_cost(self, player_id: UUID, property_ids: list[str]) -> int:
        """Portfolio change from losing ``property_ids``, synergy included."""
        if not property_ids:
            return 0
        owners = dict(self._game.owners)
        before = self.portfolio_value(player_id, owners)
        for property_id in property_ids:
            owners.pop(property_id, None)
        return before - self.portfolio_value(player_id, owners)

    def should_offer_property_for_trade(
        self,
        player_id: UUID,
        tile: TileDefinition,
    ) -> bool:
        """A loose asset may be offered; a developed or strategic asset stays protected."""
        if (
            not tile.is_purchasable
            or self._game.owners.get(tile.id) != player_id
            or self._game.building_levels.get(tile.id, 0) > 0
        ):
            return False
        separation_cost = self.separation_cost(player_id, [tile.id])
        return separation_cost <= self._anchor(tile) * SWEETENING_PERCENT // 100

    def evaluate(
        self,
        proposer_id: UUID,
        recipient_id: UUID,
        *,
        offered_cash: int,
        requested_cash: int,
        offered_property_ids: list[str],
        requested_property_ids: list[str],
    ) -> TradeValuation:
        """Split each side into what it loses and what it then gains.

        Both legs are measured against the state where the player already handed
        its own properties over, so a swap inside a single group cannot look like
        a gain and a loss at the same time.
        """
        before = self._game.owners
        after = dict(before)
        for property_id in offered_property_ids:
            after[property_id] = recipient_id
        for property_id in requested_property_ids:
            after[property_id] = proposer_id

        proposer_mid = {
            key: value
            for key, value in before.items()
            if key not in set(offered_property_ids)
        }
        recipient_mid = {
            key: value
            for key, value in before.items()
            if key not in set(requested_property_ids)
        }
        proposer_mid_value = self.portfolio_value(proposer_id, proposer_mid)
        recipient_mid_value = self.portfolio_value(recipient_id, recipient_mid)
        return TradeValuation(
            proposer_property_gain=(
                self.portfolio_value(proposer_id, after) - proposer_mid_value
            ),
            proposer_property_loss=(
                self.portfolio_value(proposer_id, before) - proposer_mid_value
            ),
            recipient_property_gain=(
                self.portfolio_value(recipient_id, after) - recipient_mid_value
            ),
            recipient_property_loss=(
                self.portfolio_value(recipient_id, before) - recipient_mid_value
            ),
            offered_cash=offered_cash,
            requested_cash=requested_cash,
            proposer_incoming_anchor=self._anchor_total(requested_property_ids),
            recipient_incoming_anchor=self._anchor_total(offered_property_ids),
        )

    def analyze_trade(
        self,
        actor: PlayerState,
        trade: TradeOffer,
    ) -> TradeAnalysisResponse:
        """Evaluate a pending deal from either participant's point of view."""
        if actor.user_id not in {trade.proposer_id, trade.recipient_id}:
            raise ValueError("the player is not part of this trade")
        valuation = self.evaluate(
            trade.proposer_id,
            trade.recipient_id,
            offered_cash=trade.offered_cash,
            requested_cash=trade.requested_cash,
            offered_property_ids=trade.offered_property_ids,
            requested_property_ids=trade.requested_property_ids,
        )
        proposer = self._player(trade.proposer_id)
        recipient = self._player(trade.recipient_id)
        if proposer is None or recipient is None:
            raise ValueError("the trade participants are not in the game")
        owners_after = dict(self._game.owners)
        for property_id in trade.offered_property_ids:
            owners_after[property_id] = trade.recipient_id
        for property_id in trade.requested_property_ids:
            owners_after[property_id] = trade.proposer_id
        proposer_analysis = self._analyze_trade_side(
            proposer,
            "proposer",
            trade,
            valuation,
            owners_after,
        )
        recipient_analysis = self._analyze_trade_side(
            recipient,
            "recipient",
            trade,
            valuation,
            owners_after,
        )
        selected = (
            proposer_analysis
            if actor.user_id == trade.proposer_id
            else recipient_analysis
        )
        return TradeAnalysisResponse(
            trade_id=trade.id,
            perspective=selected.role,
            verdict=selected.verdict,
            convenience_level=selected.convenience_level,
            reason_code=selected.reason_code,
            estimated_gain=selected.estimated_gain,
            estimated_cost=selected.estimated_cost,
            estimated_surplus=selected.estimated_surplus,
            risk_adjusted_surplus=selected.risk_adjusted_surplus,
            cash_after=selected.cash_after,
            liquidity_floor=selected.liquidity_floor,
            proposer_analysis=proposer_analysis,
            recipient_analysis=recipient_analysis,
            snapshot_sequence=self._game.event_sequence,
        )

    def _analyze_trade_side(
        self,
        player: PlayerState,
        role: str,
        trade: TradeOffer,
        valuation: TradeValuation,
        owners_after: dict[str, UUID],
    ) -> TradeSideAnalysis:
        if role == "proposer":
            perspective_trade = TradeOffer(
                proposer_id=trade.recipient_id,
                recipient_id=trade.proposer_id,
                offered_cash=trade.requested_cash,
                requested_cash=trade.offered_cash,
                offered_property_ids=trade.requested_property_ids,
                requested_property_ids=trade.offered_property_ids,
            )
            gain = valuation.proposer_gain
            cost = valuation.proposer_cost
            cash_after = player.balance + trade.requested_cash - trade.offered_cash
        else:
            perspective_trade = trade
            gain = valuation.recipient_gain
            cost = valuation.recipient_cost
            cash_after = player.balance + trade.offered_cash - trade.requested_cash
        assessment = self.assess_incoming(player, perspective_trade)
        before = self._landing_exposure(player, self._game.owners, player.balance)
        after = self._landing_exposure(player, owners_after, cash_after)
        surplus = gain - cost
        risk_adjusted_surplus = (
            surplus
            + after.expected_rent_income
            - before.expected_rent_income
            - after.expected_payments
            + before.expected_payments
        )
        liquidity_floor = self._liquidity_floor(player, owners_after)
        convenience_level = self._convenience_level(
            risk_adjusted_surplus,
            gain,
            cost,
            cash_after,
            liquidity_floor,
        )
        verdict = self._verdict_for_convenience(convenience_level)
        risk_drag = (
            after.expected_payments
            - before.expected_payments
            - after.expected_rent_income
            + before.expected_rent_income
        )
        reason_code = assessment.reason
        if cash_after < liquidity_floor:
            reason_code = "reject_liquidity_risk"
        elif verdict == "reject" and risk_drag > 0:
            reason_code = "reject_landing_exposure"
        elif verdict == "accept" and risk_drag < 0:
            reason_code = "accept_rent_outlook"
        elif verdict == "counter":
            reason_code = "counter_rebalanced"
        return TradeSideAnalysis(
            player_id=player.user_id,
            role=role,
            verdict=verdict,
            convenience_level=convenience_level,
            reason_code=reason_code,
            estimated_gain=gain,
            estimated_cost=cost,
            estimated_surplus=surplus,
            risk_adjusted_surplus=risk_adjusted_surplus,
            cash_before=player.balance,
            cash_after=cash_after,
            liquidity_floor=liquidity_floor,
            payment_probability_before=before.payment_probability,
            payment_probability_after=after.payment_probability,
            expected_payments_before=before.expected_payments,
            expected_payments_after=after.expected_payments,
            expected_rent_income_before=before.expected_rent_income,
            expected_rent_income_after=after.expected_rent_income,
            highest_payment_before=before.highest_payment,
            highest_payment_after=after.highest_payment,
        )

    @staticmethod
    def _convenience_level(
        risk_adjusted_surplus: int,
        gain: int,
        cost: int,
        cash_after: int,
        liquidity_floor: int,
    ) -> str:
        if cash_after < 0:
            return "very_unfavorable"
        margin_percent = risk_adjusted_surplus * 100 // max(gain, cost, 1)
        if margin_percent <= -25:
            return "very_unfavorable"
        if cash_after < liquidity_floor or margin_percent <= -5:
            return "unfavorable"
        if margin_percent < 5:
            return "balanced"
        if margin_percent < 25:
            return "favorable"
        return "very_favorable"

    @staticmethod
    def _verdict_for_convenience(convenience_level: str) -> str:
        if convenience_level in {"very_favorable", "favorable"}:
            return "accept"
        if convenience_level == "balanced":
            return "counter"
        return "reject"

    def _landing_exposure(
        self,
        player: PlayerState,
        owners: dict[str, UUID],
        cash: int,
    ) -> LandingExposure:
        payment_outcomes = 0
        weighted_payments = 0
        weighted_income = 0
        highest_payment = 0
        for first in range(1, 7):
            for second in range(1, 7):
                dice_total = first + second
                position = self._next_position(player, first, second)
                tile = self._pack.board.tiles[position]
                payment = self._landing_payment(
                    player,
                    tile,
                    owners,
                    cash,
                    dice_total,
                )
                weighted_payments += payment
                highest_payment = max(highest_payment, payment)
                if payment > 0:
                    payment_outcomes += 1
        for rival in self._game.players:
            if rival.user_id == player.user_id or rival.bankrupt:
                continue
            for first in range(1, 7):
                for second in range(1, 7):
                    position = self._next_position(rival, first, second)
                    tile = self._pack.board.tiles[position]
                    if (
                        owners.get(tile.id) != player.user_id
                        or tile.id in self._game.mortgaged_property_ids
                    ):
                        continue
                    weighted_income += self._rent_for(
                        tile,
                        player.user_id,
                        owners,
                        first + second,
                    )
        return LandingExposure(
            payment_probability=(payment_outcomes * 100 + 18) // DICE_OUTCOME_COUNT,
            expected_payments=(weighted_payments + 18) // DICE_OUTCOME_COUNT,
            expected_rent_income=(weighted_income + 18) // DICE_OUTCOME_COUNT,
            highest_payment=highest_payment,
        )

    def _next_position(
        self,
        player: PlayerState,
        first: int,
        second: int,
    ) -> int:
        tile_count = self._pack.manifest.tile_count
        is_double = first == second
        if player.in_jail:
            forced_release = (
                player.jail_failed_rolls + 1
                >= self._pack.manifest.jail_max_failed_rolls
            )
            return (
                (player.position + first + second) % tile_count
                if is_double or forced_release
                else player.position
            )
        if (
            self._game.current_player is not None
            and self._game.current_player.user_id == player.user_id
            and is_double
            and self._game.consecutive_doubles + 1
            >= self._pack.manifest.max_consecutive_doubles
        ):
            jail_position = next(
                (
                    index
                    for index, tile in enumerate(self._pack.board.tiles)
                    if tile.kind is TileKind.JAIL
                ),
                player.position,
            )
            return jail_position
        return (player.position + first + second) % tile_count

    def _landing_payment(
        self,
        player: PlayerState,
        tile: TileDefinition,
        owners: dict[str, UUID],
        cash: int,
        dice_total: int,
    ) -> int:
        owner_id = owners.get(tile.id)
        if (
            owner_id is not None
            and owner_id != player.user_id
            and tile.id not in self._game.mortgaged_property_ids
        ):
            return self._rent_for(tile, owner_id, owners, dice_total)
        if tile.kind is TileKind.TAX:
            return self._tax_for(player, tile, owners, cash)
        return 0

    def _tax_for(
        self,
        player: PlayerState,
        tile: TileDefinition,
        owners: dict[str, UUID],
        cash: int,
    ) -> int:
        if tile.amount is not None:
            return tile.amount
        if tile.net_worth_percent is not None:
            net_worth = cash + sum(
                (owned_tile.price or 0)
                + min(self._game.building_levels.get(owned_tile.id, 0), 4)
                * (owned_tile.build_cost or 0)
                + (
                    owned_tile.hotel_cost or owned_tile.build_cost or 0
                    if self._game.building_levels.get(owned_tile.id, 0) == 5
                    else 0
                )
                for owned_tile in self._pack.board.tiles
                if owners.get(owned_tile.id) == player.user_id
            )
            return net_worth * tile.net_worth_percent // 100
        if tile.complete_group_amount is not None:
            complete_groups = sum(
                bool(group)
                and all(owners.get(item.id) == player.user_id for item in group)
                for group in self._groups.values()
            )
            return complete_groups * tile.complete_group_amount
        house_count = sum(
            level if level < 5 else 0
            for property_id, level in self._game.building_levels.items()
            if owners.get(property_id) == player.user_id
        )
        hotel_count = sum(
            level == 5
            for property_id, level in self._game.building_levels.items()
            if owners.get(property_id) == player.user_id
        )
        return house_count * (tile.house_amount or 0) + hotel_count * (
            tile.hotel_amount or 0
        )

    # ------------------------------------------------------------- pressures

    def expected_rent(self, tile: TileDefinition, owner_id: UUID) -> int:
        return self._rent_for(
            tile,
            owner_id,
            self._game.owners,
            AVERAGE_DICE_ROLL,
        )

    def _rent_for(
        self,
        tile: TileDefinition,
        owner_id: UUID,
        owners: dict[str, UUID],
        dice_total: int,
    ) -> int:
        if not tile.is_purchasable or tile.id in self._game.mortgaged_property_ids:
            return 0
        if tile.kind is TileKind.PROPERTY:
            levels = tile.rent_levels or [tile.base_rent or 0]
            level = self._game.building_levels.get(tile.id, 0)
            if level:
                return levels[min(level, len(levels) - 1)]
            group = self._groups.get(tile.group or "", [tile])
            if len(group) > 1 and all(
                owners.get(item.id) == owner_id for item in group
            ) and not any(
                item.id in self._game.mortgaged_property_ids for item in group
            ):
                return (tile.base_rent or 0) * self._pack.manifest.monopoly_rent_multiplier
            return tile.base_rent or 0
        peers = self._kinds.get(tile.kind, [tile])
        owned = max(sum(owners.get(item.id) == owner_id for item in peers), 1)
        if tile.kind is TileKind.UTILITY:
            multipliers = tile.rent_multipliers or [0]
            index = min(owned - 1, len(multipliers) - 1)
            return multipliers[index] * dice_total
        levels = tile.rent_levels or [tile.base_rent or 0]
        return levels[min(owned - 1, len(levels) - 1)]

    def rent_threat(
        self,
        player: PlayerState,
        owners: dict[str, UUID] | None = None,
    ) -> int:
        """Worst single rent the board can charge ``player`` right now."""
        scenario_owners = owners if owners is not None else self._game.owners
        threats = [
            self._rent_for(tile, owner_id, scenario_owners, AVERAGE_DICE_ROLL)
            for tile in self._pack.board.tiles
            if (owner_id := scenario_owners.get(tile.id)) is not None
            and owner_id != player.user_id
        ]
        return max(threats, default=0)

    def liquidity_floor(self, player: PlayerState) -> int:
        return self._liquidity_floor(player, self._game.owners)

    def _liquidity_floor(
        self,
        player: PlayerState,
        owners: dict[str, UUID],
    ) -> int:
        profile = profile_for(player)
        reserve = max(
            self._pack.manifest.starting_balance * profile.cash_reserve_percent // 100,
            1,
        )
        return max(reserve, self.rent_threat(player, owners))

    def net_worth(self, player: PlayerState) -> int:
        total = player.balance
        for tile in self._pack.board.tiles:
            if self._game.owners.get(tile.id) != player.user_id:
                continue
            if tile.id in self._game.mortgaged_property_ids:
                total += tile.mortgage_value or 0
            else:
                total += tile.price or 0
            level = self._game.building_levels.get(tile.id, 0)
            total += level * (tile.build_cost or 0) * BUILDING_EQUITY_PERCENT // 100
        return total

    def standing_percent(self, player: PlayerState) -> int:
        """Net worth against the strongest rival, as a percentage."""
        rivals = [
            self.net_worth(other)
            for other in self._game.players
            if other.user_id != player.user_id and not other.bankrupt
        ]
        best_rival = max(rivals, default=0)
        if best_rival <= 0:
            return 200
        return self.net_worth(player) * 100 // best_rival

    def is_distressed(self, player: PlayerState) -> bool:
        """Cash cannot cover the worst landing and the board is ahead."""
        return (
            player.balance < self.rent_threat(player)
            and self.standing_percent(player) < 100
        )

    def threshold_percent(
        self,
        player: PlayerState,
        counterpart: PlayerState,
        *,
        jitter: bool = True,
    ) -> int:
        """Value ratio ``player`` demands before agreeing with ``counterpart``.

        Pricing a proposal passes ``jitter=False``: the offer has to be stable for
        the whole turn, while the mood is free to move when judging what arrives.
        """
        profile = profile_for(player)
        threshold = profile.trade_accept_percent
        if jitter:
            threshold += self._mood(player.user_id)
        standing = self.standing_percent(player)
        if standing < 70:
            threshold -= BEHIND_RELIEF_PERCENT
        elif standing > 140:
            threshold += AHEAD_GUARD_PERCENT
        if self._refused_a_fair_deal(player.user_id, counterpart.user_id):
            threshold += profile.grudge
        relationship = next(
            (
                item.score
                for item in self._game.bot_relationships
                if item.bot_id == player.user_id
                and item.player_id == counterpart.user_id
            ),
            0,
        )
        threshold -= relationship * RELATIONSHIP_THRESHOLD_SPREAD // 100
        return max(threshold, 60)

    def clears_bar(
        self,
        player: PlayerState,
        counterpart: PlayerState,
        valuation: TradeValuation,
        *,
        as_recipient: bool,
        jitter: bool = True,
    ) -> bool:
        gain = valuation.recipient_gain if as_recipient else valuation.proposer_gain
        cost = self._strategic_cost(player, valuation, as_recipient=as_recipient)
        if gain <= 0 and cost <= 0:
            return False
        threshold = self.threshold_percent(player, counterpart, jitter=jitter)
        return gain * 100 >= cost * threshold

    # ------------------------------------------------------- incoming trades

    def assess_incoming(self, bot: PlayerState, trade: TradeOffer) -> TradeAssessment:
        proposer = self._player(trade.proposer_id)
        if proposer is None:
            return TradeAssessment(TradeVerdict.REJECT, "reject_unknown_proposer")
        unavailable_property_ids = set(self._game.trade_unavailable_property_ids)
        if unavailable_property_ids.intersection(
            trade.offered_property_ids,
            trade.requested_property_ids,
        ):
            return TradeAssessment(TradeVerdict.REJECT, "reject_property_unavailable")
        valuation = self.evaluate(
            trade.proposer_id,
            trade.recipient_id,
            offered_cash=trade.offered_cash,
            requested_cash=trade.requested_cash,
            offered_property_ids=trade.offered_property_ids,
            requested_property_ids=trade.requested_property_ids,
        )
        cash_after = bot.balance + trade.offered_cash - trade.requested_cash
        floor = self.liquidity_floor(bot)
        if cash_after < 0 or (
            trade.requested_cash > 0 and cash_after < floor and not self.is_distressed(bot)
        ):
            return TradeAssessment(TradeVerdict.REJECT, "reject_liquidity_risk")

        if self._hands_over_a_monopoly(trade):
            # Selling the last piece of somebody else's group is only worth it
            # when the deal pays back a real share of what they are about to win.
            profile = profile_for(bot)
            premium = valuation.proposer_gain * profile.blocking_appetite // 100
            if valuation.recipient_gain < premium:
                return TradeAssessment(TradeVerdict.REJECT, "reject_completes_rival_group")

        if self.clears_bar(bot, proposer, valuation, as_recipient=True):
            reason = self._acceptance_reason(bot, trade, valuation)
            return TradeAssessment(TradeVerdict.ACCEPT, reason)

        counter = self._build_counter(bot, proposer, trade, valuation)
        if counter is not None:
            return TradeAssessment(TradeVerdict.COUNTER, "counter_rebalanced", counter)
        return TradeAssessment(TradeVerdict.REJECT, self._refusal_reason(valuation))

    # ------------------------------------------------------ outgoing trades

    def candidate_trades(self, bot: PlayerState) -> list[TradeCandidate]:
        profile = profile_for(bot)
        if profile.sociability + self._mood(bot.user_id) < 40:
            return []
        candidates: list[TradeCandidate] = []
        for rival in self._tradable_rivals(bot):
            candidates.extend(self._acquisition_candidates(bot, rival))
            candidates.extend(self._liquidity_candidates(bot, rival))
        ranked = sorted(
            candidates,
            key=lambda candidate: (-candidate.score, candidate.command.recipient_id.hex),
        )
        return ranked[:MAX_CANDIDATES]

    def _acquisition_candidates(
        self,
        bot: PlayerState,
        rival: PlayerState,
    ) -> list[TradeCandidate]:
        wanted = self._wanted_from(bot, rival)
        if not wanted:
            return []
        spares = self._spares_of(bot, rival)
        candidates: list[TradeCandidate] = []
        for target in wanted:
            candidates.extend(
                self._priced_candidate(
                    bot,
                    rival,
                    offered_property_ids=[],
                    requested_property_ids=[target.id],
                    reason="propose_cash_for_group",
                )
            )
            for spare in spares:
                candidates.extend(
                    self._priced_candidate(
                        bot,
                        rival,
                        offered_property_ids=[spare.id],
                        requested_property_ids=[target.id],
                        reason=(
                            "propose_win_win_swap"
                            if self.completes_group(rival.user_id, spare)
                            else "propose_swap_for_group"
                        ),
                    )
                )
        return candidates

    def _liquidity_candidates(
        self,
        bot: PlayerState,
        rival: PlayerState,
    ) -> list[TradeCandidate]:
        if bot.balance >= self.liquidity_floor(bot):
            return []
        candidates: list[TradeCandidate] = []
        for spare in self._spares_of(bot, rival):
            candidates.extend(
                self._priced_candidate(
                    bot,
                    rival,
                    offered_property_ids=[spare.id],
                    requested_property_ids=[],
                    reason="propose_sell_spare_for_cash",
                )
            )
        return candidates

    def _priced_candidate(
        self,
        bot: PlayerState,
        rival: PlayerState,
        *,
        offered_property_ids: list[str],
        requested_property_ids: list[str],
        reason: str,
    ) -> list[TradeCandidate]:
        """Solve for the cash leg that clears both bars, then keep it if legal."""
        base = self.evaluate(
            bot.user_id,
            rival.user_id,
            offered_cash=0,
            requested_cash=0,
            offered_property_ids=offered_property_ids,
            requested_property_ids=requested_property_ids,
        )
        rival_threshold = self.threshold_percent(rival, bot, jitter=False)
        rival_cost = self._strategic_cost(rival, base, as_recipient=True)
        required = rival_cost * rival_threshold // 100 - base.recipient_property_gain
        # A small premium so a shift of mood on the other side does not waste the turn.
        cash_to_rival = max(required * PRICING_SAFETY_PERCENT // 100, 0)
        cash_to_bot = 0
        if cash_to_rival == 0:
            bot_threshold = self.threshold_percent(bot, rival, jitter=False)
            bot_cost = self._strategic_cost(bot, base, as_recipient=False)
            shortfall = bot_cost * bot_threshold // 100 - base.proposer_property_gain
            asking = shortfall * PRICING_SAFETY_PERCENT // 100
            headroom = max(base.recipient_property_gain - rival_cost, 0)
            cash_to_bot = max(min(asking, headroom, self._spendable(rival)), 0)
        if cash_to_rival > self._spendable(bot):
            return []
        valuation = self.evaluate(
            bot.user_id,
            rival.user_id,
            offered_cash=cash_to_rival,
            requested_cash=cash_to_bot,
            offered_property_ids=offered_property_ids,
            requested_property_ids=requested_property_ids,
        )
        if not self.clears_bar(bot, rival, valuation, as_recipient=False, jitter=False):
            return []
        if not self.clears_bar(rival, bot, valuation, as_recipient=True, jitter=False):
            return []
        if self._was_refused(
            bot,
            rival,
            offered_property_ids,
            requested_property_ids,
            valuation.recipient_gain,
        ):
            return []
        profile = profile_for(bot)
        score = (
            valuation.proposer_surplus * (100 - profile.fairness)
            + valuation.joint_surplus * profile.fairness
        ) // 100
        if score <= 0:
            return []
        return [
            TradeCandidate(
                command=ProposeTradeCommand(
                    action="propose_trade",
                    recipient_id=rival.user_id,
                    offered_cash=cash_to_rival,
                    requested_cash=cash_to_bot,
                    offered_property_ids=list(offered_property_ids),
                    requested_property_ids=list(requested_property_ids),
                ),
                reason=reason,
                valuation=valuation,
                score=score,
            )
        ]

    # ------------------------------------------------------------- internals

    def _strategic_cost(
        self,
        player: PlayerState,
        deal: TradeValuation,
        *,
        as_recipient: bool,
    ) -> int:
        """Cost plus the share of the counterpart's *synergy* the bot resents.

        Only the value the other side gains above the plain board price counts:
        selling a loose property is ordinary business, handing over the piece
        that closes their group is not.
        """
        profile = profile_for(player)
        if as_recipient:
            cost = deal.recipient_cost
            counterpart_synergy = (
                deal.proposer_property_gain - deal.proposer_incoming_anchor
            )
        else:
            cost = deal.proposer_cost
            counterpart_synergy = (
                deal.recipient_property_gain - deal.recipient_incoming_anchor
            )
        return cost + max(counterpart_synergy, 0) * profile.blocking_appetite // 100

    def _build_counter(
        self,
        bot: PlayerState,
        proposer: PlayerState,
        trade: TradeOffer,
        valuation: TradeValuation,
    ) -> ProposeTradeCommand | None:
        profile = profile_for(bot)
        if (
            profile.sociability < 50
            or self._already_countered(bot, trade)
            or self._negotiation_rounds(bot.user_id, trade.proposer_id)
            >= MAX_NEGOTIATION_ROUNDS
            # Countering is an answer, not an idea: once the bot has played a
            # turn the refusal is history and it negotiates from scratch.
            or self._turns_since_refusal(trade, bot.user_id) > 0
        ):
            return None
        cost = self._strategic_cost(bot, valuation, as_recipient=True)
        threshold = self.threshold_percent(bot, proposer)
        target = cost * threshold // 100
        if valuation.recipient_gain * 100 < target * (100 - COUNTER_WINDOW_PERCENT):
            return None
        extra = (target - valuation.recipient_gain) * COUNTER_MARGIN_PERCENT // 100
        if extra <= 0:
            return None
        # The counter mirrors the original deal: the bot keeps the same swap but
        # asks the proposer to close the gap in cash.
        requested_cash = trade.offered_cash + extra
        if requested_cash > self._spendable(proposer):
            return None
        mirrored = ProposeTradeCommand(
            action="propose_trade",
            recipient_id=trade.proposer_id,
            offered_cash=0,
            requested_cash=requested_cash,
            offered_property_ids=list(trade.requested_property_ids),
            requested_property_ids=list(trade.offered_property_ids),
        )
        counter_valuation = self.evaluate(
            bot.user_id,
            trade.proposer_id,
            offered_cash=0,
            requested_cash=requested_cash,
            offered_property_ids=mirrored.offered_property_ids,
            requested_property_ids=mirrored.requested_property_ids,
        )
        # The counter only has to be good for the bot. Whether the other side
        # takes it is their call: that is what makes it a negotiation.
        if not self.clears_bar(bot, proposer, counter_valuation, as_recipient=False):
            return None
        return mirrored

    def _acceptance_reason(
        self,
        bot: PlayerState,
        trade: TradeOffer,
        valuation: TradeValuation,
    ) -> str:
        if any(
            self.completes_group(bot.user_id, tile)
            for property_id in trade.offered_property_ids
            if (tile := self._tiles.get(property_id)) is not None
        ):
            return "accept_completes_group"
        if trade.offered_cash > 0 and bot.balance < self.liquidity_floor(bot):
            return "accept_needed_cash"
        if valuation.recipient_surplus > 0:
            return "accept_good_value"
        return "accept_fair_deal"

    def _refusal_reason(self, valuation: TradeValuation) -> str:
        if valuation.recipient_property_loss > 0 and valuation.recipient_gain <= 0:
            return "reject_nothing_in_return"
        if valuation.proposer_property_gain > valuation.recipient_gain:
            return "reject_favours_proposer"
        return "reject_below_value"

    def _hands_over_a_monopoly(self, trade: TradeOffer) -> bool:
        """The deal would hand the proposer the piece completing one of its groups."""
        return any(
            self.completes_group(trade.proposer_id, tile)
            for property_id in trade.requested_property_ids
            if (tile := self._tiles.get(property_id)) is not None
        )

    def completes_group(self, player_id: UUID, tile: TileDefinition) -> bool:
        """``tile`` is the last piece ``player_id`` needs for its group or kind."""
        if tile.kind is not TileKind.PROPERTY or tile.group is None:
            peers = self._kinds.get(tile.kind, [])
            return len(peers) > 1 and all(
                item.id == tile.id or self._game.owners.get(item.id) == player_id
                for item in peers
            )
        group = self._groups.get(tile.group, [tile])
        return len(group) > 1 and all(
            item.id == tile.id or self._game.owners.get(item.id) == player_id
            for item in group
        )

    def _wanted_from(
        self,
        bot: PlayerState,
        rival: PlayerState,
    ) -> list[TileDefinition]:
        wanted = []
        for tile in self._tradable_of(rival.user_id):
            gain = self.marginal_value(bot.user_id, [tile.id])
            if gain > self._anchor(tile):
                wanted.append((gain, tile))
        wanted.sort(key=lambda item: (-item[0], item[1].id))
        return [tile for _, tile in wanted[:MAX_WANTED_TARGETS]]

    def _spares_of(
        self,
        bot: PlayerState,
        rival: PlayerState,
    ) -> list[TileDefinition]:
        """Own properties the rival wants and the bot barely misses."""
        spares = []
        for tile in self._tradable_of(bot.user_id):
            loss = self.separation_cost(bot.user_id, [tile.id])
            if loss > self._anchor(tile) * SWEETENING_PERCENT // 100:
                continue
            appetite = self.marginal_value(rival.user_id, [tile.id])
            if appetite <= 0:
                continue
            spares.append((appetite - loss, tile))
        spares.sort(key=lambda item: (-item[0], item[1].id))
        return [tile for _, tile in spares[:MAX_SPARES_CONSIDERED]]

    def _tradable_of(self, player_id: UUID) -> list[TileDefinition]:
        return [
            tile
            for tile in self._pack.board.tiles
            if self._game.owners.get(tile.id) == player_id
            and self._game.building_levels.get(tile.id, 0) == 0
            and tile.id not in self._game.trade_unavailable_property_ids
        ]

    def _tradable_rivals(self, bot: PlayerState) -> list[PlayerState]:
        return [
            player
            for player in self._game.players
            if player.user_id != bot.user_id and not player.bankrupt
        ]

    def _spendable(self, player: PlayerState) -> int:
        return max(player.balance - self.liquidity_floor(player) // 2, 0)

    def _was_refused(
        self,
        bot: PlayerState,
        rival: PlayerState,
        offered_property_ids: list[str],
        requested_property_ids: list[str],
        recipient_gain: int,
    ) -> bool:
        """Insist only after ``patience`` turns or with a sweeter offer."""
        signature = (frozenset(offered_property_ids), frozenset(requested_property_ids))
        profile = profile_for(bot)
        for trade in self._game.trades:
            if (
                trade.status is not TradeStatus.REJECTED
                or trade.proposer_id != bot.user_id
                or trade.recipient_id != rival.user_id
            ):
                continue
            if (
                frozenset(trade.offered_property_ids),
                frozenset(trade.requested_property_ids),
            ) != signature:
                continue
            if self._turns_since_refusal(trade, bot.user_id) >= profile.patience:
                continue
            previous = self.evaluate(
                trade.proposer_id,
                trade.recipient_id,
                offered_cash=trade.offered_cash,
                requested_cash=trade.requested_cash,
                offered_property_ids=trade.offered_property_ids,
                requested_property_ids=trade.requested_property_ids,
            )
            if recipient_gain * 100 < previous.recipient_gain * SWEETENING_PERCENT:
                return True
        return False

    def _negotiation_rounds(self, player_id: UUID, other_id: UUID) -> int:
        """Offers exchanged with ``other_id`` since the last deal actually closed.

        Bounds the haggling: without it two bots can counter each other forever
        and the turn never advances.
        """
        pair = {player_id, other_id}
        rounds = 0
        for trade in self._game.trades:
            if {trade.proposer_id, trade.recipient_id} != pair:
                continue
            if trade.status is TradeStatus.ACCEPTED:
                rounds = 0
                continue
            rounds += 1
        return rounds

    def _already_countered(self, bot: PlayerState, trade: TradeOffer) -> bool:
        return any(
            other.proposer_id == bot.user_id
            and other.recipient_id == trade.proposer_id
            and other.created_at >= trade.created_at
            for other in self._game.trades
        )

    def _refused_a_fair_deal(self, player_id: UUID, counterpart_id: UUID) -> bool:
        for trade in self._game.trades:
            if (
                trade.status is not TradeStatus.REJECTED
                or trade.proposer_id != player_id
                or trade.recipient_id != counterpart_id
            ):
                continue
            valuation = self.evaluate(
                trade.proposer_id,
                trade.recipient_id,
                offered_cash=trade.offered_cash,
                requested_cash=trade.requested_cash,
                offered_property_ids=trade.offered_property_ids,
                requested_property_ids=trade.requested_property_ids,
            )
            if valuation.recipient_surplus > 0:
                return True
        return False

    def _turns_since_refusal(self, trade: TradeOffer, player_id: UUID) -> int:
        refusal_sequence = next(
            (
                event.sequence
                for event in reversed(self._game.events)
                if event.type == "trade.rejected"
                and event.data.get("trade_id") == str(trade.id)
            ),
            None,
        )
        if refusal_sequence is None:
            return 0
        return sum(
            event.sequence > refusal_sequence
            and event.type == "turn.started"
            and event.data.get("player_id") == str(player_id)
            for event in self._game.events
        )

    def _anchor_total(self, property_ids: list[str]) -> int:
        return sum(
            self._anchor(tile)
            for property_id in property_ids
            if (tile := self._tiles.get(property_id)) is not None
        )

    def _anchor(self, tile: TileDefinition) -> int:
        return max(
            tile.price or 0,
            (tile.mortgage_value or 0) * 2,
            (tile.base_rent or 0) * RENT_ANCHOR_MULTIPLIER,
            1,
        )

    def _player(self, player_id: UUID) -> PlayerState | None:
        return next(
            (player for player in self._game.players if player.user_id == player_id),
            None,
        )

    def _mood(self, player_id: UUID) -> int:
        """Reproducible jitter so identical personalities still differ."""
        seed = f"{self._game.id}:{player_id}:{self._game.event_sequence}".encode()
        digest = hashlib.blake2s(seed, digest_size=2).digest()
        return int.from_bytes(digest, "big") % MOOD_SPREAD - MOOD_SPREAD // 2
