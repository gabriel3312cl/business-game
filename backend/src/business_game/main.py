import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from business_game.api.advisor_routes import router as advisor_router
from business_game.api.board_routes import asset_router
from business_game.api.board_routes import router as board_router
from business_game.api.chat_routes import router as chat_router
from business_game.api.routes import auth_rate_limiter, router
from business_game.config import settings
from business_game.domain.errors import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from business_game.realtime import (
    resume_auction_timers,
    resume_bot_runners,
    shutdown_auction_timers,
    shutdown_bot_runners,
    shutdown_chat_replies,
    sio,
)

security_logger = logging.getLogger("business_game.security")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await resume_auction_timers()
    await resume_bot_runners()
    yield
    await shutdown_chat_replies()
    await shutdown_bot_runners()
    await shutdown_auction_timers()
    await auth_rate_limiter.close()


api = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
api.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api.include_router(router)
api.include_router(board_router)
api.include_router(asset_router)
api.include_router(advisor_router)
api.include_router(chat_router)


@api.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    return response


@api.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    status_code = 400
    headers = None
    if isinstance(exc, NotFoundError):
        status_code = 404
    elif isinstance(exc, UnauthorizedError):
        status_code = 401
        headers = {"WWW-Authenticate": "Bearer"}
    elif isinstance(exc, ForbiddenError):
        status_code = 403
    elif isinstance(exc, ConflictError):
        status_code = 409
    if status_code in {401, 403}:
        security_logger.warning(
            "security_event=authorization_denied source_ip=%s method=%s path=%s status=%s",
            request.client.host if request.client is not None else "unknown",
            request.method,
            request.url.path,
            status_code,
        )
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc)},
        headers=headers,
    )


app = socketio.ASGIApp(sio, other_asgi_app=api)
