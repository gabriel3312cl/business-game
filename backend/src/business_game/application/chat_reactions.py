"""What a bot says when a player's move lands on it.

Reactions are *focused*: a bot speaks only when the event actually touches it —
somebody took the property that closed its group, it won an auction it wanted, a
rival is bleeding cash. Everything else passes in silence, because a table with
four bots commenting every purchase buries the players' own messages.

Two guards keep it quiet: at most one reaction per batch of new events (the
highest-priority one), and a per-bot cooldown measured in event sequences.

Reaction text never carries a player's real name, only property names and
amounts. Published bodies feed back into the AI prompt as conversation history,
so keeping names out here preserves the alias-only invariant of
:mod:`business_game.application.chat_ai`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from business_game.application.negotiation import NegotiationEngine
from business_game.domain.models import (
    BotPersonality,
    ContentPack,
    GameEvent,
    GameState,
    GameStatus,
    PlayerState,
)

REACTION_COOLDOWN_EVENTS = 6
RENT_NOTICE_DIVISOR = 20

# Most specific first: only the top-priority reaction of a batch is published.
REACTION_PRIORITY = (
    "stolen_group_key",
    "rival_bankrupt",
    "paid_me_rent",
    "lost_auction",
    "rival_bad_card",
    "rival_jailed",
    "rival_distress",
    "rival_prize",
)

REACTION_TEXT: dict[str, dict[str, str]] = {
    "stolen_group_key": {
        "aggressive": "Te llevaste {property}. Esa la necesitaba yo, y lo vas a notar.",
        "conservative": "Ahí se me fue {property}. Tendré que replantear mi grupo.",
        "balanced": "{property} me cerraba el grupo. Mala suerte para mí.",
        "negotiator": "Justo {property} me cerraba el grupo. ¿La conversamos?",
    },
    "lost_auction": {
        "aggressive": "Te quedaste con {property}, pero pagaste de más.",
        "conservative": "A ${amount} no la quería. Toda tuya.",
        "balanced": "Bien jugado con {property}; me pasé del precio que tenía en mente.",
        "negotiator": "Perdí {property} por poco. Hablemos si algún día la sueltas.",
    },
    "paid_me_rent": {
        "aggressive": "${amount} por caer en {property}. Sigue viniendo.",
        "conservative": "Gracias por los ${amount}; eso me deja tranquilo un rato.",
        "balanced": "${amount} de renta en {property}. Así se financia el tablero.",
        "negotiator": "${amount} menos para ti. ¿Cambiamos algo antes de la próxima vuelta?",
    },
    "rival_prize": {
        "aggressive": "Disfruta esos ${amount}, no te van a durar.",
        "conservative": "Buen momento para guardar esos ${amount}.",
        "balanced": "${amount} de regalo. Nada mal.",
        "negotiator": "Con ${amount} frescos, ahora sí podemos hablar de negocios.",
    },
    "rival_bad_card": {
        "aggressive": "Esa carta te costó caro. Me encanta.",
        "conservative": "Por eso guardo efectivo. Suerte con eso.",
        "balanced": "Mala carta. Le pasa a todos.",
        "negotiator": "Si esa carta te apretó la caja, tengo algo que te puede convenir.",
    },
    "rival_jailed": {
        "aggressive": "A detención. Un turno menos de estorbo.",
        "conservative": "Detención. Al menos ahí no gastas.",
        "balanced": "Detención. Se te corta el ritmo.",
        "negotiator": "Mientras estés detenido, aprovechemos de cerrar un trato.",
    },
    "rival_distress": {
        "aggressive": "Vendiendo para juntar caja. Estás contra las cuerdas.",
        "conservative": "Deshacerte de activos sale caro. Cuida la caja.",
        "balanced": "Te veo juntando efectivo a la fuerza.",
        "negotiator": "Si necesitas caja, te compro algo y quedamos los dos mejor.",
    },
    "rival_bankrupt": {
        "aggressive": "Uno menos. Sigo yo.",
        "conservative": "Se acabó por falta de caja. Siempre es lo mismo.",
        "balanced": "Quiebra. Se puso más corto el tablero.",
        "negotiator": "Lástima, contigo se podía negociar.",
    },
}


@dataclass(frozen=True)
class BotReaction:
    bot: PlayerState
    code: str
    actor_id: UUID | None = None
    params: dict[str, str | int] = field(default_factory=dict)

    @property
    def template_key(self) -> str:
        personality = (
            self.bot.bot_personality.value
            if self.bot.bot_personality is not None
            else BotPersonality.BALANCED.value
        )
        return f"reaction.{self.code}.{personality}"

    @property
    def body(self) -> str:
        personality = (
            self.bot.bot_personality.value
            if self.bot.bot_personality is not None
            else BotPersonality.BALANCED.value
        )
        text = REACTION_TEXT[self.code][personality]
        for name, value in self.params.items():
            text = text.replace(f"{{{name}}}", str(value))
        return text

    def describe(self) -> str:
        """Neutral summary handed to an AI bot so it can word its own reaction."""
        detail = ", ".join(f"{name}={value}" for name, value in self.params.items())
        return f"{self.code}({detail})" if detail else self.code


def detect_reaction(
    game: GameState,
    pack: ContentPack,
    events: list[GameEvent],
    *,
    last_spoken: dict[UUID, int] | None = None,
) -> BotReaction | None:
    """The one thing worth saying about this batch of events, if anything."""
    if game.status is not GameStatus.PLAYING or not events:
        return None
    bots = [player for player in game.players if player.is_bot and not player.bankrupt]
    if not bots:
        return None

    engine = NegotiationEngine(game, pack)
    spoken = last_spoken or {}
    latest = events[-1].sequence
    available = [
        bot
        for bot in bots
        if latest - spoken.get(bot.user_id, -REACTION_COOLDOWN_EVENTS)
        >= REACTION_COOLDOWN_EVENTS
    ]
    if not available:
        return None

    found: dict[str, BotReaction] = {}
    for event in events:
        for reaction in _reactions_for(game, pack, engine, available, event):
            found.setdefault(reaction.code, reaction)
    for code in REACTION_PRIORITY:
        if code in found:
            return found[code]
    return None


def _reactions_for(
    game: GameState,
    pack: ContentPack,
    engine: NegotiationEngine,
    bots: list[PlayerState],
    event: GameEvent,
) -> list[BotReaction]:
    actor = _member(event, "player_id")

    if event.type == "property.purchased":
        # `property.purchased` carries `tile_id`, not `property_id`.
        tile_id = _text(event, "tile_id")
        return _group_key_lost(game, pack, engine, bots, actor, tile_id)

    if event.type == "auction.completed":
        winner = _member(event, "winner_id")
        tile_id = _text(event, "property_id")
        if winner is None or tile_id is None:
            return []
        stolen = _group_key_lost(game, pack, engine, bots, winner, tile_id)
        if stolen:
            return stolen
        return [
            BotReaction(
                bot=bot,
                code="lost_auction",
                actor_id=winner,
                params={
                    "property": _tile_name(pack, tile_id),
                    "amount": _number(event, "amount") or 0,
                },
            )
            for bot in bots
            if bot.user_id != winner and _bid_in_auction(game, event, bot.user_id)
        ]

    if event.type == "payment.completed":
        creditor = _member(event, "creditor_id")
        debtor = _member(event, "debtor_id")
        amount = _number(event, "amount") or 0
        threshold = max(pack.manifest.starting_balance // RENT_NOTICE_DIVISOR, 1)
        if creditor is None or debtor == creditor or amount < threshold:
            return []
        tile_id = _text(event, "tile_id")
        return [
            BotReaction(
                bot=bot,
                code="paid_me_rent",
                actor_id=debtor,
                params={
                    "amount": amount,
                    "property": _tile_name(pack, tile_id) if tile_id else "",
                },
            )
            for bot in bots
            if bot.user_id == creditor
        ]

    if event.type == "player.bankrupt":
        return _rotating(bots, event, "rival_bankrupt", actor)

    if event.type == "jail.entered":
        return _rotating(bots, event, "rival_jailed", actor)

    if event.type in {"property.mortgaged", "building.sold"}:
        return _rotating(bots, event, "rival_distress", actor)

    if event.type == "card.repairs_assessed":
        return _rotating(bots, event, "rival_bad_card", actor)

    if event.type == "card.cash_applied":
        amount = _number(event, "amount") or 0
        if amount == 0:
            return []
        code = "rival_prize" if amount > 0 else "rival_bad_card"
        return _rotating(bots, event, code, actor, params={"amount": abs(amount)})

    if event.type == "free_parking.collected":
        return _rotating(
            bots,
            event,
            "rival_prize",
            actor,
            params={"amount": _number(event, "amount") or 0},
        )

    return []


def _group_key_lost(
    game: GameState,
    pack: ContentPack,
    engine: NegotiationEngine,
    bots: list[PlayerState],
    buyer: UUID | None,
    tile_id: str | None,
) -> list[BotReaction]:
    """Bots whose group that property would have closed.

    ``completes_group`` ignores who currently holds the tile, so this reads the
    same before and after the sale.
    """
    if buyer is None or tile_id is None:
        return []
    tile = next((item for item in pack.board.tiles if item.id == tile_id), None)
    if tile is None:
        return []
    return [
        BotReaction(
            bot=bot,
            code="stolen_group_key",
            actor_id=buyer,
            params={"property": _tile_name(pack, tile_id)},
        )
        for bot in bots
        if bot.user_id != buyer
        and game.owners.get(tile_id) != bot.user_id
        and engine.completes_group(bot.user_id, tile)
    ]


def _rotating(
    bots: list[PlayerState],
    event: GameEvent,
    code: str,
    actor: UUID | None,
    *,
    params: dict[str, str | int] | None = None,
) -> list[BotReaction]:
    """For events that concern nobody in particular, let the bots take turns."""
    eligible = sorted(
        (bot for bot in bots if bot.user_id != actor),
        key=lambda bot: bot.user_id.hex,
    )
    if not eligible:
        return []
    chosen = eligible[event.sequence % len(eligible)]
    return [
        BotReaction(bot=chosen, code=code, actor_id=actor, params=params or {})
    ]


def _bid_in_auction(game: GameState, event: GameEvent, bot_id: UUID) -> bool:
    """Did this bot actually bid before the auction closed?

    Filtered by ``sequence`` rather than sliced by index: today sequence and index
    line up, but that is an invariant of ``_append_event`` in another module, and
    the trade list already shows the project is willing to prune history.
    """
    tile_id = _text(event, "property_id")
    earlier = [item for item in game.events if item.sequence < event.sequence]
    for past in reversed(earlier):
        if past.type == "auction.started" and _text(past, "property_id") == tile_id:
            return False
        if (
            past.type == "auction.bid_placed"
            and _text(past, "property_id") == tile_id
            and _member(past, "player_id") == bot_id
        ):
            return True
    return False


def _tile_name(pack: ContentPack, tile_id: str) -> str:
    tile = next((item for item in pack.board.tiles if item.id == tile_id), None)
    return pack.messages.get(tile.name_key, tile.id) if tile is not None else tile_id


def _text(event: GameEvent, key: str) -> str | None:
    value = event.data.get(key)
    return value if isinstance(value, str) else None


def _number(event: GameEvent, key: str) -> int | None:
    value = event.data.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _member(event: GameEvent, key: str) -> UUID | None:
    raw = _text(event, key)
    if raw is None:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None
