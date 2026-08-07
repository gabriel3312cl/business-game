from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from business_game.application.negotiation import NegotiationEngine
from business_game.domain.models import ContentPack, GameEvent, GameState, TradeOffer

MIN_RELATIONSHIP_SCORE = -100
MAX_RELATIONSHIP_SCORE = 100


@dataclass(frozen=True)
class RelationshipChange:
    bot_id: UUID
    player_id: UUID
    delta: int
    reason: str


def relationship_score(game: GameState, bot_id: UUID, player_id: UUID) -> int:
    relationship = next(
        (
            item
            for item in game.bot_relationships
            if item.bot_id == bot_id and item.player_id == player_id
        ),
        None,
    )
    return relationship.score if relationship is not None else 0


def relationship_changes_for_events(
    game: GameState,
    pack: ContentPack,
    events: list[GameEvent],
) -> list[RelationshipChange]:
    changes: list[RelationshipChange] = []
    engine = NegotiationEngine(game, pack)
    for event in events:
        if event.type.startswith("trade."):
            trade = _trade_for_event(game, event)
            if trade is not None:
                pair = _bot_human_pair(game, trade.proposer_id, trade.recipient_id)
                if pair is not None:
                    delta_and_reason = {
                        "trade.accepted": (14, "trade_accepted"),
                        "trade.rejected": (-6, "trade_rejected"),
                        "trade.cancelled": (-3, "trade_cancelled"),
                        "trade.countered": (2, "counter_offer"),
                    }.get(event.type)
                    if delta_and_reason is not None:
                        changes.append(
                            RelationshipChange(*pair, *delta_and_reason)
                        )
            continue

        actor_id = _uuid(event, "player_id")
        actor = _player(game, actor_id)
        if event.type == "property.purchased" and actor is not None and not actor.is_bot:
            tile_id = _text(event, "tile_id")
            tile = next((item for item in pack.board.tiles if item.id == tile_id), None)
            if tile is None:
                continue
            for bot in game.players:
                if (
                    bot.is_bot
                    and not bot.bankrupt
                    and engine.completes_group(bot.user_id, tile)
                ):
                    changes.append(
                        RelationshipChange(
                            bot.user_id,
                            actor.user_id,
                            -10,
                            "blocked_group",
                        )
                    )
            continue

        if event.type == "auction.completed":
            winner = _player(game, _uuid(event, "winner_id"))
            property_id = _text(event, "property_id")
            if winner is None or winner.is_bot or property_id is None:
                continue
            bidders = _auction_bidders(game, event.sequence, property_id)
            for bot in game.players:
                if bot.is_bot and bot.user_id in bidders:
                    changes.append(
                        RelationshipChange(
                            bot.user_id,
                            winner.user_id,
                            -5,
                            "lost_auction",
                        )
                    )
            continue

        if event.type == "payment.completed":
            debtor = _player(game, _uuid(event, "debtor_id"))
            creditor = _player(game, _uuid(event, "creditor_id"))
            if (
                debtor is not None
                and debtor.is_bot
                and creditor is not None
                and not creditor.is_bot
            ):
                changes.append(
                    RelationshipChange(
                        debtor.user_id,
                        creditor.user_id,
                        -3,
                        "paid_rent",
                    )
                )
    return changes


def clamp_score(score: int) -> int:
    return min(MAX_RELATIONSHIP_SCORE, max(MIN_RELATIONSHIP_SCORE, score))


def _trade_for_event(game: GameState, event: GameEvent) -> TradeOffer | None:
    trade_id = _uuid(event, "trade_id")
    if trade_id is None:
        return None
    return next((trade for trade in game.trades if trade.id == trade_id), None)


def _bot_human_pair(
    game: GameState,
    first_id: UUID,
    second_id: UUID,
) -> tuple[UUID, UUID] | None:
    first = _player(game, first_id)
    second = _player(game, second_id)
    if first is None or second is None or first.is_bot == second.is_bot:
        return None
    return (
        (first.user_id, second.user_id)
        if first.is_bot
        else (second.user_id, first.user_id)
    )


def _auction_bidders(
    game: GameState,
    completed_sequence: int,
    property_id: str,
) -> set[UUID]:
    bidders: set[UUID] = set()
    for event in reversed(game.events):
        if event.sequence >= completed_sequence:
            continue
        if event.type == "auction.started" and _text(event, "property_id") == property_id:
            break
        if event.type == "auction.bid_placed" and _text(event, "property_id") == property_id:
            bidder_id = _uuid(event, "player_id")
            if bidder_id is not None:
                bidders.add(bidder_id)
    return bidders


def _player(game: GameState, player_id: UUID | None):
    if player_id is None:
        return None
    return next((player for player in game.players if player.user_id == player_id), None)


def _uuid(event: GameEvent, key: str) -> UUID | None:
    value = _text(event, key)
    if value is None:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _text(event: GameEvent, key: str) -> str | None:
    value = event.data.get(key)
    return value if isinstance(value, str) else None
