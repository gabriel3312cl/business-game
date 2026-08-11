from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.advanced_economy import indexed_amount, indexed_rent
from business_game.application.economic_simulation import (
    advance_economic_week,
    initialize_economic_simulation,
)
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService
from business_game.domain.models import (
    BidPublicProjectCommand,
    GameSettings,
    GameState,
    GameStatus,
    OfferPropertyAuctionCommand,
    OperatingDebtState,
    PlayerState,
    TileKind,
)

FIRST_ID = UUID("10000000-0000-0000-0000-000000000001")
SECOND_ID = UUID("10000000-0000-0000-0000-000000000002")
THIRD_ID = UUID("10000000-0000-0000-0000-000000000003")


def advanced_game(packs_dir: Path) -> tuple[GameState, object]:
    pack = PackLoader(packs_dir).load("classic-demo")
    game = GameState(
        host_user_id=FIRST_ID,
        pack_id=pack.manifest.id,
        pack_version=pack.manifest.version,
        status=GameStatus.PLAYING,
        players=[
            PlayerState(user_id=FIRST_ID, display_name="First", balance=20_000),
            PlayerState(user_id=SECOND_ID, display_name="Second", balance=20_000),
            PlayerState(user_id=THIRD_ID, display_name="Third", balance=20_000),
        ],
        settings=GameSettings(),
        houses_remaining=pack.manifest.house_supply,
        hotels_remaining=pack.manifest.hotel_supply,
    )
    initialize_economic_simulation(game)
    return game, pack


def test_inflation_starts_neutral_and_accumulates_without_retroactivity(
    packs_dir: Path,
) -> None:
    game, pack = advanced_game(packs_dir)
    game.economy.elapsed_weeks = 101
    game.economy.inflation_base_week = None

    advance_economic_week(game, pack)

    assert game.economy.inflation_base_week == 102
    assert game.economy.price_index_basis_points == 10_000
    advance_economic_week(game, pack)
    assert game.economy.price_index_basis_points > 10_000


def test_existing_game_gets_future_schedules_without_retroactive_indexing(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, _ = advanced_game(packs_dir)
    game.economy.elapsed_weeks = 101
    game.economy.inflation_base_week = None
    game.economy.next_operating_cost_week = None
    game.economy.next_public_project_week = None
    game.economy.next_finale_vote_week = None

    GameService(session, PackLoader(packs_dir))._ensure_economy(game)

    assert game.economy.price_index_basis_points == 10_000
    assert game.economy.inflation_base_week == 101
    assert game.economy.next_operating_cost_week == 104
    assert game.economy.next_public_project_week == 104
    assert game.economy.next_finale_vote_week == 101


def test_inflation_and_cycle_affect_prices_and_rents_symmetrically(
    packs_dir: Path,
) -> None:
    game, pack = advanced_game(packs_dir)
    tile = next(item for item in pack.board.tiles if item.kind is TileKind.PROPERTY)
    game.economy.elapsed_weeks = 20
    game.economy.price_index_basis_points = 12_000
    game.owners[tile.id] = FIRST_ID

    assert indexed_amount(game, 1_000) == 1_200
    assert indexed_rent(game, tile, 100) == 122

    game.economy.operating_debts.append(
        OperatingDebtState(
            player_id=FIRST_ID,
            principal=100,
            remaining_amount=110,
            created_week=20,
        )
    )
    assert indexed_rent(game, tile, 100) == 92


def test_operating_close_can_be_paid_or_deferred(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, pack = advanced_game(packs_dir)
    service = GameService(session, PackLoader(packs_dir))
    properties = [item for item in pack.board.tiles if item.kind is TileKind.PROPERTY][:2]
    game.owners[properties[0].id] = FIRST_ID
    game.owners[properties[1].id] = SECOND_ID
    game.building_levels[properties[0].id] = 3
    game.building_levels[properties[1].id] = 2
    game.economy.elapsed_weeks = 11
    game.economy.next_operating_cost_week = 12

    service._process_advanced_week(game)
    assert game.economy.operating_cost_assessment is not None
    assert game.economy.operating_cost_assessment.due_week == 12

    game.economy.elapsed_weeks = 12
    service._process_advanced_week(game)
    first_balance = game.players[0].balance
    first_amount = service._operating_cost_due_for(game, FIRST_ID)
    service._pay_operating_costs(game, FIRST_ID)
    assert game.players[0].balance == first_balance - first_amount

    game.current_player_index = 1
    second_amount = service._operating_cost_due_for(game, SECOND_ID)
    service._defer_operating_costs(game, SECOND_ID)
    debt = game.economy.operating_debts[0]
    assert debt.player_id == SECOND_ID
    assert debt.remaining_amount == (second_amount * 110 + 99) // 100


def test_public_project_is_bid_awarded_and_completed(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, pack = advanced_game(packs_dir)
    service = GameService(session, PackLoader(packs_dir))
    property_tile = next(item for item in pack.board.tiles if item.kind is TileKind.PROPERTY)
    game.owners[property_tile.id] = FIRST_ID
    game.building_levels[property_tile.id] = 2
    game.economy.elapsed_weeks = 16
    game.economy.next_public_project_week = 16

    service._process_public_projects(game)
    project = game.economy.public_projects[-1]
    assert project.status == "bidding"
    service._bid_public_project(
        game,
        FIRST_ID,
        BidPublicProjectCommand(
            action="bid_public_project",
            project_id=project.id,
            amount=project.minimum_bid,
        ),
    )
    game.economy.elapsed_weeks = project.bidding_ends_week
    service._process_public_projects(game)
    assert project.status == "active"
    balance_after_bid = game.players[0].balance

    assert project.completes_week is not None
    game.economy.elapsed_weeks = project.completes_week
    service._process_public_projects(game)
    assert project.status == "completed"
    assert game.players[0].balance == balance_after_bid + project.reward_amount


def test_voluntary_auction_pays_the_seller(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, pack = advanced_game(packs_dir)
    service = GameService(session, PackLoader(packs_dir))
    tile = next(item for item in pack.board.tiles if item.kind is TileKind.PROPERTY)
    game.owners[tile.id] = FIRST_ID
    seller_before = game.players[0].balance
    winner_before = game.players[1].balance

    service._offer_property_auction(
        game,
        FIRST_ID,
        OfferPropertyAuctionCommand(
            action="offer_property_auction",
            property_id=tile.id,
            minimum_bid=500,
        ),
    )
    assert game.active_auction is not None
    game.active_auction.current_bidder_id = SECOND_ID
    game.active_auction.current_bid = game.active_auction.minimum_bid
    amount = game.active_auction.current_bid
    service._complete_auction(game)

    assert game.owners[tile.id] == SECOND_ID
    assert game.players[0].balance == seller_before + amount
    assert game.players[1].balance == winner_before - amount


def test_unanimous_vote_starts_and_finishes_the_countdown(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, _ = advanced_game(packs_dir)
    service = GameService(session, PackLoader(packs_dir))
    game.economy.elapsed_weeks = 80
    game.economy.next_finale_vote_week = 80

    service._maybe_open_finale_vote(game)
    assert game.economy.finale_vote is not None
    for player_id in (FIRST_ID, SECOND_ID, THIRD_ID):
        service._vote_finale(game, player_id, True)
    assert game.economy.finale is not None
    assert game.economy.finale.ends_week == 92

    game.players[1].balance = 25_000
    game.economy.elapsed_weeks = 92
    service._finish_finale(game)
    assert game.status is GameStatus.FINISHED
    assert game.economy.finale.winner_id == SECOND_ID


def test_finale_vote_excludes_bots_and_reopens_after_rejection(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    game, _ = advanced_game(packs_dir)
    service = GameService(session, PackLoader(packs_dir))
    game.players[1].is_bot = True
    game.players[2].is_bot = True
    game.economy.elapsed_weeks = 80
    game.economy.next_finale_vote_week = 80

    service._maybe_open_finale_vote(game)
    assert game.economy.finale_vote is not None
    assert game.economy.finale_vote.eligible_player_ids == [FIRST_ID]
    service._vote_finale(game, FIRST_ID, False)
    assert game.economy.finale_vote is None
    assert game.economy.next_finale_vote_week == 92

    game.economy.elapsed_weeks = 92
    service._maybe_open_finale_vote(game)
    service._vote_finale(game, FIRST_ID, True)
    assert game.economy.finale is not None
