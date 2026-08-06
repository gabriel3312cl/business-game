from uuid import UUID

from business_game.domain.models import GameState, GameStateView, TradeStatus

EVENT_DELTA_LIMIT = 64


def game_state_view(
    game: GameState,
    actor_id: UUID,
    *,
    complete_events: bool = True,
) -> GameStateView:
    payload = game.model_dump(mode="json")
    for player in payload["players"]:
        if player["user_id"] != str(actor_id):
            player["jail_card_ids"] = []
    payload["trades"] = [
        trade.model_dump(mode="json")
        for trade in game.trades
        if trade.status is not TradeStatus.PENDING
        or actor_id in {trade.proposer_id, trade.recipient_id}
    ]
    if not complete_events:
        payload["events"] = [
            event.model_dump(mode="json")
            for event in game.events[-EVENT_DELTA_LIMIT:]
        ]
    payload["event_sequence"] = game.event_sequence
    payload["events_complete"] = complete_events
    return GameStateView.model_validate(payload)
