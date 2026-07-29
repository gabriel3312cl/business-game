FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH"

WORKDIR /app/backend

COPY README.md /app/README.md
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY content/ /app/content/
RUN uv sync --frozen --no-dev

COPY --chmod=755 backend/docker-entrypoint.sh /usr/local/bin/business-game-entrypoint

ENV BUSINESS_GAME_PACKS_DIR=/app/content/packs

EXPOSE 8000

ENTRYPOINT ["business-game-entrypoint"]
