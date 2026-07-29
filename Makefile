.PHONY: dev-api dev-web infrastructure migrate stack stack-down test

infrastructure:
	docker compose up -d postgres redis

stack:
	docker compose up -d --build

stack-down:
	docker compose down

migrate:
	cd backend && uv run alembic upgrade head

dev-api:
	cd backend && uv run uvicorn business_game.main:app --reload --host 127.0.0.1 --port 48010

dev-web:
	cd frontend && pnpm dev

test:
	cd backend && uv run pytest
	cd backend && uv run ruff check .
	cd frontend && pnpm lint
	cd frontend && pnpm build
