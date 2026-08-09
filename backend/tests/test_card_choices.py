from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.bots import BotPolicy
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, UserService
from business_game.domain.errors import ConflictError
from business_game.domain.models import (
    BotPersonality,
    CardChoiceOptionDefinition,
    CardChoiceOutcomeDefinition,
    ChooseCardCommand,
    ContinueCardChoiceResultCommand,
    ContinueCardCommand,
    EndTurnCommand,
    InteractiveChoiceCardEffect,
    ResolveCardChoiceCommand,
    RollCommand,
    UserCreate,
)


async def _create_interactive_game(
    packs_dir: Path,
    session: AsyncSession,
    *,
    outcome_roll: int = 0,
):
    users = UserService(session)
    host = await users.register(
        UserCreate(
            email="interactive-host@example.com",
            password="correct-horse-battery",
            display_name="Interactive Host",
        )
    )
    guest = await users.register(
        UserCreate(
            email="interactive-guest@example.com",
            password="correct-horse-battery",
            display_name="Interactive Guest",
        )
    )
    games = GameService(
        session,
        PackLoader(packs_dir),
        dice_roller=lambda: (3, 4),
        card_shuffler=lambda card_ids: sorted(card_ids),
        outcome_roller=lambda _: outcome_roll,
    )
    game = await games.create(
        "classic-demo",
        host,
        deck_collection_ids={
            "opportunity": ["decisions"],
            "community": ["decisions"],
        },
    )
    await games.join(game.id, guest)
    game = await games.start(game.id, host.id)
    return games, game, host, guest


def test_decision_collection_is_portable_and_covers_every_category(
    packs_dir: Path,
) -> None:
    loader = PackLoader(packs_dir)
    categories: set[str] = set()

    for pack_id in ("classic-demo", "extended-demo"):
        pack = loader.load(pack_id, "es")
        decision_cards = []
        for deck in pack.board.decks:
            collection = next(item for item in deck.collections if item.id == "decisions")
            assert len(collection.card_ids) == 6
            decision_cards.extend(
                card for card in deck.cards if card.id in collection.card_ids
            )
        assert len(decision_cards) == 12
        assert all(
            isinstance(card.resolved_effects()[0], InteractiveChoiceCardEffect)
            for card in decision_cards
        )
        categories.update(
            card.resolved_effects()[0].category for card in decision_cards
        )

    assert categories == {
        "scam",
        "lottery",
        "employment",
        "contest",
        "social",
        "mystery",
    }


def test_choice_outcomes_require_exactly_one_hundred_percent() -> None:
    with pytest.raises(ValidationError, match="weights must total 100"):
        CardChoiceOptionDefinition(
            id="risk",
            label_key="choice.risk",
            outcomes=[
                CardChoiceOutcomeDefinition(
                    weight=99,
                    result_key="result.loss",
                )
            ],
        )


async def test_card_choice_blocks_turn_and_only_chooser_can_resolve(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, guest = await _create_interactive_game(packs_dir, session)

    game = await games.execute(game.id, host.id, RollCommand(action="roll"))

    assert game.pending_card_draw is not None
    assert game.pending_card_draw.card_id is None
    assert game.pending_card_draw.offer_count == 6
    assert game.pending_card_choice is None
    with pytest.raises(ConflictError, match="pending card must be continued"):
        await games.execute(game.id, host.id, EndTurnCommand(action="end_turn"))
    with pytest.raises(ConflictError, match="selected player"):
        await games.execute(
            game.id,
            guest.id,
            ChooseCardCommand(action="choose_card", card_index=0),
        )

    game = await games.execute(
        game.id,
        host.id,
        ChooseCardCommand(action="choose_card", card_index=0),
    )

    assert game.pending_card_draw is not None
    assert game.pending_card_draw.card_id == "opportunity_decision_bank_call"
    assert game.pending_card_draw.selected_index == 0

    game = await games.execute(
        game.id,
        host.id,
        ContinueCardCommand(action="continue_card"),
    )

    assert game.pending_card_draw is None
    assert game.pending_card_choice is not None
    assert game.pending_card_choice.card_id == "opportunity_decision_bank_call"
    assert game.pending_card_choice.player_id == host.id
    assert game.phase.value == "waiting_for_end"

    with pytest.raises(ConflictError, match="pending card choice"):
        await games.execute(game.id, host.id, EndTurnCommand(action="end_turn"))
    with pytest.raises(ConflictError, match="selected player"):
        await games.execute(
            game.id,
            guest.id,
            ResolveCardChoiceCommand(
                action="resolve_card_choice",
                choice_id="hang_up",
            ),
        )

    game = await games.execute(
        game.id,
        host.id,
        ResolveCardChoiceCommand(
            action="resolve_card_choice",
            choice_id="hang_up",
        ),
    )

    assert game.pending_card_choice is None
    assert game.pending_card_choice_result is not None
    assert game.pending_card_choice_result.player_id == host.id
    assert game.pending_card_choice_result.choice_id == "hang_up"
    assert (
        game.pending_card_choice_result.result_key
        == "decision.bank_call.hang_up.result"
    )
    with pytest.raises(ConflictError, match="selected player"):
        await games.execute(
            game.id,
            guest.id,
            ContinueCardChoiceResultCommand(
                action="continue_card_choice_result",
            ),
        )
    with pytest.raises(ConflictError, match="result must be continued"):
        await games.execute(game.id, host.id, EndTurnCommand(action="end_turn"))

    game = await games.execute(
        game.id,
        host.id,
        ContinueCardChoiceResultCommand(action="continue_card_choice_result"),
    )

    assert game.pending_card_choice_result is None
    assert game.events[-1].type == "card.choice_result_acknowledged"


async def test_selected_fan_position_determines_the_revealed_card(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await _create_interactive_game(packs_dir, session)
    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    original_order = list(game.deck_orders["opportunity"])

    game = await games.execute(
        game.id,
        host.id,
        ChooseCardCommand(action="choose_card", card_index=3),
    )

    assert game.pending_card_draw is not None
    assert game.pending_card_draw.selected_index == 3
    assert game.pending_card_draw.card_id == original_order[3]
    assert game.pending_card_draw.reveal_sequence == game.event_sequence
    assert game.deck_orders["opportunity"][0] == original_order[3]
    assert game.deck_orders["opportunity"][3] == original_order[0]
    assert game.deck_cursors["opportunity"] == 1
    assert game.events[-1].data["selected_index"] == 3


async def test_weighted_choice_applies_server_selected_consequence(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await _create_interactive_game(
        packs_dir,
        session,
        outcome_roll=0,
    )
    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    starting_balance = game.players[0].balance
    game = await games.execute(
        game.id,
        host.id,
        ChooseCardCommand(action="choose_card", card_index=0),
    )
    game = await games.execute(
        game.id,
        host.id,
        ContinueCardCommand(action="continue_card"),
    )

    game = await games.execute(
        game.id,
        host.id,
        ResolveCardChoiceCommand(
            action="resolve_card_choice",
            choice_id="share_code",
        ),
    )

    assert game.players[0].balance == starting_balance - 200
    resolved = next(
        event for event in reversed(game.events) if event.type == "card.choice_resolved"
    )
    assert resolved.data["result_key"] == "decision.bank_call.share_code.scam"


async def test_bot_resolves_interactive_card_instead_of_stalling(
    packs_dir: Path,
    session: AsyncSession,
) -> None:
    games, game, host, _ = await _create_interactive_game(packs_dir, session)
    game = await games.execute(game.id, host.id, RollCommand(action="roll"))
    game.players[0].is_bot = True
    game.players[0].bot_personality = BotPersonality.BALANCED

    assert game.pack_snapshot is not None
    action = BotPolicy().choose_action(game, game.pack_snapshot)

    assert action is not None
    assert action.actor_id == host.id
    assert action.command == ChooseCardCommand(action="choose_card", card_index=0)

    game = await games.execute(game.id, host.id, action.command)
    game.players[0].is_bot = True
    game.players[0].bot_personality = BotPersonality.BALANCED
    next_action = BotPolicy().choose_action(game, game.pack_snapshot)

    assert next_action is not None
    assert next_action.command == ContinueCardCommand(action="continue_card")

    game = await games.execute(game.id, host.id, next_action.command)
    game.players[0].is_bot = True
    game.players[0].bot_personality = BotPersonality.BALANCED
    choice_action = BotPolicy().choose_action(game, game.pack_snapshot)

    assert choice_action is not None
    assert choice_action.command == ResolveCardChoiceCommand(
        action="resolve_card_choice",
        choice_id="hang_up",
    )

    game = await games.execute(game.id, host.id, choice_action.command)
    game.players[0].is_bot = True
    game.players[0].bot_personality = BotPersonality.BALANCED
    result_action = BotPolicy().choose_action(game, game.pack_snapshot)

    assert result_action is not None
    assert result_action.command == ContinueCardChoiceResultCommand(
        action="continue_card_choice_result",
    )
