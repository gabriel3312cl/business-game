from uuid import UUID

import socketio
from pydantic import TypeAdapter, ValidationError

from business_game.api.dependencies import pack_loader
from business_game.application.services import GameService
from business_game.config import settings
from business_game.domain.errors import DomainError
from business_game.domain.models import GameCommand
from business_game.infrastructure.database import session_factory
from business_game.infrastructure.repositories import UserRepository
from business_game.security import decode_access_token

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=list(settings.cors_origins),
)
command_adapter = TypeAdapter(GameCommand)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None) -> bool:
    try:
        token = auth["token"] if auth is not None else ""
        user_id = decode_access_token(token)
        async with session_factory() as session:
            await UserRepository(session).get(user_id)
        await sio.save_session(sid, {"user_id": str(user_id)})
        return True
    except (KeyError, DomainError) as exc:
        raise ConnectionRefusedError("authentication required") from exc


@sio.event
async def room_join(sid: str, data: dict) -> dict:
    try:
        socket_session = await sio.get_session(sid)
        user_id = UUID(socket_session["user_id"])
        game_id = UUID(data["game_id"])
        async with session_factory() as session:
            game = await GameService(session, pack_loader).get(game_id, user_id)
        await sio.enter_room(sid, str(game_id))
        await sio.emit("game_state", game.model_dump(mode="json"), to=sid)
        return {"ok": True}
    except (KeyError, ValueError, DomainError) as exc:
        return {"ok": False, "error": str(exc)}


@sio.event
async def game_command(sid: str, data: dict) -> dict:
    try:
        socket_session = await sio.get_session(sid)
        user_id = UUID(socket_session["user_id"])
        game_id = UUID(data["game_id"])
        command = command_adapter.validate_python(data["command"])
        async with session_factory() as session:
            game = await GameService(session, pack_loader).execute(
                game_id,
                user_id,
                command,
            )
        await sio.emit(
            "game_state",
            game.model_dump(mode="json"),
            room=str(game_id),
        )
        return {"ok": True, "sequence": len(game.events)}
    except (KeyError, ValueError, ValidationError, DomainError) as exc:
        return {"ok": False, "error": str(exc)}
