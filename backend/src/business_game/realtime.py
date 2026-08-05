import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

import socketio
from pydantic import TypeAdapter, ValidationError
from socketio.exceptions import ConnectionRefusedError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.api.dependencies import pack_loader
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.errors import DomainError, UnauthorizedError
from business_game.domain.models import GameCommand, GameState
from business_game.infrastructure.database import session_factory
from business_game.infrastructure.repositories import UserRepository
from business_game.security import decode_access_token

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=list(settings.cors_origins),
)
command_adapter = TypeAdapter(GameCommand)
logger = logging.getLogger(__name__)
auction_timer_tasks: dict[UUID, tuple[datetime, asyncio.Task[None]]] = {}


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
        await sio.enter_room(sid, str(game_id))
        await sio.emit("game_state", game.model_dump(mode="json"), to=sid)
        return {"ok": True}
    except UnauthorizedError as exc:
        return {"ok": False, "code": "AUTH_EXPIRED", "error": str(exc)}
    except (KeyError, ValueError, DomainError) as exc:
        return {"ok": False, "code": "DOMAIN_ERROR", "error": str(exc)}


@sio.event
async def game_command(sid: str, data: dict) -> dict:
    try:
        game_id = UUID(data["game_id"])
        command = command_adapter.validate_python(data["command"])
        async with session_factory() as session:
            user_id = await _authenticated_user_id(sid, session)
            game = await GameService(session, pack_loader).execute(
                game_id,
                user_id,
                command,
            )
        sync_auction_timer(game)
        await sio.emit(
            "game_state",
            game.model_dump(mode="json"),
            room=str(game_id),
        )
        return {"ok": True, "sequence": len(game.events)}
    except UnauthorizedError as exc:
        return {"ok": False, "code": "AUTH_EXPIRED", "error": str(exc)}
    except (KeyError, ValueError, ValidationError, DomainError) as exc:
        return {"ok": False, "code": "DOMAIN_ERROR", "error": str(exc)}


async def _authenticated_user_id(sid: str, session: AsyncSession) -> UUID:
    socket_session = await sio.get_session(sid)
    user_id = decode_access_token(socket_session["token"])
    async with session.begin():
        await UserRepository(session).get(user_id)
    return user_id


def sync_auction_timer(game: GameState) -> None:
    deadline = (
        game.active_auction.bid_deadline
        if game.active_auction is not None
        else None
    )
    existing = auction_timer_tasks.get(game.id)
    if deadline is None:
        return
    if existing is not None:
        if existing[0] >= deadline and not existing[1].done():
            return
        existing[1].cancel()
    task = asyncio.create_task(_run_auction_timer(game.id, deadline))
    auction_timer_tasks[game.id] = (deadline, task)


async def resume_auction_timers() -> None:
    async with session_factory() as session:
        games = await GameService(session, pack_loader).list_scheduled_auctions()
    for game in games:
        sync_auction_timer(game)


async def shutdown_auction_timers() -> None:
    tasks = [task for _, task in auction_timer_tasks.values()]
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
        try:
            await sio.emit(
                "game_state",
                game.model_dump(mode="json"),
                room=str(game_id),
            )
        except Exception:
            logger.exception(
                "auction settled but state broadcast failed for game %s",
                game_id,
            )
        sync_auction_timer(game)
    except asyncio.CancelledError:
        raise
    finally:
        existing = auction_timer_tasks.get(game_id)
        if existing is not None and existing[1] is task:
            auction_timer_tasks.pop(game_id, None)
