from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.bots import BotPolicy
from business_game.application.negotiation import (
    NegotiationEngine,
    TradeVerdict,
)
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import DomainError
from business_game.domain.models import (
    AcceptTradeCommand,
    AddBotRequest,
    AuctionState,
    BotPersonality,
    BuyPropertyCommand,
    ContentPack,
    DebtReason,
    DebtState,
    DeclinePropertyCommand,
    GameEvent,
    GameState,
    GameStatus,
    PayJailFineCommand,
    PlayerState,
    ProposeTradeCommand,
    RejectTradeCommand,
    RollCommand,
    TradeOffer,
    TradeStatus,
    TurnPhase,
    UserCreate,
)

ORANGE = ["property_16", "property_18", "property_19"]
YELLOW = ["property_26", "property_27", "property_29"]


@pytest.fixture
def pack(packs_dir: Path) -> ContentPack:
    return PackLoader(packs_dir).load("classic-demo")


def make_bot(
    personality: BotPersonality = BotPersonality.BALANCED,
    *,
    balance: int = 1500,
    name: str = "Bot",
) -> PlayerState:
    return PlayerState(
        user_id=uuid4(),
        display_name=name,
        is_bot=True,
        bot_personality=personality,
        balance=balance,
    )


def make_game(
    pack: ContentPack,
    players: list[PlayerState],
    *,
    owners: dict[str, UUID] | None = None,
    phase: TurnPhase = TurnPhase.WAITING_FOR_END,
    current: int = 0,
) -> GameState:
    return GameState(
        host_user_id=players[0].user_id,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        players=players,
        current_player_index=current,
        phase=phase,
        owners=owners or {},
        houses_remaining=pack.manifest.house_supply,
        hotels_remaining=pack.manifest.hotel_supply,
    )


def swap_setup(pack: ContentPack) -> tuple[GameState, PlayerState, PlayerState]:
    """Each side is one property away from a different monopoly."""
    seller = make_bot(BotPersonality.NEGOTIATOR, name="Negociador")
    buyer = make_bot(BotPersonality.BALANCED, name="Equilibrado")
    owners = {
        ORANGE[0]: seller.user_id,
        ORANGE[1]: seller.user_id,
        YELLOW[2]: seller.user_id,
        ORANGE[2]: buyer.user_id,
        YELLOW[0]: buyer.user_id,
        YELLOW[1]: buyer.user_id,
    }
    game = make_game(pack, [seller, buyer], owners=owners)
    return game, seller, buyer


async def test_bot_offers_the_swap_that_completes_both_monopolies(
    pack: ContentPack,
) -> None:
    game, seller, _ = swap_setup(pack)

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, ProposeTradeCommand)
    assert action.command.offered_property_ids == [YELLOW[2]]
    assert action.command.requested_property_ids == [ORANGE[2]]
    assert action.reason == "propose_win_win_swap"


async def test_the_other_bot_accepts_the_swap(pack: ContentPack) -> None:
    game, seller, buyer = swap_setup(pack)
    proposal = BotPolicy().choose_action(game, pack)
    assert proposal is not None
    assert isinstance(proposal.command, ProposeTradeCommand)
    game.trades.append(
        TradeOffer(
            proposer_id=seller.user_id,
            recipient_id=buyer.user_id,
            offered_cash=proposal.command.offered_cash,
            requested_cash=proposal.command.requested_cash,
            offered_property_ids=proposal.command.offered_property_ids,
            requested_property_ids=proposal.command.requested_property_ids,
        )
    )

    answer = BotPolicy().choose_action(game, pack)

    assert answer is not None
    assert answer.actor_id == buyer.user_id
    assert isinstance(answer.command, AcceptTradeCommand)
    assert answer.reason == "accept_completes_group"


async def test_bot_refuses_to_sell_the_piece_that_completes_a_rival_group(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED)
    rival = make_bot(BotPersonality.AGGRESSIVE, name="Rival")
    owners = {
        ORANGE[0]: rival.user_id,
        ORANGE[1]: rival.user_id,
        ORANGE[2]: bot.user_id,
    }
    game = make_game(pack, [bot, rival], owners=owners)
    game.trades.append(
        TradeOffer(
            proposer_id=rival.user_id,
            recipient_id=bot.user_id,
            offered_cash=220,
            requested_property_ids=[ORANGE[2]],
        )
    )

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, RejectTradeCommand)
    assert action.reason == "reject_completes_rival_group"


async def test_bot_sells_the_key_piece_when_the_price_matches_the_monopoly(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED)
    rival = make_bot(BotPersonality.AGGRESSIVE, name="Rival", balance=4000)
    owners = {
        ORANGE[0]: rival.user_id,
        ORANGE[1]: rival.user_id,
        ORANGE[2]: bot.user_id,
    }
    game = make_game(pack, [bot, rival], owners=owners)
    engine = NegotiationEngine(game, pack)
    trade = TradeOffer(
        proposer_id=rival.user_id,
        recipient_id=bot.user_id,
        offered_cash=1200,
        requested_property_ids=[ORANGE[2]],
    )

    assert engine.assess_incoming(bot, trade).verdict is TradeVerdict.ACCEPT


async def test_bot_counters_instead_of_walking_away_from_a_near_miss(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.NEGOTIATOR)
    rival = make_bot(BotPersonality.BALANCED, name="Rival", balance=2000)
    owners = {YELLOW[0]: bot.user_id, ORANGE[0]: rival.user_id}
    game = make_game(pack, [bot, rival], owners=owners)
    engine = NegotiationEngine(game, pack)
    # Under the bar but within reach: worth reopening, not worth taking.
    trade = TradeOffer(
        proposer_id=rival.user_id,
        recipient_id=bot.user_id,
        offered_cash=200,
        requested_property_ids=[YELLOW[0]],
    )

    assessment = engine.assess_incoming(bot, trade)

    assert assessment.verdict is TradeVerdict.COUNTER
    assert assessment.counter is not None
    assert assessment.counter.recipient_id == rival.user_id
    assert assessment.counter.requested_property_ids == []
    assert assessment.counter.offered_property_ids == [YELLOW[0]]
    assert assessment.counter.requested_cash > trade.offered_cash


async def test_the_counter_offer_reaches_the_table_after_the_refusal(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.NEGOTIATOR)
    rival = make_bot(BotPersonality.BALANCED, name="Rival", balance=2000)
    owners = {YELLOW[0]: bot.user_id, ORANGE[0]: rival.user_id}
    game = make_game(pack, [bot, rival], owners=owners, current=1)
    trade = TradeOffer(
        proposer_id=rival.user_id,
        recipient_id=bot.user_id,
        offered_cash=200,
        requested_property_ids=[YELLOW[0]],
    )
    game.trades.append(trade)

    refusal = BotPolicy().choose_action(game, pack)
    assert refusal is not None
    assert isinstance(refusal.command, RejectTradeCommand)
    assert refusal.reason == "counter_rebalanced"

    trade.status = TradeStatus.REJECTED
    counter = BotPolicy().choose_action(game, pack)

    assert counter is not None
    assert counter.actor_id == bot.user_id
    assert isinstance(counter.command, ProposeTradeCommand)
    assert counter.command.requested_cash > trade.offered_cash


async def test_haggling_between_two_bots_is_bounded(pack: ContentPack) -> None:
    bot = make_bot(BotPersonality.NEGOTIATOR)
    rival = make_bot(BotPersonality.NEGOTIATOR, name="Rival", balance=2000)
    owners = {YELLOW[0]: bot.user_id, ORANGE[0]: rival.user_id}
    game = make_game(pack, [bot, rival], owners=owners)
    for _ in range(3):
        game.trades.append(
            TradeOffer(
                proposer_id=rival.user_id,
                recipient_id=bot.user_id,
                offered_cash=200,
                requested_property_ids=[YELLOW[0]],
                status=TradeStatus.REJECTED,
            )
        )
    engine = NegotiationEngine(game, pack)

    assessment = engine.assess_incoming(bot, game.trades[-1])

    assert assessment.verdict is TradeVerdict.REJECT


async def test_bot_short_on_cash_offers_a_spare_property_for_money(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED, balance=40)
    rival = make_bot(BotPersonality.BALANCED, name="Rival", balance=1500)
    owners = {
        YELLOW[0]: bot.user_id,
        YELLOW[1]: rival.user_id,
        ORANGE[0]: rival.user_id,
    }
    game = make_game(pack, [bot, rival], owners=owners)

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, ProposeTradeCommand)
    assert action.reason == "propose_sell_spare_for_cash"
    assert action.command.offered_property_ids == [YELLOW[0]]
    assert action.command.requested_cash > 0


async def test_personality_changes_the_answer_to_the_same_offer(
    pack: ContentPack,
) -> None:
    rival = make_bot(BotPersonality.BALANCED, name="Rival", balance=2000)
    verdicts = {}
    for personality in (BotPersonality.CONSERVATIVE, BotPersonality.AGGRESSIVE):
        bot = make_bot(personality)
        owners = {YELLOW[0]: bot.user_id, ORANGE[0]: rival.user_id}
        game = make_game(pack, [bot, rival], owners=owners)
        engine = NegotiationEngine(game, pack)
        trade = TradeOffer(
            proposer_id=rival.user_id,
            recipient_id=bot.user_id,
            offered_cash=285,
            requested_property_ids=[YELLOW[0]],
        )
        verdicts[personality] = engine.assess_incoming(bot, trade).verdict

    assert verdicts[BotPersonality.CONSERVATIVE] is TradeVerdict.REJECT
    assert verdicts[BotPersonality.AGGRESSIVE] is TradeVerdict.ACCEPT


async def test_bot_does_not_repeat_a_deal_that_was_refused(pack: ContentPack) -> None:
    game, seller, buyer = swap_setup(pack)
    first = BotPolicy().choose_action(game, pack)
    assert first is not None
    assert isinstance(first.command, ProposeTradeCommand)
    game.trades.append(
        TradeOffer(
            proposer_id=seller.user_id,
            recipient_id=buyer.user_id,
            offered_cash=first.command.offered_cash,
            requested_cash=first.command.requested_cash,
            offered_property_ids=first.command.offered_property_ids,
            requested_property_ids=first.command.requested_property_ids,
            status=TradeStatus.REJECTED,
        )
    )

    again = BotPolicy().choose_action(game, pack)

    # It may still negotiate, but never by repeating the offer already refused.
    assert again is not None
    if isinstance(again.command, ProposeTradeCommand):
        assert (
            again.command.offered_property_ids,
            again.command.requested_property_ids,
        ) != (first.command.offered_property_ids, first.command.requested_property_ids)


async def test_conservative_bot_buys_the_property_that_closes_its_group(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.CONSERVATIVE, balance=600)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    owners = {ORANGE[0]: bot.user_id, ORANGE[1]: bot.user_id}
    game = make_game(
        pack,
        [bot, rival],
        owners=owners,
        phase=TurnPhase.BUY_DECISION,
    )
    game.pending_tile_id = ORANGE[2]

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, BuyPropertyCommand)
    assert action.reason == "buy_completes_group"


async def test_conservative_bot_still_declines_an_isolated_property(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.CONSERVATIVE, balance=600)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    game = make_game(pack, [bot, rival], phase=TurnPhase.BUY_DECISION)
    game.pending_tile_id = ORANGE[2]

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert isinstance(action.command, DeclinePropertyCommand)


async def test_broke_bot_stays_in_jail_instead_of_paying_the_fine(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.CONSERVATIVE, balance=120)
    bot.in_jail = True
    rival = make_bot(BotPersonality.AGGRESSIVE, name="Rival")
    owners = {tile_id: rival.user_id for tile_id in ORANGE}
    game = make_game(
        pack,
        [bot, rival],
        owners=owners,
        phase=TurnPhase.WAITING_FOR_ROLL,
    )
    game.building_levels[ORANGE[0]] = 3

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert not isinstance(action.command, PayJailFineCommand)
    assert isinstance(action.command, RollCommand)


async def test_a_losing_bot_lowers_its_price_to_get_back_in_the_game(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED, balance=200)
    leader = make_bot(BotPersonality.BALANCED, name="Líder", balance=3000)
    owners = {tile_id: leader.user_id for tile_id in ORANGE + YELLOW}
    owners[YELLOW[2]] = bot.user_id
    game = make_game(pack, [bot, leader], owners=owners)
    engine = NegotiationEngine(game, pack)

    assert engine.standing_percent(bot) < 70
    assert engine.threshold_percent(bot, leader, jitter=False) < engine.threshold_percent(
        leader,
        bot,
        jitter=False,
    )


@pytest.mark.parametrize(
    "state",
    ["buy_decision", "waiting_for_roll", "waiting_for_end", "debt", "auction", "selector"],
)
async def test_bots_always_have_a_legal_move(pack: ContentPack, state: str) -> None:
    bot = make_bot(BotPersonality.BALANCED, balance=300)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    owners = {ORANGE[0]: bot.user_id, ORANGE[1]: rival.user_id}
    game = make_game(pack, [bot, rival], owners=owners)
    if state == "buy_decision":
        game.phase = TurnPhase.BUY_DECISION
        game.pending_tile_id = ORANGE[2]
    elif state == "waiting_for_roll":
        game.phase = TurnPhase.WAITING_FOR_ROLL
    elif state == "debt":
        game.active_debt = DebtState(
            debtor_id=bot.user_id,
            amount=900,
            reason=DebtReason.RENT,
            tile_id=ORANGE[1],
        )
    elif state == "auction":
        game.active_auction = AuctionState(
            property_id=ORANGE[2],
            minimum_bid=10,
            eligible_player_ids=[bot.user_id, rival.user_id],
        )
    elif state == "selector":
        game.pending_auction_selector_id = bot.user_id
        game.pending_auction_minimum_bid = 10

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert action.actor_id == bot.user_id


async def test_bidding_respects_the_auction_minimum(pack: ContentPack) -> None:
    bot = make_bot(BotPersonality.AGGRESSIVE)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    game = make_game(pack, [bot, rival])
    game.active_auction = AuctionState(
        property_id=ORANGE[2],
        minimum_bid=150,
        current_bid=0,
        eligible_player_ids=[bot.user_id, rival.user_id],
    )

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert action.command.action == "bid"
    assert action.command.amount >= 150


async def test_the_auction_selector_picks_a_property_it_can_use(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED, balance=1500)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    owners = {ORANGE[0]: bot.user_id, ORANGE[1]: bot.user_id}
    game = make_game(pack, [bot, rival], owners=owners)
    game.pending_auction_selector_id = bot.user_id
    game.pending_auction_minimum_bid = 1

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert action.command.action == "select_auction_property"
    assert action.command.property_id == ORANGE[2]


async def test_debt_is_covered_by_mortgaging_before_selling_buildings(
    pack: ContentPack,
) -> None:
    bot = make_bot(BotPersonality.BALANCED, balance=0)
    rival = make_bot(BotPersonality.BALANCED, name="Rival")
    owners = {tile_id: bot.user_id for tile_id in ORANGE}
    owners[YELLOW[0]] = bot.user_id
    game = make_game(pack, [bot, rival], owners=owners)
    game.building_levels[ORANGE[0]] = 2
    game.active_debt = DebtState(
        debtor_id=bot.user_id,
        amount=300,
        reason=DebtReason.RENT,
        tile_id=ORANGE[1],
    )

    action = BotPolicy().choose_action(game, pack)

    assert action is not None
    assert action.command.action == "mortgage_property"
    assert action.command.property_id == YELLOW[0]


async def test_a_full_table_of_bots_plays_without_stalling(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    """The whole point of the runner: bots keep the game moving on their own."""
    host = await UserService(session).register(
        UserCreate(
            email="simulation-host@example.com",
            password="correct-horse-battery",
            display_name="Host",
        )
    )
    rolls = iter_rolls()
    clock = FakeClock()
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: next(rolls),
        card_shuffler=lambda card_ids: sorted(card_ids),
        clock=lambda: clock.now,
    )
    game = await games.create("classic-demo", host)
    for personality in (
        BotPersonality.AGGRESSIVE,
        BotPersonality.CONSERVATIVE,
        BotPersonality.NEGOTIATOR,
    ):
        game = await games.add_bot(game.id, host.id, AddBotRequest(personality=personality))
    game = await games.start(game.id, host.id)
    # The human resigns straight away and leaves the table to the bots.
    game = await games.leave(game.id, host.id)

    pack = PackLoader(packs_dir).load("classic-demo")
    policy = BotPolicy()
    turns_seen = 0
    for _ in range(600):
        if game.status is not GameStatus.PLAYING:
            break
        action = policy.choose_action(game, pack)
        if action is None:
            # Nobody left to bid: the realtime runner waits for the auction timer
            # here, so the simulation moves the clock the same way.
            auction = game.active_auction
            assert auction is not None and auction.bid_deadline is not None, (
                f"bots stalled on phase {game.phase}"
            )
            clock.now = auction.bid_deadline + timedelta(seconds=1)
            settled = await games.settle_expired_auction(game.id, auction.bid_deadline)
            assert settled is not None
            game = settled
            continue
        before = len(game.events)
        try:
            game = await games.execute(
                game.id,
                action.actor_id,
                action.command,
                automation_reason=action.reason,
            )
        except DomainError as error:  # pragma: no cover - a stall would fail here
            pytest.fail(f"illegal bot command {action.command!r} ({action.reason}): {error}")
        assert len(game.events) > before, f"no progress after {action.reason}"
        turns_seen += sum(
            event.type == "turn.started" for event in game.events[before:]
        )

    assert turns_seen > 20
    assert any(event.type == "property.purchased" for event in game.events)
    assert any(event.type == "trade.proposed" for event in game.events)


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime.now(UTC)


def iter_rolls():
    """Deterministic dice that still visit the whole board."""
    values = [(2, 3), (4, 1), (6, 2), (3, 5), (1, 4), (5, 6), (2, 2), (4, 3)]
    index = 0
    while True:
        yield values[index % len(values)]
        index += 1


async def test_the_same_snapshot_always_produces_the_same_decision(
    pack: ContentPack,
) -> None:
    game, _, _ = swap_setup(pack)
    game.events.append(GameEvent(sequence=1, type="turn.started", data={}))

    first = BotPolicy().choose_action(game, pack)
    second = BotPolicy().choose_action(game, pack)

    assert first is not None and second is not None
    assert first.command.model_dump() == second.command.model_dump()
