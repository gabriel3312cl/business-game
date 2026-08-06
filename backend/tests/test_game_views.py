from uuid import uuid4

from business_game.application.game_views import game_state_view
from business_game.domain.models import (
    GameEvent,
    GameState,
    PlayerState,
    TradeOffer,
)


def test_game_state_view_hides_server_and_other_player_private_state() -> None:
    actor_id = uuid4()
    opponent_id = uuid4()
    game = GameState(
        host_user_id=actor_id,
        pack_id="classic-demo",
        pack_version="1.0.0",
        players=[
            PlayerState(
                user_id=actor_id,
                display_name="Actor",
                jail_card_ids=["actor-card"],
            ),
            PlayerState(
                user_id=opponent_id,
                display_name="Opponent",
                jail_card_ids=["opponent-card"],
            ),
        ],
        deck_orders={"opportunity": ["card-2", "card-1"]},
        deck_cursors={"opportunity": 1},
        trades=[
            TradeOffer(
                proposer_id=opponent_id,
                recipient_id=uuid4(),
                offered_cash=100,
            ),
            TradeOffer(
                proposer_id=actor_id,
                recipient_id=opponent_id,
                offered_cash=50,
            ),
        ],
        events=[GameEvent(sequence=1, type="game.created")],
    )

    payload = game_state_view(game, actor_id).model_dump(mode="json")

    assert "deck_orders" not in payload
    assert "deck_cursors" not in payload
    assert payload["players"][0]["jail_card_ids"] == ["actor-card"]
    assert payload["players"][1]["jail_card_ids"] == []
    assert len(payload["trades"]) == 1
    assert payload["trades"][0]["offered_cash"] == 50
