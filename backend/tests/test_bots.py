import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import business_game.realtime as realtime
from business_game.application.bots import BotAction, BotPolicy
from business_game.application.economy import initialize_bank
from business_game.application.pack_loader import PackLoader
from business_game.application.services import (
    FUN_BOT_NAMES,
    FUN_BOT_NAMES_BY_PERSONALITY,
    GameService,
    UserService,
)
from business_game.domain.errors import ConflictError, ForbiddenError
from business_game.domain.models import (
    AcceptTradeCommand,
    AddBotRequest,
    AuctionState,
    BankLoanState,
    BankState,
    BidCommand,
    BotController,
    BotPersonality,
    BuildGroupRoundCommand,
    BuyPropertyCommand,
    BuySharesCommand,
    CancelTradeCommand,
    CardPaymentState,
    DebtReason,
    DebtState,
    DeclinePropertyCommand,
    GameEvent,
    GameSettings,
    GameState,
    GameStatus,
    MortgagePropertyCommand,
    OptionalRules,
    OptionalRulesUpdate,
    PassAuctionCommand,
    PayDebtCommand,
    PlayerState,
    ProposeRentDebtPlanCommand,
    ProposeTradeCommand,
    RejectRentDebtPlanCommand,
    RejectTradeCommand,
    RentDebtPlanProposal,
    RentDebtPlanTemplate,
    RequestLoanCommand,
    RollCommand,
    SellGroupRoundCommand,
    SetPropertyTradeAvailabilityCommand,
    TradeOffer,
    TurnPhase,
    UpdateGameSettingsRequest,
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

    configured = await client.patch(
        f"/api/v1/games/{game_id}/settings",
        headers=headers,
        json={"max_players": 4},
    )
    assert configured.status_code == 200
    filled = await client.post(
        f"/api/v1/games/{game_id}/bots/fill",
        headers=headers,
    )
    assert filled.status_code == 201
    players = filled.json()["players"]
    assert len(players) == 4
    assert len([player for player in players if player["is_bot"]]) == 3


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
    assert bot.display_name in FUN_BOT_NAMES_BY_PERSONALITY[BotPersonality.NEGOTIATOR]
    assert len({player.appearance_slot for player in game.players}) == 3
    assert game.events[-1].data["is_bot"] is True

    with pytest.raises(ForbiddenError, match="only the host"):
        await games.remove_bot(game.id, guest.id, bot.user_id)

    game = await games.remove_bot(game.id, host.id, bot.user_id)
    assert all(player.user_id != bot.user_id for player in game.players)
    assert game.events[-1].type == "player.left"


async def test_host_can_fill_every_open_slot_with_random_personality_bots(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "fill-bots-host@example.com", "Host")
    guest = await create_user(session, "fill-bots-guest@example.com", "Guest")
    games = GameService(session, PackLoader(packs_dir))
    game = await games.create("classic-demo", host)
    game = await games.join(game.id, guest)
    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(max_players=6),
    )

    with pytest.raises(ForbiddenError, match="only the host"):
        await games.fill_with_random_bots(game.id, guest.id)

    game = await games.fill_with_random_bots(game.id, host.id)
    bots = [player for player in game.players if player.is_bot]

    assert len(game.players) == 6
    assert len(bots) == 4
    assert all(bot.bot_controller is BotController.STANDARD for bot in bots)
    assert all(bot.bot_personality in set(BotPersonality) for bot in bots)
    assert all(bot.display_name in FUN_BOT_NAMES for bot in bots)
    assert len({bot.display_name for bot in bots}) == len(bots)
    assert len({player.appearance_slot for player in game.players}) == 6

    with pytest.raises(ConflictError, match="full"):
        await games.fill_with_random_bots(game.id, host.id)


async def test_lobby_accepts_twenty_players_and_rejects_twenty_first(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "twenty-players@example.com", "Host")
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (1, 2),
    )
    game = await games.create("classic-demo", host)

    for index in range(19):
        game = await games.add_bot(
            game.id,
            host.id,
            AddBotRequest(display_name=f"Bot {index + 1}"),
        )

    assert len(game.players) == 20
    assert {player.appearance_slot for player in game.players} == set(range(20))
    with pytest.raises(ConflictError, match="full"):
        await games.add_bot(game.id, host.id, AddBotRequest(display_name="Bot 20"))

    game = await games.update_settings(
        game.id,
        host.id,
        UpdateGameSettingsRequest(
            rules=OptionalRulesUpdate(stock_market_enabled=True),
        ),
    )
    game = await games.start(game.id, host.id)
    assert game.bank.monetary_base == 68_600
    assert {item.total_shares for item in game.bank.investments} == {67}
    started = next(event for event in game.events if event.type == "game.started")
    assert started.data["player_count"] == 20
    assert started.data["market_share_supply"] == 67
    await games.execute(game.id, host.id, RollCommand(action="roll"))
    game = await games.execute(
        game.id,
        host.id,
        DeclinePropertyCommand(action="decline_property"),
    )

    assert game.active_auction is not None
    assert len(game.active_auction.eligible_player_ids) == 20


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


def test_twenty_player_snapshots_accept_player_scaled_collections() -> None:
    player_ids = [uuid4() for _ in range(20)]
    game = GameState(
        host_user_id=player_ids[0],
        pack_id="classic-demo",
        pack_version="2.0.0",
        players=[
            PlayerState(user_id=player_id, display_name=f"Player {index + 1}")
            for index, player_id in enumerate(player_ids)
        ],
        active_auction=AuctionState(
            property_id="property_03",
            eligible_player_ids=player_ids,
            passed_player_ids=player_ids,
        ),
        pending_card_payments=[
            CardPaymentState(
                payer_id=player_id,
                recipient_id=player_ids[(index + 1) % len(player_ids)],
                amount=1,
                card_id="player_scaled_payment",
            )
            for index, player_id in enumerate(player_ids)
        ],
        bank=BankState(
            loans=[
                BankLoanState(
                    player_id=player_id,
                    principal=1,
                    interest_amount=0,
                    remaining_balance=1,
                    installment_amount=1,
                    installments_remaining=1,
                    issued_at_sequence=0,
                )
                for player_id in player_ids
            ]
        ),
    )

    assert len(game.active_auction.eligible_player_ids) == 20
    assert len(game.pending_card_payments) == 20
    assert len(game.bank.loans) == 20


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


def test_bot_borrows_to_resolve_debt_when_credit_is_convenient(
    packs_dir: Path,
) -> None:
    pack = PackLoader(packs_dir).load("classic-demo")
    bot = PlayerState(
        user_id=uuid4(),
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
        balance=0,
    )
    game = GameState(
        host_user_id=bot.user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        phase=TurnPhase.WAITING_FOR_END,
        players=[bot],
        settings=GameSettings(
            rules=OptionalRules(loans_enabled=True, stock_market_enabled=True)
        ),
        active_debt=DebtState(
            debtor_id=bot.user_id,
            amount=50,
            reason=DebtReason.RENT,
            tile_id="property_01",
        ),
    )
    initialize_bank(game, pack)

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, RequestLoanCommand)
    assert action.command.amount == 50


def test_bot_waits_for_human_creditor_rent_choice(packs_dir: Path) -> None:
    pack = PackLoader(packs_dir).load("classic-demo")
    creditor = PlayerState(user_id=uuid4(), display_name="Creditor")
    debtor = PlayerState(
        user_id=uuid4(),
        display_name="Bot debtor",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
        balance=100,
    )
    game = GameState(
        host_user_id=creditor.user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        players=[debtor, creditor],
        settings=GameSettings(
            rules=OptionalRules(custom_rent_debts_enabled=True)
        ),
        active_debt=DebtState(
            debtor_id=debtor.user_id,
            creditor_id=creditor.user_id,
            amount=50,
            reason=DebtReason.RENT,
            tile_id="property_01",
        ),
    )

    assert BotPolicy().choose_action(game, pack) is None

    game.active_debt.reason = DebtReason.RENT_INSTALLMENT
    assert BotPolicy().choose_action(game, pack) is None
    game.active_debt.reason = DebtReason.RENT

    requested_property = next(tile for tile in pack.board.tiles if tile.is_purchasable)
    game.owners[requested_property.id] = debtor.user_id
    game.active_debt.amount = 1
    game.active_debt.plan_proposal = RentDebtPlanProposal(
        installments=0,
        interest_percent=0,
        template=RentDebtPlanTemplate.CUSTOM,
        requested_property_ids=[requested_property.id],
    )
    action = BotPolicy().choose_action(game, pack)
    assert action is not None
    assert isinstance(action.command, RejectRentDebtPlanCommand)
    game.active_debt.plan_proposal = None

    creditor.is_bot = True
    creditor.bot_personality = BotPersonality.BALANCED
    action = BotPolicy().choose_action(game, pack)
    assert action is not None
    assert action.actor_id == creditor.user_id
    assert isinstance(action.command, ProposeRentDebtPlanCommand)
    assert action.command.installments == 3
    assert action.command.interest_percent == 5

    creditor.is_bot = False
    game.active_debt.collection_demanded = True
    action = BotPolicy().choose_action(game, pack)
    assert action is not None
    assert action.actor_id == debtor.user_id
    assert isinstance(action.command, PayDebtCommand)


def test_bot_invests_only_surplus_cash_at_a_fair_price(packs_dir: Path) -> None:
    pack = PackLoader(packs_dir).load("classic-demo")
    bot = PlayerState(
        user_id=uuid4(),
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
        balance=pack.manifest.starting_balance,
    )
    game = GameState(
        host_user_id=bot.user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        phase=TurnPhase.WAITING_FOR_END,
        players=[bot],
        settings=GameSettings(
            rules=OptionalRules(loans_enabled=True, stock_market_enabled=True)
        ),
    )
    initialize_bank(game, pack)

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, BuySharesCommand)
    assert 1 < action.command.quantity <= 6


def test_ai_auction_timeout_preserves_time_for_the_fallback() -> None:
    now = datetime(2026, 8, 6, tzinfo=UTC)
    bot_id = UUID("6c35eb0a-d48e-441d-9f37-f915a4947460")
    human_id = UUID("c530a4f5-c88a-4098-9f67-d5590636db56")
    game = GameState(
        host_user_id=human_id,
        pack_id="classic-demo",
        pack_version="1.0.0",
        status=GameStatus.PLAYING,
        players=[
            PlayerState(
                user_id=bot_id,
                display_name="Bot",
                is_bot=True,
                bot_personality=BotPersonality.BALANCED,
            ),
            PlayerState(user_id=human_id, display_name="Human"),
        ],
        active_auction=AuctionState(
            property_id="property_1",
            eligible_player_ids=[bot_id, human_id],
            bid_deadline=now + timedelta(seconds=5),
        ),
    )

    assert realtime._ai_bot_decision_timeout(game, now=now) == 2.0
    game.active_auction.bid_deadline = now + timedelta(seconds=1)
    assert realtime._ai_bot_decision_timeout(game, now=now) == 0.25
    game.active_auction.bid_deadline = now
    assert realtime._ai_bot_decision_timeout(game, now=now) == 0.0


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
    assert isinstance(action.command, BuildGroupRoundCommand)
    assert action.command.group_id == group_tile.group


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

    game.trade_unavailable_property_ids = [group[-1].id]
    unavailable_action = BotPolicy().choose_action(game, pack)

    assert unavailable_action is not None
    assert not isinstance(unavailable_action.command, ProposeTradeCommand)


async def test_bot_manages_property_trade_availability(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    host = await create_user(session, "availability-bot@example.com", "Host")
    pack = PackLoader(packs_dir).load("classic-demo")
    group_tile = next(tile for tile in pack.board.tiles if tile.group is not None)
    group = [tile for tile in pack.board.tiles if tile.group == group_tile.group]
    bot = PlayerState(
        user_id=host.id,
        display_name="Bot",
        is_bot=True,
        bot_personality=BotPersonality.BALANCED,
    )
    other = PlayerState(user_id=uuid4(), display_name="Human")
    game = GameState(
        host_user_id=other.user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        players=[bot, other],
        phase=TurnPhase.WAITING_FOR_END,
        owners={group[0].id: bot.user_id},
        trade_unavailable_property_ids=[group[0].id],
    )

    enable = BotPolicy().choose_action(game, pack)

    assert enable is not None
    assert enable.reason == "enable_spare_for_trade"
    assert isinstance(enable.command, SetPropertyTradeAvailabilityCommand)
    assert enable.command.property_id == group[0].id
    assert enable.command.available is True

    game.trade_unavailable_property_ids = [group[1].id]
    game.owners[group[1].id] = bot.user_id
    protect = BotPolicy().choose_action(game, pack)

    assert protect is not None
    assert protect.reason == "protect_strategic_property"
    assert isinstance(protect.command, SetPropertyTradeAvailabilityCommand)
    assert protect.command.property_id == group[0].id
    assert protect.command.available is False


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
    assert isinstance(action.command, SellGroupRoundCommand)
    assert action.command.group_id == group_tile.group

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

    async def ignore_broadcast(_game, *, complete_events: bool):
        del complete_events
        return None

    monkeypatch.setattr(realtime, "broadcast_game_state", ignore_broadcast)
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

    async def ignore_broadcast(_game, *, complete_events: bool):
        del complete_events
        return None

    monkeypatch.setattr(realtime, "broadcast_game_state", ignore_broadcast)
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

    async def ignore_broadcast(_game, *, complete_events: bool):
        del complete_events
        return None

    monkeypatch.setattr(realtime, "broadcast_game_state", ignore_broadcast)
    await realtime._run_bot_runner(game.id)

    async with runner_sessions() as persisted_session:
        updated = await GameRepository(persisted_session).get(game.id)
    assert updated.current_player is not None
    assert updated.current_player.user_id == host.id


async def test_runner_falls_back_in_time_for_ai_bot_auction(
    packs_dir: Path,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host = await create_user(session, "ai-auction-host@example.com", "Host")
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
    bot = game.players[-1]
    pack = PackLoader(packs_dir).load("classic-demo")
    tile = next(tile for tile in pack.board.tiles if tile.is_purchasable and tile.price)
    await games.start(game.id, host.id)
    async with session.begin():
        persisted = await GameRepository(session).get(game.id, for_update=True)
        previous_sequence = len(persisted.events)
        persisted.active_auction = AuctionState(
            property_id=tile.id,
            eligible_player_ids=[host.id, bot.user_id],
            bid_deadline=datetime.now(UTC) + timedelta(seconds=5),
        )
        await GameRepository(session).save(persisted, previous_sequence)

    runner_sessions = async_sessionmaker(session.bind, expire_on_commit=False)
    monkeypatch.setattr(realtime, "session_factory", runner_sessions)
    monkeypatch.setattr(realtime, "BOT_ACTION_DELAY_SECONDS", 0)
    monkeypatch.setattr(realtime, "AI_AUCTION_DECISION_DEADLINE_SECONDS", 0.01)
    monkeypatch.setattr(realtime, "sync_auction_timer", lambda _game: None)

    async def slow_ai(*_args, **_kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(realtime.AiBotPolicy, "choose_action", slow_ai)

    async def ignore_broadcast(_game, *, complete_events: bool):
        del complete_events
        return None

    monkeypatch.setattr(realtime, "broadcast_game_state", ignore_broadcast)
    await realtime._run_bot_runner(game.id)

    async with runner_sessions() as persisted_session:
        updated = await GameRepository(persisted_session).get(game.id)
    auction_actions = [
        event
        for event in updated.events
        if event.type in {"auction.bid_placed", "auction.player_passed"}
        and event.data.get("player_id") == str(bot.user_id)
    ]
    assert auction_actions


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

    refusal = next(
        event for event in reversed(game.events) if event.type == "trade.rejected"
    )
    assert refusal.type == "trade.rejected"
    assert refusal.data["bot_reason"] == "reject_liquidity_risk"
    assert refusal.data["bot_note"] == "Me deja sin caja para la renta"
    relationship = game.bot_relationships[0]
    assert relationship.bot_id == bot.user_id
    assert relationship.player_id == host.id
    assert relationship.score == -6
    assert relationship.interaction_count == 1
    assert game.events[-1].type == "relationship.changed"
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
