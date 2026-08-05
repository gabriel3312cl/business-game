#!/bin/sh
set -eu

alembic upgrade head
exec uvicorn business_game.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --no-date-header
