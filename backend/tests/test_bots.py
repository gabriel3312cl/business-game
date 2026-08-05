from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import business_game.realtime as realtime
from business_game.application.bots import BotAction, BotPolicy
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError, ForbiddenError
from business_game.domain.models import (
    AcceptTradeCommand,
    AddBotRequest,
    AuctionState,
    BidCommand,
    BotController,
    BotPersonality,
    BuildPropertyCommand,
    BuyPropertyCommand,
    CancelTradeCommand,
    DebtReason,
    DebtState,
    GameEvent,
    GameStatus,
    MortgagePropertyCommand,
    PassAuctionCommand,
    PlayerState,
    ProposeTradeCommand,
    RejectTradeCommand,
    RollCommand,
    SellBuildingCommand,
    TradeOffer,
    TurnPhase,
    UserCreate,
)
from business_game.infrastructure.repositories import GameRepository


async def create_user(session: AsyncSession, email: str, display_name: str):
    return await UserService(session).register(
        UserCreate(
            email=email,
            password="correct-horse-battery",
            display_name=display_name,
        )
    )


async def register_and_login(client: AsyncClient, email: str) -> dict[str, str]:
    created = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": "Host",
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


async def test_bot_http_contract(client: AsyncClient) -> None:
    headers = await register_and_login(client, "bot-api@example.com")
    created = await client.post(
        "/api/v1/games",
        headers=headers,
        json={"pack_id": "classic-demo"},
    )
    game_id = created.json()["id"]

    added = await client.post(
        f"/api/v1/games/{game_id}/bots",
        headers=headers,
        json={
            "controller": "ai",
            "personality": "aggressive",
            "display_name": "Audaz",
        },
    )

    assert added.status_code == 201
    bot = added.json()["players"][-1]
    assert bot["is_bot"] is True
    assert bot["bot_personality"] == "aggressive"
    assert bot["bot_controller"] == "ai"
    assert bot["display_name"] == "Audaz"

    removed = await client.delete(
        f"/api/v1/games/{game_id}/bots/{bot['user_id']}",
        headers=headers,
    )
    assert removed.status_code == 200
    assert all(player["user_id"] != bot["user_id"] for player in removed.json()["players"])


async def test_host_can_add_and_remove_personality_bots(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "bot-host@example.com", "Host")
    guest = await create_user(session, "bot-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    await games.join(game.id, guest)

    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(personality=BotPersonality.NEGOTIATOR),
    )
    bot = game.players[-1]
    assert bot.is_bot
    assert bot.bot_personality is BotPersonality.NEGOTIATOR
    assert bot.display_name == "Bot Negociador"
    assert game.events[-1].data["is_bot"] is True

    with pytest.raises(ForbiddenError, match="only the host"):
        await games.remove_bot(game.id, guest.id, bot.user_id)

    game = await games.remove_bot(game.id, host.id, bot.user_id)
    assert all(player.user_id != bot.user_id for player in game.players)
    assert game.events[-1].type == "player.left"


def test_old_bot_snapshots_default_to_standard_controller() -> None:
    bot = PlayerState.model_validate(
        {
            "user_id": "6c35eb0a-d48e-441d-9f37-f915a4947460",
            "display_name": "Bot antiguo",
            "is_bot": True,
            "bot_personality": "balanced",
        }
    )

    assert bot.bot_controller is BotController.STANDARD


@pytest.mark.parametrize("pack_id", ["classic-demo", "extended-demo"])
async def test_personalities_make_distinct_purchase_decisions(
    packs_dir: Path,
    session: AsyncSession,
    pack_id: str,
) -> None:
    host = await create_user(session, "purchase-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create(pack_id, host)
    pack = PackLoader(packs_dir).load(pack_id)
    tile = next(tile for tile in pack.board.tiles if tile.is_purchasable)
    policy = BotPolicy()

    game.status = GameStatus.PLAYING
    game.phase = TurnPhase.BUY_DECISION
    game.pending_tile_id = tile.id
    for personality, expected_type in (
        (BotPersonality.CONSERVATIVE, type(None)),
        (BotPersonality.AGGRESSIVE, BuyPropertyCommand),
    ):
        bot = PlayerState(
            user_id=host.id,
            display_name="Bot",
            is_bot=True,
            bot_personality=personality,
            balance=pack.manifest.starting_balance,
        )
        game.players = [bot]
        game.current_player_index = 0
        action = policy.choose_action(game, pack)
        assert action is not None
        if expected_type is type(None):
            assert not isinstance(action.command, BuyPropertyCommand)
        else:
            assert isinstance(action.command, expected_type)


async def test_personalities_bid_to_different_valuation_limits(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "auction-bot-host@example.com", "Host")
    game = await GameService(session, PackLoader(packs_dir)).create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    tile = next(tile for tile in pack.board.tiles if tile.is_purchasable and tile.price)
    human = PlayerState(user_id=game.id, display_name="Human")
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.CONSERVATIVE,
    )
    game.players = [bot, human]
    game.status = GameStatus.PLAYING
    game.active_auction = AuctionState(
        property_id=tile.id,
        current_bid=tile.price or 0,
        eligible_player_ids=[bot.user_id, human.user_id],
    )

    conservative = BotPolicy().choose_action(game, pack)
    assert conservative is not None
    assert isinstance(conservative.command, PassAuctionCommand)

    bot.bot_personality = BotPersonality.AGGRESSIVE
    aggressive = BotPolicy().choose_action(game, pack)
    assert aggressive is not None
    assert isinstance(aggressive.command, BidCommand)
    assert aggressive.command.amount > game.active_auction.current_bid


async def test_bot_builds_evenly_on_complete_group(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "builder-bot-host@example.com", "Host")
    game = await GameService(session, PackLoader(packs_dir)).create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    group_tile = next(tile for tile in pack.board.tiles if tile.group is not None)
    group = [tile for tile in pack.board.tiles if tile.group == group_tile.group]
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.AGGRESSIVE,
        balance=pack.manifest.starting_balance,
    )
    game.players = [bot, PlayerState(user_id=game.id, display_name="Human")]
    game.status = GameStatus.PLAYING
    game.phase = TurnPhase.WAITING_FOR_END
    game.houses_remaining = pack.manifest.house_supply
    for tile in group:
        game.owners[tile.id] = bot.user_id

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, BuildPropertyCommand)
    assert action.command.property_id in {tile.id for tile in group}


async def test_bot_accepts_profitable_trade_and_rejects_bad_trade(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "trade-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
    )
    other = PlayerState(user_id=game.id, display_name="Human")
    game.players = [other, bot]
    game.status = GameStatus.PLAYING
    policy = BotPolicy()

    profitable = TradeOffer(
        proposer_id=other.user_id,
        recipient_id=bot.user_id,
        offered_cash=500,
        requested_cash=0,
    )
    game.trades = [profitable]
    action = policy.choose_action(game, pack)
    assert action is not None
    assert isinstance(action.command, AcceptTradeCommand)

    bad = TradeOffer(
        proposer_id=other.user_id,
        recipient_id=bot.user_id,
        offered_cash=1,
        requested_cash=500,
    )
    game.trades = [bad]
    action = policy.choose_action(game, pack)
    assert action is not None
    assert isinstance(action.command, RejectTradeCommand)


async def test_bot_cancels_unanswered_trade_after_two_of_its_turns(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "stale-trade-host@example.com", "Host")
    game = await GameService(session, PackLoader(packs_dir)).create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.NEGOTIATOR,
    )
    other = PlayerState(user_id=game.id, display_name="Human")
    trade = TradeOffer(
        proposer_id=bot.user_id,
        recipient_id=other.user_id,
        offered_cash=100,
    )
    game.players = [other, bot]
    game.status = GameStatus.PLAYING
    game.trades = [trade]
    game.events = [
        GameEvent(
            sequence=1,
            type="trade.proposed",
            data={"trade_id": str(trade.id), "proposer_id": str(bot.user_id)},
        ),
        GameEvent(
            sequence=2,
            type="turn.started",
            data={"player_id": str(bot.user_id)},
        ),
        GameEvent(
            sequence=3,
            type="turn.started",
            data={"player_id": str(bot.user_id)},
        ),
    ]

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, CancelTradeCommand)


async def test_bot_proposes_profitable_group_completion_trade(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "proposal-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    grouped = [tile for tile in pack.board.tiles if tile.group is not None]
    group_id = grouped[0].group
    group = [tile for tile in grouped if tile.group == group_id]
    assert len(group) > 1
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.NEGOTIATOR,
        balance=pack.manifest.starting_balance,
    )
    other = PlayerState(user_id=game.id, display_name="Human")
    game.players = [other, bot]
    game.current_player_index = 1
    game.status = GameStatus.PLAYING
    game.phase = TurnPhase.WAITING_FOR_END
    game.events = [
        GameEvent(
            sequence=1,
            type="turn.started",
            data={"player_id": str(bot.user_id)},
        )
    ]
    for tile in group[:-1]:
        game.owners[tile.id] = bot.user_id
    game.owners[group[-1].id] = other.user_id

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, ProposeTradeCommand)
    assert action.command.recipient_id == other.user_id
    assert action.command.requested_property_ids == [group[-1].id]
    assert 0 < action.command.offered_cash < pack.manifest.starting_balance


async def test_bot_liquidates_buildings_then_mortgages_for_debt(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "debt-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    pack = PackLoader(packs_dir).load("classic-demo")
    group_tile = next(tile for tile in pack.board.tiles if tile.group is not None)
    group = [tile for tile in pack.board.tiles if tile.group == group_tile.group]
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
        balance=0,
    )
    game.players = [bot, PlayerState(user_id=game.id, display_name="Other")]
    game.status = GameStatus.PLAYING
    for tile in group:
        game.owners[tile.id] = bot.user_id
        game.building_levels[tile.id] = 1
    game.active_debt = DebtState(
        debtor_id=bot.user_id,
        amount=500,
        reason=DebtReason.TAX,
        tile_id="tax",
    )
    action = BotPolicy().choose_action(game, pack)
    assert action is not None
    assert isinstance(action.command, SellBuildingCommand)

    game.building_levels.clear()
    action = BotPolicy().choose_action(game, pack)
    assert action is not None
    assert isinstance(action.command, MortgagePropertyCommand)


async def test_runner_fallback_ends_turn_after_repeated_invalid_decision(
    packs_dir: Path,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host = await create_user(session, "safeguard-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(personality=BotPersonality.BALANCED),
    )
    bot = game.players[-1]
    await games.start(game.id, host.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.current_player_index = 1
        persisted.phase = TurnPhase.WAITING_FOR_END
        await GameRepository(session).save(persisted, previous_sequence)

    runner_sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    monkeypatch.setattr(realtime, "session_factory", runner_sessions)
    monkeypatch.setattr(realtime, "BOT_ACTION_DELAY_SECONDS", 0)

    def invalid_action(_policy, _game, _pack):
        return BotAction(
            bot.user_id,
            BuyPropertyCommand(action="buy_property"),
            "intentionally_invalid",
        )

    monkeypatch.setattr(BotPolicy, "choose_action", invalid_action)

    async def ignore_broadcast(_game):
        return None

    monkeypatch.setattr(realtime, "_broadcast_game_state", ignore_broadcast)
    await realtime._run_bot_runner(game.id)

    async with runner_sessions() as persisted_session:
        updated = await GameRepository(persisted_session).get(game.id)
    assert updated.current_player is not None
    assert updated.current_player.user_id == host.id
    assert any(event.type == "turn.started" for event in updated.events)


async def test_runner_uses_fallback_when_policy_crashes(
    packs_dir: Path,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host = await create_user(session, "policy-crash-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(personality=BotPersonality.BALANCED),
    )
    await games.start(game.id, host.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.current_player_index = 1
        persisted.phase = TurnPhase.WAITING_FOR_END
        await GameRepository(session).save(persisted, previous_sequence)

    runner_sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    monkeypatch.setattr(realtime, "session_factory", runner_sessions)
    monkeypatch.setattr(realtime, "BOT_ACTION_DELAY_SECONDS", 0)

    def crash_policy(_policy, _game, _pack):
        raise RuntimeError("broken policy")

    monkeypatch.setattr(BotPolicy, "choose_action", crash_policy)

    async def ignore_broadcast(_game):
        return None

    monkeypatch.setattr(realtime, "_broadcast_game_state", ignore_broadcast)
    await realtime._run_bot_runner(game.id)

    async with runner_sessions() as persisted_session:
        updated = await GameRepository(persisted_session).get(game.id)
    assert updated.current_player is not None
    assert updated.current_player.user_id == host.id


async def test_runner_uses_standard_policy_when_ai_bot_fails(
    packs_dir: Path,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host = await create_user(session, "ai-fallback-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(
            controller=BotController.AI,
            personality=BotPersonality.BALANCED,
        ),
    )
    await games.start(game.id, host.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.current_player_index = 1
        persisted.phase = TurnPhase.WAITING_FOR_END
        await GameRepository(session).save(persisted, previous_sequence)

    runner_sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    monkeypatch.setattr(realtime, "session_factory", runner_sessions)
    monkeypatch.setattr(realtime, "BOT_ACTION_DELAY_SECONDS", 0)

    async def fail_ai(*_args, **_kwargs):
        raise realtime.AiBotDecisionError("provider failed")

    monkeypatch.setattr(realtime.AiBotPolicy, "choose_action", fail_ai)

    async def ignore_broadcast(_game):
        return None

    monkeypatch.setattr(realtime, "_broadcast_game_state", ignore_broadcast)
    await realtime._run_bot_runner(game.id)

    async with runner_sessions() as persisted_session:
        updated = await GameRepository(persisted_session).get(game.id)
    assert updated.current_player is not None
    assert updated.current_player.user_id == host.id


async def test_bot_refusal_reaches_the_activity_feed_with_its_reason(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "feed-reason-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(personality=BotPersonality.BALANCED),
    )
    bot = game.players[-1]
    game = await games.start(game.id, host.id)
    game = await games.execute(
        game.id,
        host.id,
        ProposeTradeCommand(
            action="propose_trade",
            recipient_id=bot.user_id,
            requested_cash=900,
        ),
    )
    trade_id = game.trades[-1].id

    game = await games.execute(
        game.id,
        bot.user_id,
        RejectTradeCommand(action="reject_trade", trade_id=trade_id),
        automation_reason="reject_liquidity_risk",
        automation_note="Me deja sin caja para la renta",
    )

    refusal = game.events[-1]
    assert refusal.type == "trade.rejected"
    assert refusal.data["bot_reason"] == "reject_liquidity_risk"
    assert refusal.data["bot_note"] == "Me deja sin caja para la renta"
    assert all(
        "bot_reason" not in event.data
        for event in game.events
        if not event.type.startswith("trade.")
    )


async def test_automated_command_rejects_stale_sequence(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "sequence-host@example.com", "Host")
    games = GameService(session, PackLoader(packs_dir), dice_roller=lambda: (1, 2))
    game = await games.create("classic-demo", host)
    game = await games.add_bot(
        game.id,
        host.id,
        AddBotRequest(personality=BotPersonality.BALANCED),
    )
    game = await games.start(game.id, host.id)
    observed_sequence = len(game.events)
    await games.execute(
        game.id,
        host.id,
        RollCommand(action="roll"),
        expected_sequence=observed_sequence,
    )

    with pytest.raises(ConflictError, match="game changed"):
        await games.execute(
            game.id,
            host.id,
            RollCommand(action="roll"),
            expected_sequence=observed_sequence,
        )
