FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH"

WORKDIR /app/backend

RUN groupadd --system --gid 10001 business-game \
    && useradd --system --uid 10001 --gid business-game --home-dir /app business-game

COPY --chown=10001:10001 README.md /app/README.md
COPY --chown=10001:10001 backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY --chown=10001:10001 backend/ ./
COPY --chown=10001:10001 content/ /app/content/
RUN uv sync --frozen --no-dev

COPY --chmod=755 backend/docker-entrypoint.sh /usr/local/bin/business-game-entrypoint

ENV BUSINESS_GAME_PACKS_DIR=/app/content/packs

EXPOSE 8000

USER 10001:10001

ENTRYPOINT ["business-game-entrypoint"]
