"""In-game chat: player messages, and the words bots put to their decisions.

Reading direction matters here. The chat *narrates* the negotiation engine, it
never feeds it: every call into :class:`NegotiationEngine` below is read-only and
its result is turned into text. No chat content reaches
``negotiation.py``, so two runs over the same snapshot still reach the same
decision — the property the bot runner relies on through ``expected_sequence``.
"""

from __future__ import annotations

import asyncio
import logging
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass, field
from time import monotonic
from uuid import UUID

from business_game.application.negotiation import (
    NegotiationEngine,
    TradeVerdict,
    profile_for,
)
from business_game.domain.chat_models import (
    CHAT_MAX_AUTHOR_NAME_CHARS,
    ChatMessage,
)
from business_game.domain.errors import ConflictError, ForbiddenError
from business_game.domain.models import (
    BotPersonality,
    ContentPack,
    GameEvent,
    GameState,
    PlayerState,
    TileDefinition,
    TradeOffer,
    TradeStatus,
)
from business_game.infrastructure.chat_repository import ChatRepository

logger = logging.getLogger(__name__)

MAX_ADDRESSED_BOTS = 1

# First-person wording for the motives `negotiation.py` already emits. The
# activity feed states them in the third person; in the chat the bot speaks.
REASON_TEXT: dict[str, str] = {
    "accept_completes_group": "Acepto: me completa un grupo.",
    "accept_needed_cash": "Acepto: necesitaba la caja.",
    "accept_good_value": "Acepto: el valor me conviene.",
    "accept_fair_deal": "Acepto: me parece un trato parejo.",
    "reject_below_value": "No: recibo menos de lo que entrego.",
    "reject_liquidity_risk": "No: me dejaría sin caja para las rentas.",
    "reject_completes_rival_group": (
        "No entrego esa propiedad: te completa el grupo."
    ),
    "reject_nothing_in_return": "No: no recibo nada a cambio.",
    "reject_favours_proposer": "No: te favorece demasiado.",
    "reject_unknown_proposer": "No reconozco a quien propone.",
    "counter_rebalanced": "Está cerca. Te contraoferto.",
    "propose_win_win_swap": "Te propongo un cambio que nos completa grupos a ambos.",
    "propose_swap_for_group": "Te propongo un cambio para cerrar mi grupo.",
    "propose_cash_for_group": "Te pago por cerrar mi grupo.",
    "propose_sell_spare_for_cash": "Vendo lo que no uso para hacer caja.",
    "cancel_stale_trade": "Retiro mi oferta: quedó sin respuesta.",
    "safeguard_reject_trade": "Retiro eso: la oferta ya no era válida.",
    "chat_propose_trade": "Te dejo una oferta concreta.",
    "ai_accept_trade": "Acepto.",
    "ai_reject_trade": "Paso.",
    "ai_propose_trade": "Te propongo un trato.",
}

REPLY_TEXT: dict[str, str] = {
    "incoming_accept": "Tu oferta me sirve: la voy a aceptar.",
    "incoming_counter": "Está cerca, pero no así. Te voy a contraofertar.",
    "incoming_reject_liquidity": "No puedo: ese efectivo me deja sin caja para las rentas.",
    "incoming_reject_group": "No suelto {property}: con eso cierras tu grupo.",
    "incoming_reject_value": "Recibo menos de lo que entrego. Sube la oferta.",
    "awaiting_answer": "Mi oferta sigue en pie. Dime si la tomas.",
    "wants_property": "Me interesa {property}. ¿Qué pides por ella?",
    "idle_conservative": "Por ahora cuido la caja. Si tienes algo parejo, escúchame.",
    "idle_balanced": "Nada urgente por mi lado. Propón algo y lo evalúo.",
    "idle_aggressive": "Si no traes un grupo completo, no me interesa.",
    "idle_negotiator": "Siempre hay trato posible. ¿Qué tienes en mente?",
}

REJECTION_REPLY_KEYS: dict[str, str] = {
    "reject_liquidity_risk": "incoming_reject_liquidity",
    "reject_completes_rival_group": "incoming_reject_group",
}


@dataclass(frozen=True)
class ChatTemplate:
    """A localizable bot line: the key clients translate, plus its es fallback."""

    key: str
    body: str
    params: dict[str, str | int] = field(default_factory=dict)


class ChatRateLimitError(ConflictError):
    """Raised when a user outruns the per-minute allowance."""


class ChatRateLimiter:
    """Per-user sliding window, mirroring the advisor limiter."""

    def __init__(self, messages_per_minute: int) -> None:
        self._limit = messages_per_minute
        self._messages: dict[UUID, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def require_capacity(self, user_id: UUID) -> None:
        now = monotonic()
        cutoff = now - 60
        async with self._lock:
            timestamps = self._messages[user_id]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self._limit:
                raise ChatRateLimitError("too many chat messages; slow down")
            timestamps.append(now)


class GameChatService:
    def __init__(
        self,
        repository: ChatRepository,
        *,
        history_limit: int,
    ) -> None:
        self._repository = repository
        self._history_limit = history_limit

    async def history(
        self,
        game_id: UUID,
        *,
        limit: int,
        before_id: int | None = None,
    ) -> tuple[list[ChatMessage], bool]:
        return await self._repository.list_messages(
            game_id,
            limit=limit,
            before_id=before_id,
        )

    async def publish_player_message(
        self,
        game: GameState,
        author_id: UUID,
        body: str,
    ) -> ChatMessage:
        author_name = _member_name(game, author_id)
        if author_name is None:
            raise ForbiddenError("only members of this game can use the chat")
        return await self._append(
            game_id=game.id,
            author_id=author_id,
            author_name=author_name,
            author_kind="player",
            body=body,
        )

    async def publish_bot_message(
        self,
        game: GameState,
        bot: PlayerState,
        *,
        body: str,
        template: ChatTemplate | None = None,
    ) -> ChatMessage:
        return await self._append(
            game_id=game.id,
            author_id=bot.user_id,
            author_name=bot.display_name,
            author_kind="bot",
            body=body,
            template=template,
        )

    async def announce_bot_decisions(
        self,
        game: GameState,
        previous_sequence: int,
    ) -> list[ChatMessage]:
        """Turn the motives on fresh ``trade.*`` events into bot chat lines.

        Deliberately template-only and synchronous: it is one insert per event,
        so the bot runner keeps its cadence and messages stay in order. Nothing
        here calls a model.
        """
        published: list[ChatMessage] = []
        for event in game.events[previous_sequence:]:
            spoken = self._decision_message(game, event)
            if spoken is None:
                continue
            bot, template = spoken
            published.append(
                await self.publish_bot_message(
                    game,
                    bot,
                    body=template.body,
                    template=template if template.key else None,
                )
            )
        return published

    @staticmethod
    def _decision_message(
        game: GameState,
        event: GameEvent,
    ) -> tuple[PlayerState, ChatTemplate] | None:
        if not event.type.startswith("trade."):
            return None
        reason = event.data.get("bot_reason")
        if not isinstance(reason, str):
            return None
        actor_key = "proposer_id" if event.type == "trade.proposed" else "actor_id"
        raw_actor = event.data.get(actor_key)
        if not isinstance(raw_actor, str):
            return None
        try:
            actor_id = UUID(raw_actor)
        except ValueError:
            return None
        bot = next(
            (
                player
                for player in game.players
                if player.user_id == actor_id and player.is_bot
            ),
            None,
        )
        if bot is None:
            return None
        note = event.data.get("bot_note")
        if isinstance(note, str) and note.strip():
            # An AI bot wrote its own words: they travel as free plain text.
            return bot, ChatTemplate(key="", body=note.strip())
        fallback = REASON_TEXT.get(reason)
        if fallback is None:
            return None
        return bot, ChatTemplate(key=f"reason.{reason}", body=fallback)

    async def _append(
        self,
        *,
        game_id: UUID,
        author_id: UUID | None,
        author_name: str,
        author_kind: str,
        body: str,
        template: ChatTemplate | None = None,
    ) -> ChatMessage:
        message = await self._repository.append(
            game_id=game_id,
            author_id=author_id,
            author_name=author_name[:CHAT_MAX_AUTHOR_NAME_CHARS],
            author_kind=author_kind,  # type: ignore[arg-type]
            body=body,
            template_key=template.key if template else None,
            template_params=dict(template.params) if template else None,
        )
        await self._repository.prune(game_id, keep=self._history_limit)
        return message


def _member_name(game: GameState, member_id: UUID) -> str | None:
    for player in game.players:
        if player.user_id == member_id:
            return player.display_name
    for spectator in game.spectators:
        if spectator.user_id == member_id:
            return spectator.display_name
    return None


# ------------------------------------------------------------ addressing bots


def _fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return stripped.casefold()


def select_addressed_bots(game: GameState, body: str) -> list[PlayerState]:
    """Bots a message is aimed at: ``@name``, the name itself, or the lone bot.

    Keeping this explicit stops one player message from waking every bot in the
    room at once.
    """
    folded = _fold(body)
    bots = [
        player
        for player in game.players
        if player.is_bot and not player.bankrupt
    ]
    addressed = [
        bot
        for bot in bots
        if _fold(bot.display_name) in folded
        or f"@{_fold(bot.display_name).replace(' ', '')}" in folded.replace(" ", "")
    ]
    if not addressed and len(bots) == 1 and ("bot" in folded or "@" in folded):
        addressed = bots
    return addressed[:MAX_ADDRESSED_BOTS]


# ------------------------------------------------------- scripted bot replies


def build_template_reply(
    game: GameState,
    pack: ContentPack,
    bot: PlayerState,
    counterpart_id: UUID,
) -> ChatTemplate:
    """What a scripted bot answers, from its personality and the deal on the table.

    ``assess_incoming`` is consulted only to describe the answer the engine would
    already give; the verdict is not stored and not acted on here.
    """
    engine = NegotiationEngine(game, pack)
    incoming = _pending_trade(game, proposer_id=counterpart_id, recipient_id=bot.user_id)
    if incoming is not None:
        return _incoming_reply(engine, pack, bot, incoming)

    outgoing = _pending_trade(game, proposer_id=bot.user_id, recipient_id=counterpart_id)
    if outgoing is not None:
        return _template("awaiting_answer")

    wanted = _wanted_property_name(game, pack, engine, bot, counterpart_id)
    if wanted is not None:
        return _template("wants_property", {"property": wanted})

    personality = bot.bot_personality or BotPersonality.BALANCED
    return _template(f"idle_{personality.value}")


def _incoming_reply(
    engine: NegotiationEngine,
    pack: ContentPack,
    bot: PlayerState,
    trade: TradeOffer,
) -> ChatTemplate:
    assessment = engine.assess_incoming(bot, trade)
    if assessment.verdict is TradeVerdict.ACCEPT:
        return _template("incoming_accept")
    if assessment.verdict is TradeVerdict.COUNTER:
        return _template("incoming_counter")
    key = REJECTION_REPLY_KEYS.get(assessment.reason, "incoming_reject_value")
    if key != "incoming_reject_group":
        return _template(key)
    blocking = next(
        (
            _tile_name(pack, property_id)
            for property_id in trade.requested_property_ids
            if (tile := _tile(pack, property_id)) is not None
            and engine.completes_group(trade.proposer_id, tile)
        ),
        None,
    )
    if blocking is None:
        return _template("incoming_reject_value")
    return _template(key, {"property": blocking})


def _template(key: str, params: dict[str, str | int] | None = None) -> ChatTemplate:
    body = REPLY_TEXT[key]
    resolved = params or {}
    for name, value in resolved.items():
        body = body.replace(f"{{{name}}}", str(value))
    return ChatTemplate(key=f"reply.{key}", body=body, params=resolved)


def _pending_trade(
    game: GameState,
    *,
    proposer_id: UUID,
    recipient_id: UUID,
) -> TradeOffer | None:
    return next(
        (
            trade
            for trade in reversed(game.trades)
            if trade.status is TradeStatus.PENDING
            and trade.proposer_id == proposer_id
            and trade.recipient_id == recipient_id
        ),
        None,
    )


def _wanted_property_name(
    game: GameState,
    pack: ContentPack,
    engine: NegotiationEngine,
    bot: PlayerState,
    owner_id: UUID,
) -> str | None:
    """A property held by ``owner_id`` that would close one of the bot's groups."""
    profile = profile_for(bot)
    if profile.sociability < 40:
        return None
    for tile in pack.board.tiles:
        if game.owners.get(tile.id) != owner_id:
            continue
        if engine.completes_group(bot.user_id, tile):
            return _tile_name(pack, tile.id)
    return None


def _tile(pack: ContentPack, tile_id: str) -> TileDefinition | None:
    return next((tile for tile in pack.board.tiles if tile.id == tile_id), None)


def _tile_name(pack: ContentPack, tile_id: str) -> str:
    tile = _tile(pack, tile_id)
    return pack.messages.get(tile.name_key, tile.id) if tile is not None else tile_id
