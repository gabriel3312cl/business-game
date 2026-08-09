from business_game.domain.errors import ConflictError
from business_game.domain.models import ContentPack


def select_deck_collections(
    pack: ContentPack,
    requested: dict[str, list[str]] | None = None,
) -> tuple[ContentPack, dict[str, list[str]]]:
    """Resolve selectable card collections into the immutable game pack snapshot."""

    selections = requested or {}
    known_decks = {deck.id for deck in pack.board.decks}
    if unknown_decks := sorted(set(selections) - known_decks):
        raise ConflictError(f"unknown card decks: {unknown_decks}")

    resolved = pack.model_copy(deep=True)
    selected_by_deck: dict[str, list[str]] = {}
    for deck in resolved.board.decks:
        if not deck.collections:
            if deck.id in selections:
                raise ConflictError(f"deck '{deck.id}' does not offer selectable collections")
            continue

        selected = selections.get(deck.id, deck.default_collection_ids)
        if not selected:
            raise ConflictError(f"deck '{deck.id}' requires at least one collection")
        if len(selected) != len(set(selected)):
            raise ConflictError(f"deck '{deck.id}' repeats a card collection")
        collections = {collection.id: collection for collection in deck.collections}
        if missing := sorted(set(selected) - set(collections)):
            raise ConflictError(f"deck '{deck.id}' has unknown collections: {missing}")

        selected_card_ids = {
            card_id
            for collection_id in selected
            for card_id in collections[collection_id].card_ids
        }
        deck.cards = [card for card in deck.cards if card.id in selected_card_ids]
        deck.collections = [collections[collection_id] for collection_id in selected]
        deck.default_collection_ids = list(selected)
        if not deck.cards:
            raise ConflictError(f"deck '{deck.id}' cannot be empty")
        selected_by_deck[deck.id] = list(selected)

    return resolved, selected_by_deck
