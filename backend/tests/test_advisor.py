import json
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import AsyncClient

from business_game.api.advisor_routes import get_advisor_service
from business_game.application.advisor import (
    AdvisorService,
    AdvisorUnavailableError,
    build_advisor_context,
)
from business_game.application.pack_loader import PackLoader
from business_game.domain.advisor_models import AdvisorRequest, AdvisorResponse
from business_game.domain.models import ContentPack, GameEvent, GameState, PlayerState
from business_game.main import api


def advisor_game(packs_dir: Path) -> tuple[GameState, ContentPack, UUID, UUID, str]:
    pack = PackLoader(packs_dir).load("classic-demo")
    actor_id = uuid4()
    opponent_id = uuid4()
    property_tile = next(tile for tile in pack.board.tiles if tile.is_purchasable)
    game = GameState(
        host_user_id=actor_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        players=[
            PlayerState(
                user_id=actor_id,
                display_name="Nombre privado",
                balance=900,
                jail_card_ids=["private-card"],
            ),
            PlayerState(
                user_id=opponent_id,
                display_name="Otra persona",
                balance=1_300,
                jail_card_ids=["other-private-card"],
            ),
        ],
        owners={property_tile.id: actor_id},
        events=[GameEvent(sequence=7, type="turn.started")],
    )
    return game, pack, actor_id, opponent_id, property_tile.id


def test_advisor_context_filters_identifiers_and_private_cards(packs_dir: Path) -> None:
    game, pack, actor_id, opponent_id, property_id = advisor_game(packs_dir)

    context = build_advisor_context(game, pack, actor_id)
    serialized = json.dumps(context, ensure_ascii=False)

    players = context["players"]
    properties = context["properties"]
    assert isinstance(players, list)
    assert isinstance(properties, list)
    assert context["snapshot_sequence"] == 7
    assert players[0]["alias"] == "Tú"
    assert players[0]["jail_card_count"] == 1
    assert "jail_card_count" not in players[1]
    assert next(item for item in properties if item["id"] == property_id)["owner"] == "Tú"
    assert str(actor_id) not in serialized
    assert str(opponent_id) not in serialized
    assert "Nombre privado" not in serialized
    assert "Otra persona" not in serialized
    assert "private-card" not in serialized
    assert "other-private-card" not in serialized


async def test_advisor_calls_deepseek_with_filtered_state(packs_dir: Path) -> None:
    game, pack, actor_id, _, _ = advisor_game(packs_dir)

    async def handle_request(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer test-key"
        payload = json.loads(request.content)
        assert payload["model"] == "deepseek-v4-flash"
        assert payload["thinking"] == {"type": "disabled"}
        assert payload["max_tokens"] == 900
        assert payload["temperature"] == 0.25
        assert payload["user_id"].startswith("game-advisor-")
        system_prompt = payload["messages"][0]["content"]
        assert "Markdown" in system_prompt
        assert "nombres de campos JSON" in system_prompt
        prompt = payload["messages"][1]["content"]
        assert "Nombre privado" not in prompt
        assert "private-card" not in prompt
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": " Conserva liquidez. "}}]},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request)) as client:
        advisor = AdvisorService(
            api_key="test-key",
            model="deepseek-v4-flash",
            base_url="https://api.deepseek.com",
            timeout_seconds=5,
            thinking_enabled=False,
            max_tokens=900,
            temperature=0.25,
            client=client,
        )
        response = await advisor.advise(
            game,
            pack,
            actor_id,
            AdvisorRequest(question="¿Qué hago?"),
            "es",
        )

    assert response == AdvisorResponse(answer="Conserva liquidez.", snapshot_sequence=7)


async def test_advisor_rejects_missing_configuration(packs_dir: Path) -> None:
    game, pack, actor_id, _, _ = advisor_game(packs_dir)
    advisor = AdvisorService(
        api_key=None,
        model="deepseek-v4-flash",
        base_url="https://api.deepseek.com",
        timeout_seconds=5,
        thinking_enabled=False,
        max_tokens=900,
        temperature=0.25,
    )

    with pytest.raises(AdvisorUnavailableError, match="not configured"):
        await advisor.advise(
            game,
            pack,
            actor_id,
            AdvisorRequest(question="¿Qué hago?"),
            "es",
        )


async def register_and_login(
    client: AsyncClient,
    *,
    email: str = "advisor@example.com",
) -> dict[str, str]:
    registration = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": "Advisor Player",
            "locale": "es",
        },
    )
    assert registration.status_code == 201
    login = await client.post(
        "/api/v1/auth/token",
        data={"username": email, "password": "correct-horse-battery"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_advisor_endpoint_uses_authenticated_player(client: AsyncClient) -> None:
    headers = await register_and_login(client)
    game = (
        await client.post(
            "/api/v1/games",
            headers=headers,
            json={"pack_id": "classic-demo"},
        )
    ).json()

    class FakeAdvisor:
        async def advise(
            self,
            game: GameState,
            pack: ContentPack,
            actor_id: UUID,
            data: AdvisorRequest,
            locale: str,
            history: object,
        ) -> AdvisorResponse:
            assert actor_id == game.players[0].user_id
            assert pack.manifest.id == "classic-demo"
            assert data.question == "¿Compro?"
            assert locale == "es"
            assert history == []
            return AdvisorResponse(answer="Sí, pero conserva efectivo.", snapshot_sequence=2)

    api.dependency_overrides[get_advisor_service] = lambda: FakeAdvisor()
    response = await client.post(
        f"/api/v1/games/{game['id']}/advisor",
        headers=headers,
        json={"question": "¿Compro?", "history": [{"role": "user", "content": "ignorar"}]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "answer": "Sí, pero conserva efectivo.",
        "snapshot_sequence": 2,
    }

    history = await client.get(
        f"/api/v1/games/{game['id']}/advisor/history",
        headers=headers,
    )
    assert history.status_code == 200
    messages = history.json()["messages"]
    assert [(message["role"], message["content"]) for message in messages] == [
        ("user", "¿Compro?"),
        ("assistant", "Sí, pero conserva efectivo."),
    ]
    assert messages[0]["snapshot_sequence"] is None
    assert messages[1]["snapshot_sequence"] == 2


async def test_advisor_history_is_isolated_by_player(client: AsyncClient) -> None:
    host_headers = await register_and_login(client, email="advisor-owner@example.com")
    guest_headers = await register_and_login(client, email="advisor-guest@example.com")
    game = (
        await client.post(
            "/api/v1/games",
            headers=host_headers,
            json={"pack_id": "classic-demo"},
        )
    ).json()
    joined = await client.post(
        f"/api/v1/games/{game['id']}/players",
        headers=guest_headers,
    )
    assert joined.status_code == 200

    class FakeAdvisor:
        async def advise(
            self,
            game: GameState,
            pack: ContentPack,
            actor_id: UUID,
            data: AdvisorRequest,
            locale: str,
            history: object,
        ) -> AdvisorResponse:
            return AdvisorResponse(answer=f"Consejo para {actor_id}", snapshot_sequence=1)

    api.dependency_overrides[get_advisor_service] = lambda: FakeAdvisor()
    asked = await client.post(
        f"/api/v1/games/{game['id']}/advisor",
        headers=host_headers,
        json={"question": "¿Qué hago?"},
    )
    assert asked.status_code == 200

    guest_history = await client.get(
        f"/api/v1/games/{game['id']}/advisor/history",
        headers=guest_headers,
    )
    assert guest_history.status_code == 200
    assert guest_history.json() == {"messages": []}


async def test_advisor_endpoint_rejects_spectators(client: AsyncClient) -> None:
    host_headers = await register_and_login(client, email="advisor-host@example.com")
    spectator_headers = await register_and_login(
        client,
        email="advisor-spectator@example.com",
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
        headers=spectator_headers,
    )
    assert watched.status_code == 200

    response = await client.post(
        f"/api/v1/games/{game['id']}/advisor",
        headers=spectator_headers,
        json={"question": "¿Qué debería hacer?"},
    )

    assert response.status_code == 403
