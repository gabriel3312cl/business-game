from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from business_game.api.board_routes import router as board_router
from business_game.api.routes import router
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
    shutdown_auction_timers,
    sio,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await resume_auction_timers()
    yield
    await shutdown_auction_timers()


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
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc)},
        headers=headers,
    )


app = socketio.ASGIApp(sio, other_asgi_app=api)
