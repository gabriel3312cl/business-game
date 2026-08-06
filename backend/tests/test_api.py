from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.config import settings
from business_game.domain.models import TradeOffer
from business_game.infrastructure.db_models import (
    AuthSessionRecord,
    GameRecord,
    UserRecord,
)
from business_game.realtime import _authenticated_user_id, sio
from business_game.security import hash_session_token


async def register_and_login(
    client: AsyncClient,
    *,
    email: str = "gabriel@example.com",
) -> dict[str, str]:
    created = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": "Gabriel",
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


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_authenticated_user_lifecycle(client: AsyncClient) -> None:
    headers = await register_and_login(client)

    current = await client.get("/api/v1/auth/me", headers=headers)
    assert current.status_code == 200
    assert current.json()["email"] == "gabriel@example.com"

    updated = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"display_name": "Gabi"},
    )
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "Gabi"

    deleted = await client.delete("/api/v1/users/me", headers=headers)
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_user_panel_layout_preferences_persist_per_account(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    first_headers = await register_and_login(client, email="layout@example.com")
    default_preferences = await client.get(
        "/api/v1/users/me/preferences",
        headers=first_headers,
    )
    assert default_preferences.status_code == 200
    assert default_preferences.json() == {
        "panel_layout": None,
        "audio_settings": None,
        "token_appearance": None,
    }

    panel_layout = {
        "order": ["chat", "players", "management", "room", "heatmap"],
        "zones": {
            "room": "left",
            "heatmap": "left",
            "players": "right",
            "management": "right",
            "chat": "right",
        },
        "heights": {"chat": 420, "management": 500},
    }
    updated = await client.patch(
        "/api/v1/users/me/preferences",
        headers=first_headers,
        json={"panel_layout": panel_layout},
    )
    assert updated.status_code == 200
    assert updated.json() == {
        "panel_layout": panel_layout,
        "audio_settings": None,
        "token_appearance": None,
    }

    audio_settings = {
        "muted": True,
        "volume": 0.35,
        "disabled_sounds": ["chat-message", "auction-countdown"],
    }
    audio_updated = await client.patch(
        "/api/v1/users/me/preferences",
        headers=first_headers,
        json={"audio_settings": audio_settings},
    )
    assert audio_updated.status_code == 200
    assert audio_updated.json() == {
        "panel_layout": panel_layout,
        "audio_settings": audio_settings,
        "token_appearance": None,
    }

    token_appearance = {
        "color": "#70b7ff",
        "shape": "diamond",
        "icon": "cat",
    }
    token_updated = await client.patch(
        "/api/v1/users/me/preferences",
        headers=first_headers,
        json={"token_appearance": token_appearance},
    )
    assert token_updated.status_code == 200
    assert token_updated.json() == {
        "panel_layout": panel_layout,
        "audio_settings": audio_settings,
        "token_appearance": token_appearance,
    }

    restored = await client.get(
        "/api/v1/users/me/preferences",
        headers=first_headers,
    )
    assert restored.status_code == 200
    assert restored.json() == {
        "panel_layout": panel_layout,
        "audio_settings": audio_settings,
        "token_appearance": token_appearance,
    }

    first_user = await session.scalar(
        select(UserRecord).where(UserRecord.email == "layout@example.com")
    )
    assert first_user is not None
    assert first_user.ui_preferences == {
        "panel_layout": panel_layout,
        "audio_settings": audio_settings,
        "token_appearance": token_appearance,
    }
    await session.rollback()

    second_headers = await register_and_login(client, email="other-layout@example.com")
    second_preferences = await client.get(
        "/api/v1/users/me/preferences",
        headers=second_headers,
    )
    assert second_preferences.status_code == 200
    assert second_preferences.json() == {
        "panel_layout": None,
        "audio_settings": None,
        "token_appearance": None,
    }


async def test_rejects_invalid_or_unauthenticated_panel_preferences(
    client: AsyncClient,
) -> None:
    assert (await client.get("/api/v1/users/me/preferences")).status_code == 401
    headers = await register_and_login(client, email="invalid-layout@example.com")
    invalid = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={
            "panel_layout": {
                "order": ["room", "room", "players", "management", "chat"],
                "zones": {
                    "room": "left",
                    "heatmap": "left",
                    "players": "right",
                    "management": "right",
                    "chat": "right",
                },
                "heights": {"chat": 50},
            }
        },
    )
    assert invalid.status_code == 422

    invalid_audio = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={
            "audio_settings": {
                "muted": False,
                "volume": 1.5,
                "disabled_sounds": ["chat-message", "chat-message"],
            }
        },
    )
    assert invalid_audio.status_code == 422

    invalid_token = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={
            "token_appearance": {
                "color": "javascript:red",
                "shape": "triangle",
                "icon": "unknown",
            }
        },
    )
    assert invalid_token.status_code == 422


async def test_rejects_duplicate_email_and_invalid_password(client: AsyncClient) -> None:
    await register_and_login(client)
    duplicate = await client.post(
        "/api/v1/auth/register",
        json={
            "email": " GABRIEL@example.com ",
            "password": "another-secure-password",
            "display_name": "Other",
            "locale": "es",
        },
    )
    assert duplicate.status_code == 409

    invalid_login = await client.post(
        "/api/v1/auth/token",
        data={"username": "gabriel@example.com", "password": "wrong-password"},
    )
    assert invalid_login.status_code == 401


async def test_persistent_session_refresh_and_logout(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    headers = await register_and_login(client, email="session@example.com")
    current_user = (await client.get("/api/v1/auth/me", headers=headers)).json()
    login = await client.post(
        "/api/v1/auth/token",
        data={
            "username": "session@example.com",
            "password": "correct-horse-battery",
        },
    )
    cookie_header = login.headers["set-cookie"]
    assert "HttpOnly" in cookie_header
    assert "SameSite=strict" in cookie_header
    assert "Path=/" in cookie_header

    raw_session_token = client.cookies.get(settings.session_cookie_name)
    assert raw_session_token
    token_hash = hash_session_token(raw_session_token)
    stored_session = await session.scalar(
        select(AuthSessionRecord).where(
            AuthSessionRecord.token_hash == token_hash,
        )
    )
    assert stored_session is not None
    assert stored_session.token_hash != raw_session_token
    assert len(stored_session.token_hash) == 64
    await session.rollback()

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["token_type"] == "bearer"
    assert refreshed.json()["access_token"]
    assert refreshed.json()["user_id"] == current_user["id"]

    logged_out = await client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_realtime_authentication_closes_lookup_transaction(
    client: AsyncClient,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await register_and_login(
        client,
        email="socket-auth@example.com",
    )
    token = headers["Authorization"].removeprefix("Bearer ")

    async def socket_session(_sid: str) -> dict[str, str]:
        return {"token": token}

    monkeypatch.setattr(sio, "get_session", socket_session)
    user_id = await _authenticated_user_id("socket-id", session)

    assert not session.in_transaction()
    async with session.begin():
        assert await session.get(UserRecord, user_id) is not None


async def test_game_creation_uses_authenticated_identity(client: AsyncClient) -> None:
    headers = await register_and_login(client)
    current_user = (await client.get("/api/v1/auth/me", headers=headers)).json()
    created = await client.post(
        "/api/v1/games",
        headers=headers,
        json={"pack_id": "classic-demo"},
    )

    assert created.status_code == 201
    game = created.json()
    assert game["host_user_id"] == current_user["id"]
    assert game["players"][0]["user_id"] == current_user["id"]
    assert game["players"][0]["position"] == 0
    assert game["events"][0]["sequence"] == 1
    assert game["events"][0]["type"] == "game.created"
    assert game["events"][1]["type"] == "player.joined"


async def test_trade_analysis_uses_authenticated_participant_perspective(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    proposer_headers = await register_and_login(
        client,
        email="analysis-proposer@example.com",
    )
    recipient_headers = await register_and_login(
        client,
        email="analysis-recipient@example.com",
    )
    created = await client.post(
        "/api/v1/games",
        headers=proposer_headers,
        json={"pack_id": "classic-demo"},
    )
    game = created.json()
    joined = await client.post(
        f"/api/v1/games/{game['id']}/players",
        headers=recipient_headers,
    )
    recipient = joined.json()["players"][1]
    trade = TradeOffer(
        proposer_id=UUID(game["players"][0]["user_id"]),
        recipient_id=UUID(recipient["user_id"]),
        offered_cash=200,
    )
    record = await session.get(GameRecord, UUID(game["id"]))
    assert record is not None
    state = deepcopy(record.state)
    state["trades"] = [trade.model_dump(mode="json")]
    record.state = state
    await session.commit()

    proposer_analysis = await client.get(
        f"/api/v1/games/{game['id']}/trades/{trade.id}/analysis",
        headers=proposer_headers,
    )
    recipient_analysis = await client.get(
        f"/api/v1/games/{game['id']}/trades/{trade.id}/analysis",
        headers=recipient_headers,
    )

    assert proposer_analysis.status_code == 200
    assert proposer_analysis.json()["perspective"] == "proposer"
    assert proposer_analysis.json()["estimated_surplus"] == -200
    assert recipient_analysis.status_code == 200
    assert recipient_analysis.json()["perspective"] == "recipient"
    assert recipient_analysis.json()["estimated_surplus"] == 200


async def test_lists_active_games_for_each_member(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    host_headers = await register_and_login(
        client,
        email="active-host@example.com",
    )
    player_headers = await register_and_login(
        client,
        email="active-player@example.com",
    )
    game = (
        await client.post(
            "/api/v1/games",
            headers=host_headers,
            json={"pack_id": "classic-demo"},
        )
    ).json()
    joined = await client.post(
        f"/api/v1/games/{game['id']}/players",
        headers=player_headers,
    )
    assert joined.status_code == 200

    host_games = await client.get("/api/v1/games/me/active", headers=host_headers)
    player_games = await client.get(
        "/api/v1/games/me/active",
        headers=player_headers,
    )
    assert [candidate["id"] for candidate in host_games.json()] == [game["id"]]
    assert [candidate["id"] for candidate in player_games.json()] == [game["id"]]
    assert len(host_games.json()[0]["players"]) == 2

    record = await session.get(GameRecord, UUID(game["id"]))
    assert record is not None
    state = deepcopy(record.state)
    state["players"][1]["bankrupt"] = True
    record.state = state
    await session.commit()

    player_games = await client.get(
        "/api/v1/games/me/active",
        headers=player_headers,
    )
    assert player_games.json() == []


async def test_room_settings_and_spectator_permissions(client: AsyncClient) -> None:
    host_headers = await register_and_login(
        client,
        email="room-host@example.com",
    )
    viewer_headers = await register_and_login(
        client,
        email="room-viewer@example.com",
    )
    game = (
        await client.post(
            "/api/v1/games",
            headers=host_headers,
            json={"pack_id": "classic-demo"},
        )
    ).json()

    watched = await client.post(
        f"/api/v1/games/{game['id']}/spectators",
        headers=viewer_headers,
    )
    assert watched.status_code == 200
    assert len(watched.json()["spectators"]) == 1
    assert (
        await client.get(
            f"/api/v1/games/{game['id']}",
            headers=viewer_headers,
        )
    ).status_code == 200

    command = await client.post(
        f"/api/v1/games/{game['id']}/commands",
        headers=viewer_headers,
        json={
            "command": {"action": "roll"},
            "expected_sequence": game["event_sequence"],
            "command_id": str(uuid4()),
        },
    )
    assert command.status_code == 403
    blocked_settings = await client.patch(
        f"/api/v1/games/{game['id']}/settings",
        headers=host_headers,
        json={"allow_spectators": False},
    )
    assert blocked_settings.status_code == 409

    left = await client.delete(
        f"/api/v1/games/{game['id']}/members/me",
        headers=viewer_headers,
    )
    assert left.status_code == 200
    settings = await client.patch(
        f"/api/v1/games/{game['id']}/settings",
        headers=host_headers,
        json={
            "max_players": 3,
            "allow_spectators": False,
            "rules": {"free_parking_jackpot": True},
        },
    )
    assert settings.status_code == 200
    assert settings.json()["settings"] == {
        "max_players": 3,
        "allow_spectators": False,
        "rules": {
            "auction_unpurchased_properties": True,
            "free_parking_jackpot": True,
            "double_salary_on_start": False,
        },
    }


async def test_protected_endpoint_requires_token(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/games",
        json={"pack_id": "classic-demo"},
    )
    assert response.status_code == 401


async def test_lists_content_packs(client: AsyncClient) -> None:
    response = await client.get("/api/v1/packs")
    assert response.status_code == 200
    assert {pack["id"] for pack in response.json()} == {
        "classic-demo",
        "extended-demo",
    }
