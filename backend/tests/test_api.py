from httpx import AsyncClient


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
        json={"action": "roll"},
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
