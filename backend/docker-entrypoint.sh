#!/bin/sh
set -eu

alembic upgrade head

if [ "${BUSINESS_GAME_API_RELOAD:-false}" = "true" ]; then
    exec uvicorn business_game.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --no-date-header \
        --reload \
        --reload-dir /app/backend/src \
        --reload-dir /app/content
fi

exec uvicorn business_game.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --no-date-header
