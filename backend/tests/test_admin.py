from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.audio_service import GAME_SOUND_IDS
from business_game.infrastructure.db_models import UserRecord


async def register_and_login(
    client: AsyncClient,
    *,
    email: str,
    display_name: str,
) -> dict[str, str]:
    created = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": display_name,
            "locale": "es",
        },
    )
    assert created.status_code == 201
    token = await client.post(
        "/api/v1/auth/token",
        data={"username": email, "password": "correct-horse-battery"},
    )
    assert token.status_code == 200
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


async def grant_admin(session: AsyncSession, email: str) -> UserRecord:
    record = await session.scalar(select(UserRecord).where(UserRecord.email == email))
    assert record is not None
    record.role = "admin"
    await session.commit()
    return record


async def test_admin_manages_users_without_removing_own_access(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    admin_headers = await register_and_login(
        client,
        email="batman@example.com",
        display_name="batman",
    )
    admin = await grant_admin(session, "batman@example.com")
    player_headers = await register_and_login(
        client,
        email="robin@example.com",
        display_name="Robin",
    )

    forbidden = await client.get("/api/v1/admin/users", headers=player_headers)
    assert forbidden.status_code == 403

    users = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert users.status_code == 200
    robin = next(item for item in users.json() if item["email"] == "robin@example.com")

    promoted = await client.patch(
        f"/api/v1/admin/users/{robin['id']}",
        headers=admin_headers,
        json={"role": "admin", "is_active": False},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"
    assert promoted.json()["is_active"] is False
    assert (await client.get("/api/v1/auth/me", headers=player_headers)).status_code == 401

    self_locked = await client.patch(
        f"/api/v1/admin/users/{admin.id}",
        headers=admin_headers,
        json={"role": "player"},
    )
    assert self_locked.status_code == 409


async def test_admin_replaces_and_restores_persistent_audio(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    admin_headers = await register_and_login(
        client,
        email="audio-admin@example.com",
        display_name="Audio Admin",
    )
    await grant_admin(session, "audio-admin@example.com")

    catalog = await client.get("/api/v1/audio/catalog")
    assert catalog.status_code == 200
    assert [item["sound_id"] for item in catalog.json()] == list(GAME_SOUND_IDS)

    payload = b"OggS" + b"\x00" * 64
    replaced = await client.put(
        "/api/v1/admin/audio/bank-loan-issued",
        headers=admin_headers,
        files={"file": ("bank.ogg", payload, "audio/ogg")},
    )
    assert replaced.status_code == 200
    assert replaced.json()["custom"] is True
    assert replaced.json()["original_filename"] == "bank.ogg"

    downloaded = await client.get(replaced.json()["source_url"])
    assert downloaded.status_code == 200
    assert downloaded.content == payload
    assert downloaded.headers["content-type"].startswith("audio/ogg")

    reset = await client.delete(
        "/api/v1/admin/audio/bank-loan-issued",
        headers=admin_headers,
    )
    assert reset.status_code == 204
    assert (
        await client.get("/api/v1/audio/bank-loan-issued")
    ).status_code == 404


async def test_admin_lists_and_cancels_rooms(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    admin_headers = await register_and_login(
        client,
        email="room-admin@example.com",
        display_name="Room Admin",
    )
    await grant_admin(session, "room-admin@example.com")
    packs = (await client.get("/api/v1/packs")).json()
    created = await client.post(
        "/api/v1/games",
        headers=admin_headers,
        json={"pack_id": packs[0]["id"], "version": packs[0]["version"]},
    )
    assert created.status_code == 201
    game_id = created.json()["id"]

    rooms = await client.get("/api/v1/admin/rooms", headers=admin_headers)
    assert rooms.status_code == 200
    room = next(item for item in rooms.json() if item["id"] == game_id)
    assert room["status"] == "lobby"
    assert room["human_player_count"] == 1

    cancelled = await client.post(
        f"/api/v1/admin/rooms/{game_id}/cancel",
        headers=admin_headers,
    )
    assert cancelled.status_code == 204
    rooms = await client.get("/api/v1/admin/rooms", headers=admin_headers)
    room = next(item for item in rooms.json() if item["id"] == game_id)
    assert room["status"] == "cancelled"
