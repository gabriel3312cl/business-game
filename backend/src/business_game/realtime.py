import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

import socketio
from pydantic import TypeAdapter, ValidationError
from socketio.exceptions import ConnectionRefusedError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.api.dependencies import pack_loader
from business_game.application.ai_bots import AiBotDecisionError, AiBotPolicy
from business_game.application.bots import BotAction, BotPolicy
from business_game.application.chat import (
    ChatRateLimiter,
    ChatRateLimitError,
    ChatTemplate,
    GameChatService,
    build_template_reply,
    select_addressed_bots,
)
from business_game.application.chat_ai import BotChatResponder, BotChatUnavailableError
from business_game.application.chat_reactions import (
    BotReaction,
    detect_reaction,
)
from business_game.application.game_views import game_state_view
from business_game.application.negotiation import NegotiationEngine, TradeCandidate
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.chat_models import ChatMessage, ChatMessageCreate
from business_game.domain.errors import DomainError, UnauthorizedError
from business_game.domain.models import (
    BotController,
    ChooseCardCommand,
    ContentPack,
    ContinueCardChoiceResultCommand,
    ContinueCardCommand,
    GameCommandRequest,
    GameState,
    GameStatus,
    PlayerState,
    TradeStatus,
)
from business_game.infrastructure.chat_repository import ChatRepository
from business_game.infrastructure.database import session_factory
from business_game.infrastructure.repositories import GameRepository, UserRepository
from business_game.security import decode_access_token

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=list(settings.cors_origins),
)
command_adapter = TypeAdapter(GameCommandRequest)
logger = logging.getLogger(__name__)
auction_timer_tasks: dict[UUID, tuple[datetime, str, asyncio.Task[None]]] = {}
bot_runner_tasks: dict[UUID, asyncio.Task[None]] = {}
BOT_ACTION_DELAY_SECONDS = 0.8
BOT_CARD_SELECTION_SECONDS = 2.0
BOT_CARD_DISPLAY_SECONDS = 1.5
BOT_CARD_CHOICE_RESULT_SECONDS = 1.5
BOT_ACTIONS_PER_YIELD = 48
BOT_MAX_REPEATED_FAILURES = 3
AI_BOT_DECISION_DEADLINE_SECONDS = 9.0
AI_AUCTION_DECISION_DEADLINE_SECONDS = 2.0
AI_AUCTION_FALLBACK_BUFFER_SECONDS = 0.75
AI_BOT_MAX_CONCURRENT_DECISIONS = 4
ai_bot_decision_semaphore = asyncio.Semaphore(AI_BOT_MAX_CONCURRENT_DECISIONS)
CHAT_MAX_CONCURRENT_REPLIES = 4
chat_reply_semaphore = asyncio.Semaphore(CHAT_MAX_CONCURRENT_REPLIES)
chat_reply_tasks: set[asyncio.Task[None]] = set()
chat_replies_in_flight: set[tuple[UUID, UUID]] = set()
# Reactions are chat flavour, not game state: process-local bookkeeping is enough.
# The cursor starts at the game's current length so a restart never replays history.
chat_reaction_cursor: dict[UUID, int] = {}
chat_reaction_spoken: dict[UUID, dict[UUID, int]] = {}
chat_rate_limiter = ChatRateLimiter(settings.chat_messages_per_minute)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None) -> bool:
    try:
        token = auth["token"] if auth is not None else ""
        user_id = decode_access_token(token)
        async with session_factory() as session:
            await UserRepository(session).get(user_id)
        await sio.save_session(sid, {"token": token})
        return True
    except (KeyError, DomainError) as exc:
        raise ConnectionRefusedError(
            "authentication required",
            {"code": "AUTH_EXPIRED"},
        ) from exc


@sio.event
async def room_join(sid: str, data: dict) -> dict:
    try:
        game_id = UUID(data["game_id"])
        async with session_factory() as session:
            user_id = await _authenticated_user_id(sid, session)
            game = await GameService(session, pack_loader).get(game_id, user_id)
        sync_auction_timer(game)
        sync_bot_runner(game)
        await sio.enter_room(sid, _member_game_room(game_id, user_id))
        await sio.emit(
            "game_state",
            game_state_view(game, user_id).model_dump(mode="json"),
            to=sid,
        )
        return {"ok": True}
    except UnauthorizedError as exc:
        return {"ok": False, "code": "AUTH_EXPIRED", "error": str(exc)}
    except (KeyError, ValueError, DomainError) as exc:
        return {"ok": False, "code": "DOMAIN_ERROR", "error": str(exc)}


@sio.event
async def game_command(sid: str, data: dict) -> dict:
    try:
        game_id = UUID(data["game_id"])
        request = command_adapter.validate_python(data)
        async with session_factory() as session:
            user_id = await _authenticated_user_id(sid, session)
            game = await GameService(session, pack_loader).execute(
                game_id,
                user_id,
                request.command,
                expected_sequence=request.expected_sequence,
                command_id=request.command_id,
            )
        sync_auction_timer(game)
        await react_to_recent_events(game)
        sync_bot_runner(game)
        await broadcast_game_state(game, complete_events=False)
        return {"ok": True, "sequence": game.event_sequence}
    except UnauthorizedError as exc:
        return {"ok": False, "code": "AUTH_EXPIRED", "error": str(exc)}
    except (KeyError, ValueError, ValidationError, DomainError) as exc:
        return {"ok": False, "code": "DOMAIN_ERROR", "error": str(exc)}


@sio.event
async def chat_message(sid: str, data: dict) -> dict:
    try:
        game_id = UUID(data["game_id"])
        payload = ChatMessageCreate.model_validate({"body": data.get("body")})
        async with session_factory() as session:
            user_id = await _authenticated_user_id(sid, session)
            await chat_rate_limiter.require_capacity(user_id)
            # `get` enforces membership: only players and spectators of this room.
            game = await GameService(session, pack_loader).get(game_id, user_id)
            message = await _chat_service(session).publish_player_message(
                game,
                user_id,
                payload.body,
            )
            await session.commit()
        await deliver_chat_message(game, user_id, message)
        return {"ok": True, "message": message.model_dump(mode="json")}
    except UnauthorizedError as exc:
        return {"ok": False, "code": "AUTH_EXPIRED", "error": str(exc)}
    except ChatRateLimitError as exc:
        return {"ok": False, "code": "RATE_LIMITED", "error": str(exc)}
    except (KeyError, ValueError, ValidationError, DomainError) as exc:
        return {"ok": False, "code": "DOMAIN_ERROR", "error": str(exc)}


def _chat_service(session: AsyncSession) -> GameChatService:
    return GameChatService(
        ChatRepository(session),
        history_limit=settings.chat_history_limit,
    )


async def deliver_chat_message(
    game: GameState,
    author_id: UUID,
    message: ChatMessage,
) -> None:
    """Fan a message the caller already persisted out to the room, then to bots.

    The REST route persists with its own request-scoped session and calls this for
    the transport half, so both entry points share one delivery path.
    """
    await _emit_chat_messages(game, [message])
    _schedule_bot_chat_replies(game, author_id, message.body)


async def _emit_chat_messages(game: GameState, messages: list[ChatMessage]) -> None:
    member_ids = {
        player.user_id for player in game.players if not player.is_bot
    } | {spectator.user_id for spectator in game.spectators}
    for member_id in member_ids:
        for message in messages:
            try:
                await sio.emit(
                    "chat_message",
                    message.model_dump(mode="json"),
                    room=_member_game_room(game.id, member_id),
                )
            except Exception:
                logger.exception(
                    "chat broadcast failed for game %s member %s",
                    game.id,
                    member_id,
                )


async def _announce_bot_decisions(game: GameState, previous_sequence: int) -> None:
    """Give the motive behind each fresh bot trade event a voice in the chat.

    Runs inline in the bot runner on purpose: it is template-only and one insert
    per trade event, which keeps messages in order and stays far below
    ``BOT_ACTION_DELAY_SECONDS``. No model is called here, and a failure is
    swallowed so the turn always advances.
    """
    try:
        async with session_factory() as session:
            messages = await _chat_service(session).announce_bot_decisions(
                game,
                previous_sequence,
            )
            await session.commit()
    except Exception:
        logger.exception("bot chat announcement failed for game %s", game.id)
        return
    if messages:
        await _emit_chat_messages(game, messages)


async def react_to_recent_events(game: GameState) -> None:
    """Let one bot comment on what just happened, if anything concerns it.

    Called from every path that advances the board — player commands, the bot
    runner and the auction timer — because a purchase or a bad card comes through
    ``game_command``, not through the runner. The cursor makes the call idempotent
    no matter how many paths fire.
    """
    cursor = chat_reaction_cursor.get(game.id)
    if cursor is None:
        # First sight of this game in this process: start from now, not from turn one.
        chat_reaction_cursor[game.id] = len(game.events)
        return
    fresh = game.events[cursor:]
    chat_reaction_cursor[game.id] = len(game.events)
    if not fresh:
        return
    try:
        pack = game.pack_snapshot or pack_loader.load(
            game.pack_id,
            version=game.pack_version,
        )
        reaction = detect_reaction(
            game,
            pack,
            fresh,
            last_spoken=chat_reaction_spoken.get(game.id, {}),
        )
    except Exception:
        logger.exception("bot reaction detection failed for game %s", game.id)
        return
    if reaction is None:
        return
    chat_reaction_spoken.setdefault(game.id, {})[reaction.bot.user_id] = fresh[-1].sequence

    if reaction.bot.bot_controller is BotController.AI:
        # An AI bot words its own reaction, so it goes off the board's path.
        _schedule_bot_reaction(game, reaction)
        return
    await _publish_reaction(game, reaction, body=reaction.body, localizable=True)


async def _publish_reaction(
    game: GameState,
    reaction: BotReaction,
    *,
    body: str,
    localizable: bool,
) -> None:
    try:
        async with session_factory() as session:
            message = await _chat_service(session).publish_bot_message(
                game,
                reaction.bot,
                body=body,
                template=(
                    ChatTemplate(
                        key=reaction.template_key,
                        body=reaction.body,
                        params=reaction.params,
                    )
                    if localizable
                    else None
                ),
            )
            await session.commit()
    except Exception:
        logger.exception("bot reaction publish failed for game %s", game.id)
        return
    await _emit_chat_messages(game, [message])


def _schedule_bot_reaction(game: GameState, reaction: BotReaction) -> None:
    pending = (game.id, reaction.bot.user_id)
    if pending in chat_replies_in_flight:
        return
    chat_replies_in_flight.add(pending)
    task = asyncio.create_task(_run_bot_reaction(game.id, reaction))
    chat_reply_tasks.add(task)
    task.add_done_callback(chat_reply_tasks.discard)


async def _run_bot_reaction(game_id: UUID, reaction: BotReaction) -> None:
    try:
        await _react_as_ai_bot(game_id, reaction)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("AI bot reaction failed for game %s", game_id)
    finally:
        chat_replies_in_flight.discard((game_id, reaction.bot.user_id))


async def _react_as_ai_bot(game_id: UUID, reaction: BotReaction) -> None:
    async with session_factory() as session:
        game = await GameRepository(session).get(game_id)
        history, _ = await _chat_service(session).history(
            game_id,
            limit=settings.chat_context_messages,
        )
        locale = (
            await _member_locale(session, reaction.actor_id)
            if reaction.actor_id is not None
            else "es"
        )
    bot = next(
        (
            player
            for player in game.players
            if player.user_id == reaction.bot.user_id and not player.bankrupt
        ),
        None,
    )
    if bot is None:
        return
    pack = game.pack_snapshot or pack_loader.load(game.pack_id, version=game.pack_version)
    counterpart_id = reaction.actor_id or bot.user_id
    candidates = (
        _chat_trade_candidates(game, pack, bot, reaction.actor_id)
        if reaction.actor_id is not None
        else []
    )

    body = reaction.body
    localizable = True
    chosen_offer: TradeCandidate | None = None
    try:
        async with chat_reply_semaphore:
            reply = await asyncio.wait_for(
                _bot_chat_responder().react(
                    game,
                    pack,
                    bot,
                    counterpart_id,
                    history,
                    reaction.describe(),
                    candidates=candidates,
                    locale=locale,
                ),
                timeout=settings.chat_bot_reply_timeout_seconds,
            )
    except TimeoutError:
        logger.warning(
            "AI bot reaction timed out for game %s; using a template",
            game_id,
        )
    except BotChatUnavailableError as exc:
        logger.warning(
            "AI bot reaction unavailable for game %s; using a template: %s",
            game_id,
            exc,
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception(
            "AI bot reaction responder crashed for game %s; using a template",
            game_id,
        )
    else:
        body = reply.text
        localizable = False
        if reply.offer_index is not None:
            chosen_offer = candidates[reply.offer_index]

    await _publish_reaction(game, reaction, body=body, localizable=localizable)
    if chosen_offer is not None:
        await _propose_chat_trade(game_id, bot, chosen_offer)


def _forget_chat_reactions(game_id: UUID) -> None:
    chat_reaction_cursor.pop(game_id, None)
    chat_reaction_spoken.pop(game_id, None)


def _schedule_bot_chat_replies(game: GameState, author_id: UUID, body: str) -> None:
    """Answer as any bot the message was aimed at, off the request path.

    Detached tasks: a slow or dead provider must not delay the sender's ack, and
    must never touch the bot runner's cadence.
    """
    for bot in select_addressed_bots(game, body):
        pending = (game.id, bot.user_id)
        if pending in chat_replies_in_flight:
            # Already answering this bot: spamming it must not multiply requests.
            continue
        chat_replies_in_flight.add(pending)
        task = asyncio.create_task(_run_bot_chat_reply(game.id, bot.user_id, author_id))
        chat_reply_tasks.add(task)
        task.add_done_callback(chat_reply_tasks.discard)


async def shutdown_chat_replies() -> None:
    tasks = list(chat_reply_tasks)
    chat_reply_tasks.clear()
    chat_replies_in_flight.clear()
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def _run_bot_chat_reply(
    game_id: UUID,
    bot_id: UUID,
    counterpart_id: UUID,
) -> None:
    try:
        await _reply_as_bot(game_id, bot_id, counterpart_id)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("bot chat reply failed for game %s", game_id)
    finally:
        chat_replies_in_flight.discard((game_id, bot_id))


async def _reply_as_bot(game_id: UUID, bot_id: UUID, counterpart_id: UUID) -> None:
    async with session_factory() as session:
        game = await GameRepository(session).get(game_id)
        history, _ = await _chat_service(session).history(
            game_id,
            limit=settings.chat_context_messages,
        )
        locale = await _member_locale(session, counterpart_id)
    bot = next(
        (
            player
            for player in game.players
            if player.user_id == bot_id and player.is_bot and not player.bankrupt
        ),
        None,
    )
    if bot is None:
        return
    pack = game.pack_snapshot or pack_loader.load(game.pack_id, version=game.pack_version)

    # The scripted line is computed first and always available, so an AI failure
    # degrades to a real answer instead of silence.
    template = build_template_reply(game, pack, bot, counterpart_id)
    body = template.body
    localizable = template
    chosen_offer: TradeCandidate | None = None

    if bot.bot_controller is BotController.AI:
        candidates = _chat_trade_candidates(game, pack, bot, counterpart_id)
        try:
            async with chat_reply_semaphore:
                reply = await asyncio.wait_for(
                    _bot_chat_responder().reply(
                        game,
                        pack,
                        bot,
                        counterpart_id,
                        history,
                        candidates=candidates,
                        locale=locale,
                    ),
                    timeout=settings.chat_bot_reply_timeout_seconds,
                )
        except TimeoutError:
            logger.warning(
                "AI bot chat reply timed out for game %s; using a template",
                game_id,
            )
        except BotChatUnavailableError as exc:
            logger.warning(
                "AI bot chat reply unavailable for game %s; using a template: %s",
                game_id,
                exc,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "AI bot chat responder crashed for game %s; using a template",
                game_id,
            )
        else:
            body = reply.text
            localizable = None
            if reply.offer_index is not None:
                chosen_offer = candidates[reply.offer_index]

    async with session_factory() as session:
        message = await _chat_service(session).publish_bot_message(
            game,
            bot,
            body=body,
            template=localizable,
        )
        await session.commit()
    await _emit_chat_messages(game, [message])
    if chosen_offer is not None:
        await _propose_chat_trade(game_id, bot, chosen_offer)


async def _member_locale(session: AsyncSession, user_id: UUID) -> str:
    try:
        user = await UserRepository(session).get(user_id)
    except DomainError:
        return "es"
    return user.locale


def _chat_trade_candidates(
    game: GameState,
    pack: ContentPack,
    bot: PlayerState,
    counterpart_id: UUID,
) -> list[TradeCandidate]:
    """Deals the deterministic engine already vetted, aimed at this counterpart.

    The model picks one of these or none; it never authors a command. Returning
    an empty list simply means the conversation stays a conversation.
    """
    if not settings.chat_bot_trades_enabled:
        return []
    if game.status is not GameStatus.PLAYING or game.active_auction is not None:
        return []
    counterpart = next(
        (player for player in game.players if player.user_id == counterpart_id),
        None,
    )
    if counterpart is None or counterpart.bankrupt:
        return []
    if any(
        trade.status is TradeStatus.PENDING
        and {trade.proposer_id, trade.recipient_id} == {bot.user_id, counterpart_id}
        for trade in game.trades
    ):
        return []
    engine = NegotiationEngine(game, pack)
    return [
        candidate
        for candidate in engine.candidate_trades(bot)
        if candidate.command.recipient_id == counterpart_id
    ]


async def _propose_chat_trade(
    game_id: UUID,
    bot: PlayerState,
    candidate: TradeCandidate,
) -> None:
    """Put the chosen offer on the table.

    Deliberately without ``expected_sequence``: a chat-driven proposal must never
    invalidate the turn the bot runner is replaying. If the board moved and the
    deal no longer validates, the offer is dropped and the chat line stands on
    its own.
    """
    try:
        async with session_factory() as session:
            updated = await GameService(session, pack_loader).execute(
                game_id,
                bot.user_id,
                candidate.command,
                automation_reason="chat_propose_trade",
            )
    except DomainError as exc:
        logger.info("chat trade proposal dropped for game %s: %s", game_id, exc)
        return
    sync_auction_timer(updated)
    await broadcast_game_state(updated, complete_events=False)


def _bot_chat_responder() -> BotChatResponder:
    return BotChatResponder(
        api_key=settings.deepseek_api_key.get_secret_value(),
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        timeout_seconds=settings.chat_bot_reply_timeout_seconds,
        temperature=settings.deepseek_temperature,
    )


async def _authenticated_user_id(sid: str, session: AsyncSession) -> UUID:
    socket_session = await sio.get_session(sid)
    user_id = decode_access_token(socket_session["token"])
    async with session.begin():
        await UserRepository(session).get(user_id)
    return user_id


def sync_bot_runner(game: GameState) -> None:
    existing = bot_runner_tasks.get(game.id)
    should_run = game.status.value == "playing" and any(
        player.is_bot and not player.bankrupt for player in game.players
    )
    if not should_run:
        if existing is not None and not existing.done():
            existing.cancel()
        _forget_chat_reactions(game.id)
        return
    if existing is not None and not existing.done():
        return
    bot_runner_tasks[game.id] = asyncio.create_task(_run_bot_runner(game.id))


async def resume_bot_runners() -> None:
    async with session_factory() as session:
        games = await GameRepository(session).list_playing_with_bots()
    for game in games:
        sync_bot_runner(game)


async def shutdown_bot_runners() -> None:
    tasks = list(bot_runner_tasks.values())
    bot_runner_tasks.clear()
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def _run_bot_runner(game_id: UUID) -> None:
    task = asyncio.current_task()
    policy = BotPolicy()
    ai_policy = AiBotPolicy(
        api_key=settings.deepseek_api_key.get_secret_value(),
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        timeout_seconds=settings.deepseek_timeout_seconds,
        temperature=settings.deepseek_temperature,
    )
    failed_key: tuple[int, UUID, str] | None = None
    repeated_failures = 0
    actions_since_yield = 0
    try:
        while True:
            await asyncio.sleep(BOT_ACTION_DELAY_SECONDS)
            async with session_factory() as session:
                game = await GameRepository(session).get(game_id)
            pack = game.pack_snapshot or pack_loader.load(
                game.pack_id,
                version=game.pack_version,
            )
            try:
                action = policy.choose_action(game, pack)
            except Exception:
                logger.exception(
                    "bot policy failed for game %s; using safe fallback",
                    game_id,
                )
                action = policy.safe_fallback(game, pack)
            if action is None:
                return
            actor = next(
                (player for player in game.players if player.user_id == action.actor_id),
                None,
            )
            if isinstance(
                action.command,
                (
                    ChooseCardCommand,
                    ContinueCardCommand,
                    ContinueCardChoiceResultCommand,
                ),
            ):
                pending_draw = game.pending_card_draw
                pending_result = game.pending_card_choice_result
                if isinstance(action.command, ChooseCardCommand):
                    event_sequence = (
                        pending_draw.draw_sequence if pending_draw is not None else None
                    )
                    target_delay = BOT_CARD_SELECTION_SECONDS
                elif isinstance(action.command, ContinueCardCommand):
                    event_sequence = (
                        pending_draw.reveal_sequence if pending_draw is not None else None
                    )
                    target_delay = BOT_CARD_DISPLAY_SECONDS
                else:
                    event_sequence = (
                        pending_result.resolved_sequence
                        if pending_result is not None
                        else None
                    )
                    target_delay = BOT_CARD_CHOICE_RESULT_SECONDS
                draw_event = next(
                    (
                        event
                        for event in reversed(game.events)
                        if event.sequence == event_sequence
                    ),
                    None,
                )
                elapsed = (
                    (datetime.now(UTC) - draw_event.occurred_at).total_seconds()
                    if draw_event is not None
                    else 0
                )
                remaining = max(0.0, target_delay - elapsed)
                if remaining:
                    await asyncio.sleep(remaining)
                async with session_factory() as session:
                    game = await GameRepository(session).get(game_id)
                pack = game.pack_snapshot or pack_loader.load(
                    game.pack_id,
                    version=game.pack_version,
                )
                action = policy.choose_action(game, pack)
                if action is None:
                    return
                actor = next(
                    (
                        player
                        for player in game.players
                        if player.user_id == action.actor_id
                    ),
                    None,
                )
            if (
                actor is not None
                and actor.bot_controller is BotController.AI
                and not isinstance(
                    action.command,
                    (ChooseCardCommand, ContinueCardCommand),
                )
            ):
                baseline_action = action
                decision_timeout = _ai_bot_decision_timeout(game)
                if decision_timeout <= 0:
                    action = baseline_action
                else:
                    try:
                        action = await asyncio.wait_for(
                            _choose_ai_bot_action(
                                ai_policy,
                                game,
                                pack,
                                baseline_action,
                            ),
                            timeout=decision_timeout,
                        )
                    except TimeoutError:
                        logger.warning(
                            "AI bot decision timed out for game %s; using standard policy",
                            game_id,
                        )
                        action = baseline_action
                    except AiBotDecisionError as exc:
                        logger.warning(
                            "AI bot decision failed for game %s; using standard policy: %s",
                            game_id,
                            exc,
                        )
                        action = baseline_action
                    except Exception:
                        logger.exception(
                            "AI bot policy crashed for game %s; using standard policy",
                            game_id,
                        )
                        action = baseline_action
            before_sequence = game.event_sequence
            failure_key = (
                before_sequence,
                action.actor_id,
                action.command.model_dump_json(),
            )
            try:
                updated = await _execute_bot_action(game_id, action, before_sequence)
            except DomainError as exc:
                if failure_key == failed_key:
                    repeated_failures += 1
                else:
                    failed_key = failure_key
                    repeated_failures = 1
                logger.warning(
                    "bot command rejected for game %s (%s): %s",
                    game_id,
                    action.reason,
                    exc,
                )
                if repeated_failures < BOT_MAX_REPEATED_FAILURES:
                    continue
                fallback = policy.safe_fallback(game, pack)
                if fallback is None:
                    return
                try:
                    updated = await _execute_bot_action(game_id, fallback, before_sequence)
                except DomainError:
                    logger.exception(
                        "bot safeguard failed for game %s; resigning bot %s",
                        game_id,
                        action.actor_id,
                    )
                    updated = await _resign_stalled_bot(game_id, action.actor_id)
                failed_key = None
                repeated_failures = 0
            if len(updated.events) <= before_sequence:
                repeated_failures += 1
                if repeated_failures >= BOT_MAX_REPEATED_FAILURES:
                    updated = await _resign_stalled_bot(game_id, action.actor_id)
                    repeated_failures = 0
            else:
                failed_key = None
                repeated_failures = 0
            sync_auction_timer(updated)
            await _announce_bot_decisions(updated, before_sequence)
            await react_to_recent_events(updated)
            await broadcast_game_state(updated, complete_events=False)
            actions_since_yield += 1
            if actions_since_yield >= BOT_ACTIONS_PER_YIELD:
                actions_since_yield = 0
                await asyncio.sleep(1)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("bot runner failed for game %s", game_id)
    finally:
        existing = bot_runner_tasks.get(game_id)
        if existing is task:
            bot_runner_tasks.pop(game_id, None)


async def _choose_ai_bot_action(
    policy: AiBotPolicy,
    game: GameState,
    pack: ContentPack,
    baseline: BotAction,
) -> BotAction:
    async with ai_bot_decision_semaphore:
        return await policy.choose_action(game, pack, baseline)


def _ai_bot_decision_timeout(
    game: GameState,
    *,
    now: datetime | None = None,
) -> float:
    if game.active_auction is None:
        return AI_BOT_DECISION_DEADLINE_SECONDS
    timeout = AI_AUCTION_DECISION_DEADLINE_SECONDS
    if game.active_auction.bid_deadline is None:
        return timeout
    remaining = (game.active_auction.bid_deadline - (now or datetime.now(UTC))).total_seconds()
    return max(0.0, min(timeout, remaining - AI_AUCTION_FALLBACK_BUFFER_SECONDS))


async def _execute_bot_action(
    game_id: UUID,
    action: BotAction,
    expected_sequence: int,
) -> GameState:
    async with session_factory() as session:
        return await GameService(session, pack_loader).execute(
            game_id,
            action.actor_id,
            action.command,
            expected_sequence=expected_sequence,
            automation_reason=action.reason,
            automation_note=action.note,
        )


async def _resign_stalled_bot(game_id: UUID, bot_id: UUID) -> GameState:
    async with session_factory() as session:
        return await GameService(session, pack_loader).leave(game_id, bot_id)


def _member_game_room(game_id: UUID, user_id: UUID) -> str:
    return f"{game_id}:member:{user_id}"


async def revoke_game_membership(game_id: UUID, user_id: UUID) -> None:
    """Remove every active socket for one user from a game's private room."""
    await sio.close_room(_member_game_room(game_id, user_id))


async def broadcast_game_state(
    game: GameState,
    *,
    complete_events: bool,
) -> None:
    member_ids = {
        player.user_id for player in game.players if not player.is_bot
    } | {spectator.user_id for spectator in game.spectators}
    for member_id in member_ids:
        try:
            await sio.emit(
                "game_state",
                game_state_view(
                    game,
                    member_id,
                    complete_events=complete_events,
                ).model_dump(mode="json"),
                room=_member_game_room(game.id, member_id),
            )
        except Exception:
            logger.exception(
                "game state broadcast failed for game %s member %s",
                game.id,
                member_id,
            )


def sync_auction_timer(game: GameState) -> None:
    existing = auction_timer_tasks.get(game.id)
    if game.active_auction is None:
        if existing is not None:
            if existing[2] is not asyncio.current_task():
                existing[2].cancel()
            auction_timer_tasks.pop(game.id, None)
        return
    deadline = game.active_auction.bid_deadline
    phase = game.active_auction.phase
    if deadline is None:
        return
    if existing is not None:
        if (
            existing[1] == phase
            and existing[0] >= deadline
            and not existing[2].done()
        ):
            return
        if existing[2] is not asyncio.current_task():
            existing[2].cancel()
    task = asyncio.create_task(_run_auction_timer(game.id, deadline))
    auction_timer_tasks[game.id] = (deadline, phase, task)


async def resume_auction_timers() -> None:
    async with session_factory() as session:
        games = await GameService(session, pack_loader).list_scheduled_auctions()
    for game in games:
        sync_auction_timer(game)


async def shutdown_auction_timers() -> None:
    tasks = [task for _, _, task in auction_timer_tasks.values()]
    auction_timer_tasks.clear()
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def _run_auction_timer(game_id: UUID, deadline: datetime) -> None:
    task = asyncio.current_task()
    try:
        delay = max((deadline - datetime.now(UTC)).total_seconds(), 0)
        await asyncio.sleep(delay)
        retry_delay = 0.25
        while True:
            try:
                async with session_factory() as session:
                    game = await GameService(
                        session,
                        pack_loader,
                    ).settle_expired_auction(
                        game_id,
                        deadline,
                    )
                break
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "failed to settle auction for game %s; retrying",
                    game_id,
                )
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 5)
        if game is None:
            return
        await react_to_recent_events(game)
        await broadcast_game_state(game, complete_events=False)
        sync_auction_timer(game)
        sync_bot_runner(game)
    except asyncio.CancelledError:
        raise
    finally:
        existing = auction_timer_tasks.get(game_id)
        if existing is not None and existing[2] is task:
            auction_timer_tasks.pop(game_id, None)
