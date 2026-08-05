from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from uuid import UUID

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.board_service import BoardProjectService, PackResolver
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.board_models import (
    BoardProjectCreate,
    BoardProjectUpdate,
    EditablePackContent,
    PublishBoardRequest,
)
from business_game.domain.models import (
    BuildPropertyCommand,
    RollCommand,
    SellBuildingCommand,
    UserCreate,
)
from business_game.infrastructure.db_models import BoardVersionRecord
from business_game.infrastructure.repositories import GameRepository


def board_document() -> dict[str, object]:
    tiles: list[dict[str, object]] = []
    kinds = {
        0: ("start", {}),
        1: (
            "property",
            {
                "group": "violet",
                "price": 100,
                "base_rent": 10,
                "mortgage_value": 50,
                "build_cost": 50,
                "rent_levels": [10, 20, 40, 80, 160, 320],
            },
        ),
        2: (
            "transport",
            {
                "purchasable": False,
                "landing_effects": [
                    {
                        "type": "move_to",
                        "tile_id": "tile_03",
                        "collect_start": False,
                    }
                ],
            },
        ),
        3: ("free", {"landing_effects": [{"type": "cash", "amount": 15}]}),
        4: ("jail", {}),
        6: ("card", {"deck_id": "opportunity"}),
        8: ("free", {}),
        9: (
            "property",
            {
                "group": "violet",
                "price": 120,
                "base_rent": 12,
                "mortgage_value": 60,
                "build_cost": 50,
                "rent_levels": [12, 24, 48, 96, 192, 384],
            },
        ),
        10: (
            "utility",
            {
                "price": 150,
                "base_rent": 4,
                "mortgage_value": 75,
                "rent_multipliers": [4, 10],
            },
        ),
        11: (
            "transport",
            {
                "price": 200,
                "base_rent": 25,
                "mortgage_value": 100,
                "rent_levels": [25, 50, 100, 200],
            },
        ),
        12: ("go_to_jail", {}),
        13: ("tax", {"amount": 100}),
    }
    for position in range(16):
        kind, extra = kinds.get(position, ("free", {}))
        tiles.append(
            {
                "id": f"tile_{position:02}",
                "kind": kind,
                "name_key": f"tile.{position:02}.name",
                **extra,
            }
        )
    messages = {
        "pack.name": "Mi tablero",
        "group.violet": "Violeta",
        "deck.opportunity.name": "Oportunidad",
        "card.chain.title": "Premio doble",
        "card.chain": "Recibe dos premios.",
        **{
            f"tile.{position:02}.name": f"Casilla {position}"
            for position in range(16)
        },
    }
    return {
        "schema_version": 5,
        "name_key": "pack.name",
        "side_length": 5,
        "default_locale": "es",
        "messages": {"es": messages},
        "min_players": 2,
        "max_players": 6,
        "starting_balance": 1000,
        "pass_start_salary": 200,
        "groups": [
            {
                "id": "violet",
                "name_key": "group.violet",
                "color": "#7c4dff",
            }
        ],
        "tiles": tiles,
        "decks": [
            {
                "id": "opportunity",
                "name_key": "deck.opportunity.name",
                "cards": [
                    {
                        "id": "chain_reward",
                        "title_key": "card.chain.title",
                        "message_key": "card.chain",
                        "effects": [
                            {"type": "cash", "amount": 10},
                            {"type": "cash", "amount": 20},
                        ],
                    }
                ],
            }
        ],
    }


async def register(
    client: AsyncClient,
    *,
    email: str,
    name: str,
) -> dict[str, str]:
    created = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": name,
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


async def test_board_project_crud_publish_and_game_resolution(
    client: AsyncClient,
) -> None:
    owner_headers = await register(
        client,
        email="owner@example.com",
        name="Owner",
    )
    other_headers = await register(
        client,
        email="other@example.com",
        name="Other",
    )
    created = await client.post(
        "/api/v1/board-projects",
        headers=owner_headers,
        json={"name": "Mi tablero", "description": "Borrador", "document": {}},
    )
    assert created.status_code == 201
    project = created.json()
    project_id = project["id"]
    assert project["revision"] == 1
    assert project["status"] == "draft"

    invalid = await client.post(
        f"/api/v1/board-projects/{project_id}/validate",
        headers=owner_headers,
        json={"revision": 1},
    )
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False

    stale = await client.patch(
        f"/api/v1/board-projects/{project_id}",
        headers=owner_headers,
        json={"revision": 2, "description": "Fuera de fecha"},
    )
    assert stale.status_code == 409

    updated = await client.patch(
        f"/api/v1/board-projects/{project_id}",
        headers=owner_headers,
        json={"revision": 1, "document": board_document()},
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2

    inaccessible = await client.get(
        f"/api/v1/board-projects/{project_id}",
        headers=other_headers,
    )
    assert inaccessible.status_code == 404

    valid = await client.post(
        f"/api/v1/board-projects/{project_id}/validate",
        headers=owner_headers,
        json={"revision": 2},
    )
    assert valid.status_code == 200
    assert valid.json() == {"valid": True, "errors": [], "warnings": []}

    published = await client.post(
        f"/api/v1/board-projects/{project_id}/publish",
        headers=owner_headers,
        json={"revision": 2, "version": "1"},
    )
    assert published.status_code == 201
    publication = published.json()
    assert publication["version"] == "1.0.0"
    assert publication["manifest"]["side_length"] == 5
    pack_id = publication["pack_id"]

    packs = await client.get("/api/v1/packs")
    assert packs.status_code == 200
    assert pack_id in {pack["id"] for pack in packs.json()}
    loaded = await client.get(
        f"/api/v1/packs/{pack_id}",
        params={"version": "1.0.0", "locale": "es"},
    )
    assert loaded.status_code == 200
    assert loaded.json()["messages"]["pack.name"] == "Mi tablero"
    loaded_deck = loaded.json()["board"]["decks"][0]
    assert loaded_deck["name_key"] == "deck.opportunity.name"
    assert loaded_deck["cards"][0]["title_key"] == "card.chain.title"

    game = await client.post(
        "/api/v1/games",
        headers=owner_headers,
        json={"pack_id": pack_id, "version": "1.0.0"},
    )
    assert game.status_code == 201
    assert game.json()["pack_id"] == pack_id
    assert game.json()["pack_version"] == "1.0.0"
    assert "pack_snapshot" not in game.json()

    blocked_delete = await client.delete(
        f"/api/v1/board-projects/{project_id}",
        headers=owner_headers,
        params={"revision": 2},
    )
    assert blocked_delete.status_code == 409


async def test_board_assets_are_stored_validated_and_scoped(
    client: AsyncClient,
) -> None:
    owner_headers = await register(
        client,
        email="asset-owner@example.com",
        name="Asset Owner",
    )
    other_headers = await register(
        client,
        email="asset-other@example.com",
        name="Asset Other",
    )
    created = await client.post(
        "/api/v1/board-projects",
        headers=owner_headers,
        json={"name": "Tablero con assets", "document": board_document()},
    )
    assert created.status_code == 201
    project_id = created.json()["id"]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        '<path fill="currentColor" d="M2 2h20v20H2z"/></svg>'
    )

    uploaded = await client.post(
        f"/api/v1/board-projects/{project_id}/assets",
        headers=owner_headers,
        files={"file": ("marca.svg", svg, "image/svg+xml")},
    )
    assert uploaded.status_code == 201
    asset = uploaded.json()
    assert asset["name"] == "marca.svg"
    assert asset["path"] == f"/api/v1/board-assets/{asset['id']}.svg"

    listed = await client.get(
        f"/api/v1/board-projects/{project_id}/assets",
        headers=owner_headers,
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [asset["id"]]
    inaccessible = await client.get(
        f"/api/v1/board-projects/{project_id}/assets",
        headers=other_headers,
    )
    assert inaccessible.status_code == 404

    rendered = await client.get(asset["path"])
    assert rendered.status_code == 200
    assert rendered.headers["content-type"].startswith("image/svg+xml")
    assert rendered.headers["x-content-type-options"] == "nosniff"
    assert rendered.text == svg

    document = board_document()
    document["tiles"][0]["asset_path"] = asset["path"]  # type: ignore[index]
    updated = await client.patch(
        f"/api/v1/board-projects/{project_id}",
        headers=owner_headers,
        json={"revision": 1, "document": document},
    )
    assert updated.status_code == 200
    published = await client.post(
        f"/api/v1/board-projects/{project_id}/publish",
        headers=owner_headers,
        json={"revision": 2},
    )
    assert published.status_code == 201
    blocked_delete = await client.delete(
        f"/api/v1/board-projects/{project_id}/assets/{asset['id']}",
        headers=owner_headers,
    )
    assert blocked_delete.status_code == 409

    unsafe = await client.post(
        f"/api/v1/board-projects/{project_id}/assets",
        headers=owner_headers,
        files={
            "file": (
                "unsafe.svg",
                '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
                "image/svg+xml",
            )
        },
    )
    assert unsafe.status_code == 400
    assert "not allowed" in unsafe.json()["detail"]

    unused = await client.post(
        f"/api/v1/board-projects/{project_id}/assets",
        headers=owner_headers,
        files={"file": ("unused.svg", svg, "image/svg+xml")},
    )
    assert unused.status_code == 201
    deleted = await client.delete(
        f"/api/v1/board-projects/{project_id}/assets/{unused.json()['id']}",
        headers=owner_headers,
    )
    assert deleted.status_code == 204


async def test_delete_requires_the_current_revision(client: AsyncClient) -> None:
    headers = await register(
        client,
        email="delete-owner@example.com",
        name="Delete Owner",
    )
    created = await client.post(
        "/api/v1/board-projects",
        headers=headers,
        json={"name": "Temporal", "document": {}},
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/board-projects/{project_id}",
        headers=headers,
        json={"revision": 1, "description": "Revisión nueva"},
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2

    missing_revision = await client.delete(
        f"/api/v1/board-projects/{project_id}",
        headers=headers,
    )
    assert missing_revision.status_code == 422

    stale_revision = await client.delete(
        f"/api/v1/board-projects/{project_id}",
        headers=headers,
        params={"revision": 1},
    )
    assert stale_revision.status_code == 409

    deleted = await client.delete(
        f"/api/v1/board-projects/{project_id}",
        headers=headers,
        params={"revision": 2},
    )
    assert deleted.status_code == 204

    missing = await client.get(
        f"/api/v1/board-projects/{project_id}",
        headers=headers,
    )
    assert missing.status_code == 404


async def test_latest_published_board_is_selected_by_semantic_version(
    session: AsyncSession,
    packs_dir: Path,
) -> None:
    users = UserService(session)
    owner = await users.register(
        UserCreate(
            email="version-owner@example.com",
            password="correct-horse-battery",
            display_name="Version Owner",
            locale="es",
        )
    )
    projects = BoardProjectService(session)
    draft = await projects.create(
        owner.id,
        BoardProjectCreate(name="Versioned board", document=board_document()),
    )
    first = await projects.publish(
        draft.id,
        owner.id,
        PublishBoardRequest(revision=draft.revision),
    )
    updated = await projects.update(
        draft.id,
        owner.id,
        BoardProjectUpdate(
            revision=draft.revision,
            description="Segunda versión",
        ),
    )
    second = await projects.publish(
        draft.id,
        owner.id,
        PublishBoardRequest(revision=updated.revision),
    )
    assert first.version == "1.0.0"
    assert second.version == "1.0.1"

    records = list(
        (
            await session.scalars(
                select(BoardVersionRecord).where(
                    BoardVersionRecord.project_id == draft.id
                )
            )
        ).all()
    )
    by_version = {record.version: record for record in records}
    by_version["1.0.0"].published_at = datetime(2030, 1, 1, tzinfo=UTC)
    by_version["1.0.1"].published_at = datetime(2020, 1, 1, tzinfo=UTC)
    await session.commit()

    latest_project = await projects.get(draft.id, owner.id)
    assert latest_project.published_version == "1.0.1"
    assert [
        version.version
        for version in await projects.list_versions(draft.id, owner.id)
    ] == ["1.0.1", "1.0.0"]

    resolver = PackResolver(session, PackLoader(packs_dir))
    assert (await resolver.load(first.pack_id)).manifest.version == "1.0.1"
    listed = {manifest.id: manifest for manifest in await resolver.list()}
    assert listed[first.pack_id].version == "1.0.1"


async def create_published_game(
    session: AsyncSession,
    packs_dir: Path,
    *,
    dice: tuple[int, int],
    document: dict[str, object] | None = None,
) -> tuple[GameService, UUID, UUID]:
    users = UserService(session)
    owner = await users.register(
        UserCreate(
            email="runtime-owner@example.com",
            password="correct-horse-battery",
            display_name="Owner",
            locale="es",
        )
    )
    guest = await users.register(
        UserCreate(
            email="runtime-guest@example.com",
            password="correct-horse-battery",
            display_name="Guest",
            locale="es",
        )
    )
    projects = BoardProjectService(session)
    draft = await projects.create(
        owner.id,
        BoardProjectCreate(
            name="Runtime board",
            document=document or board_document(),
        ),
    )
    published = await projects.publish(
        draft.id,
        owner.id,
        PublishBoardRequest(revision=draft.revision),
    )
    filesystem = PackLoader(packs_dir)
    games = GameService(
        session,
        filesystem,
        pack_resolver=PackResolver(session, filesystem),
        dice_roller=lambda: dice,
        card_shuffler=lambda card_ids: card_ids,
    )
    game = await games.create(
        published.pack_id,
        owner,
        published.version,
    )
    await games.join(game.id, guest)
    await games.start(game.id, owner.id)
    return games, game.id, owner.id


async def test_hotel_cost_is_distinct_and_falls_back_to_build_cost(
    session: AsyncSession,
    packs_dir: Path,
) -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[1]["hotel_cost"] = 300
    games, game_id, owner_id = await create_published_game(
        session,
        packs_dir,
        dice=(1, 1),
        document=document,
    )
    group_ids = ["tile_01", "tile_09"]
    async with session.begin():
        persisted = await GameRepository(session).get(game_id, for_update=True)
        for property_id in group_ids:
            persisted.owners[property_id] = owner_id
            persisted.building_levels[property_id] = 4
        await GameRepository(session).save(persisted, len(persisted.events))

    game = await games.execute(
        game_id,
        owner_id,
        BuildPropertyCommand(action="build_property", property_id="tile_01"),
    )
    assert game.current_player is not None
    assert game.current_player.balance == 700
    assert game.events[-1].data["amount"] == 300

    game = await games.execute(
        game_id,
        owner_id,
        BuildPropertyCommand(action="build_property", property_id="tile_09"),
    )
    assert game.current_player is not None
    assert game.current_player.balance == 650
    assert game.events[-1].data["amount"] == 50

    game = await games.execute(
        game_id,
        owner_id,
        SellBuildingCommand(action="sell_building", property_id="tile_01"),
    )
    assert game.current_player is not None
    assert game.current_player.balance == 800
    assert game.events[-1].data["amount"] == 150

    game = await games.execute(
        game_id,
        owner_id,
        SellBuildingCommand(action="sell_building", property_id="tile_09"),
    )
    assert game.current_player is not None
    assert game.current_player.balance == 825
    assert game.events[-1].data["amount"] == 25
    assert game.pack_snapshot is not None
    snapshot_tiles = {tile.id: tile for tile in game.pack_snapshot.board.tiles}
    assert snapshot_tiles["tile_01"].hotel_cost == 300
    assert snapshot_tiles["tile_09"].hotel_cost is None
    snapshot_deck = game.pack_snapshot.board.decks[0]
    assert snapshot_deck.name_key == "deck.opportunity.name"
    assert snapshot_deck.cards[0].title_key == "card.chain.title"


async def test_custom_transport_landing_effect_moves_and_applies_destination_effect(
    session: AsyncSession,
    packs_dir: Path,
) -> None:
    games, game_id, owner_id = await create_published_game(
        session,
        packs_dir,
        dice=(1, 1),
    )

    game = await games.execute(game_id, owner_id, RollCommand(action="roll"))

    assert game.current_player is not None
    assert game.current_player.position == 3
    assert game.current_player.balance == 1015
    assert any(
        event.type == "card.player_moved"
        and event.data["card_id"] == "tile_02"
        for event in game.events
    )


async def test_custom_card_executes_all_safe_chained_effects(
    session: AsyncSession,
    packs_dir: Path,
) -> None:
    games, game_id, owner_id = await create_published_game(
        session,
        packs_dir,
        dice=(3, 3),
    )

    game = await games.execute(game_id, owner_id, RollCommand(action="roll"))

    assert game.current_player is not None
    assert game.current_player.position == 6
    assert game.current_player.balance == 1030
    applied = [
        event.data["amount"]
        for event in game.events
        if event.type == "card.cash_applied"
    ]
    assert applied == [10, 20]


async def test_movement_destination_can_draw_and_resolve_another_card_tile(
    session: AsyncSession,
    packs_dir: Path,
) -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[2]["landing_effects"] = [
        {
            "type": "move_to",
            "tile_id": "tile_06",
            "collect_start": False,
        }
    ]
    games, game_id, owner_id = await create_published_game(
        session,
        packs_dir,
        dice=(1, 1),
        document=document,
    )

    game = await games.execute(game_id, owner_id, RollCommand(action="roll"))

    assert game.current_player is not None
    assert game.current_player.position == 6
    assert game.current_player.balance == 1030
    assert game.last_card_id == "chain_reward"


def test_custom_board_rejects_silently_ignored_landing_effects() -> None:
    purchasable = board_document()
    purchasable_tiles = cast(
        list[dict[str, object]],
        purchasable["tiles"],
    )
    purchasable_tiles[1]["landing_effects"] = [{"type": "cash", "amount": 1}]
    with pytest.raises(ValidationError, match="landing_effects"):
        EditablePackContent.model_validate(purchasable)

    jail_card = board_document()
    jail_tiles = cast(list[dict[str, object]], jail_card["tiles"])
    jail_tiles[3]["landing_effects"] = [{"type": "get_out_of_jail"}]
    with pytest.raises(ValidationError, match="only valid inside a card"):
        EditablePackContent.model_validate(jail_card)

    unknown_field = board_document()
    unknown_field["side_lenght"] = 5
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        EditablePackContent.model_validate(unknown_field)


def test_custom_board_preserves_tile_icon_presentation() -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[0]["icon"] = "star"
    tiles[0]["icon_background"] = "none"
    tiles[0]["asset_path"] = "/assets/monopoly-santiago/svg/c01_salida.svg"

    content = EditablePackContent.model_validate(document)
    pack = content.to_pack(pack_id="custom-icon-board", version="1.0.0")

    assert content.tiles[0].icon == "star"
    assert content.tiles[0].icon_background == "none"
    assert content.tiles[0].asset_path == (
        "/assets/monopoly-santiago/svg/c01_salida.svg"
    )
    assert pack.board.tiles[0].icon == "star"
    assert pack.board.tiles[0].icon_background == "none"
    assert pack.board.tiles[0].asset_path == (
        "/assets/monopoly-santiago/svg/c01_salida.svg"
    )


def test_custom_board_rejects_external_tile_assets() -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[0]["asset_path"] = "https://example.com/tile.svg"

    with pytest.raises(ValidationError, match="asset_path"):
        EditablePackContent.model_validate(document)


@pytest.mark.parametrize(
    "missing_key",
    ["deck.opportunity.name", "card.chain.title"],
)
def test_custom_board_requires_optional_deck_and_card_i18n_keys(
    missing_key: str,
) -> None:
    document = board_document()
    messages = cast(dict[str, dict[str, str]], document["messages"])
    messages["es"].pop(missing_key)

    with pytest.raises(ValidationError, match=missing_key):
        EditablePackContent.model_validate(document)


def test_custom_board_accepts_percentage_tax_based_on_net_worth() -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tax_tile = tiles[13]
    tax_tile.pop("amount")
    tax_tile["net_worth_percent"] = 10

    content = EditablePackContent.model_validate(document)

    assert content.tiles[13].amount is None
    assert content.tiles[13].net_worth_percent == 10


@pytest.mark.parametrize(
    "tax_fields",
    [{}, {"amount": 100, "net_worth_percent": 10}],
)
def test_custom_board_requires_one_tax_calculation(
    tax_fields: dict[str, int],
) -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[13].pop("amount")
    tiles[13].update(tax_fields)

    with pytest.raises(ValidationError, match="exactly one"):
        EditablePackContent.model_validate(document)


@pytest.mark.parametrize(
    ("tile_index", "field", "value", "message"),
    [
        (3, "purchasable", True, "'free' tiles cannot define: purchasable"),
        (6, "amount", 10, "'card' tiles cannot define: amount"),
        (1, "deck_id", "opportunity", "'property' tiles cannot define: deck_id"),
        (10, "build_cost", 50, "'utility' tiles cannot define: build_cost"),
        (10, "hotel_cost", 200, "'utility' tiles cannot define: hotel_cost"),
        (
            2,
            "price",
            100,
            "non-purchasable transports and utilities",
        ),
    ],
)
def test_custom_board_rejects_fields_that_do_not_apply_to_the_tile_kind(
    tile_index: int,
    field: str,
    value: object,
    message: str,
) -> None:
    document = board_document()
    tiles = cast(list[dict[str, object]], document["tiles"])
    tiles[tile_index][field] = value

    with pytest.raises(ValidationError, match=message):
        EditablePackContent.model_validate(document)


@pytest.mark.parametrize(
    "first_effect",
    [
        {"type": "cash", "amount": -10},
        {"type": "cash_each", "amount": -10},
        {"type": "repairs", "house_amount": 10, "hotel_amount": 20},
        {"type": "move_relative", "steps": 1, "collect_start": False},
        {"type": "go_to_jail"},
    ],
)
def test_custom_board_requires_suspensive_effects_to_be_terminal(
    first_effect: dict[str, object],
) -> None:
    document = board_document()
    decks = cast(list[dict[str, object]], document["decks"])
    cards = cast(list[dict[str, object]], decks[0]["cards"])
    cards[0]["effects"] = [
        first_effect,
        {"type": "cash", "amount": 5},
    ]

    with pytest.raises(ValidationError, match="must be terminal"):
        EditablePackContent.model_validate(document)


def test_custom_board_accepts_a_30_by_30_perimeter() -> None:
    side_length = 30
    tile_count = side_length * 4 - 4
    corner_kinds = {
        0: "start",
        side_length - 1: "jail",
        2 * (side_length - 1): "free",
        3 * (side_length - 1): "go_to_jail",
    }
    tiles = [
        {
            "id": f"tile_{position:03}",
            "kind": corner_kinds.get(position, "free"),
            "name_key": f"tile.{position:03}.name",
        }
        for position in range(tile_count)
    ]
    document = {
        "schema_version": 5,
        "name_key": "pack.name",
        "side_length": side_length,
        "default_locale": "es",
        "messages": {
            "es": {
                "pack.name": "Tablero 30",
                **{
                    f"tile.{position:03}.name": f"Casilla {position}"
                    for position in range(tile_count)
                },
            }
        },
        "groups": [],
        "tiles": tiles,
        "decks": [],
    }

    content = EditablePackContent.model_validate(document)

    assert content.side_length == 30
    assert len(content.tiles) == 116
