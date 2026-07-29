from __future__ import annotations

import random
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.pack_loader import PackLoader
from business_game.domain.errors import (
    ConflictError,
    ForbiddenError,
    UnauthorizedError,
)
from business_game.domain.models import (
    AcceptTradeCommand,
    AuctionState,
    BidCommand,
    BuildPropertyCommand,
    BuyPropertyCommand,
    CancelTradeCommand,
    CardPaymentState,
    CashCardEffect,
    CashEachCardEffect,
    ContentPack,
    DebtReason,
    DebtState,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    EndTurnCommand,
    GameCommand,
    GameEvent,
    GameSettings,
    GameState,
    GameStatus,
    GetOutOfJailCardEffect,
    GoToJailCardEffect,
    MortgagePropertyCommand,
    MoveRelativeCardEffect,
    MoveToCardEffect,
    MoveToNearestCardEffect,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    PlayerState,
    ProposeTradeCommand,
    RejectTradeCommand,
    RepairsCardEffect,
    RollCommand,
    SellBuildingCommand,
    SpectatorState,
    TileDefinition,
    TileKind,
    TradeOffer,
    TradeStatus,
    TurnPhase,
    UnmortgagePropertyCommand,
    UpdateGameSettingsRequest,
    UseJailCardCommand,
    User,
    UserCreate,
    UserUpdate,
)
from business_game.infrastructure.repositories import GameRepository, UserRepository
from business_game.security import hash_password, verify_password

DiceRoller = Callable[[], tuple[int, int]]
CardShuffler = Callable[[list[str]], list[str]]


class UserService:
    def __init__(self, session: AsyncSession):
        self._session = session
        self._users = UserRepository(session)

    async def register(self, data: UserCreate) -> User:
        email = str(data.email).strip().lower()
        try:
            async with self._session.begin():
                existing = await self._users.get_record_by_email(email)
                if existing is not None:
                    raise ConflictError("email is already registered")
                return await self._users.create(
                    email=email,
                    display_name=data.display_name.strip(),
                    locale=data.locale.strip().lower(),
                    password_hash=hash_password(data.password),
                )
        except IntegrityError as exc:
            constraint_name = self._constraint_name(exc)
            if constraint_name in {None, "uq_users_email"}:
                raise ConflictError("email is already registered") from exc
            raise

    async def authenticate(self, email: str, password: str) -> User:
        record = await self._users.get_record_by_email(email.strip().lower())
        if (
            record is None
            or not record.is_active
            or not verify_password(password, record.password_hash)
        ):
            raise UnauthorizedError("invalid email or password")
        return await self._users.get(record.id)

    async def get(self, user_id: UUID) -> User:
        return await self._users.get(user_id)

    async def update(self, user_id: UUID, data: UserUpdate) -> User:
        async with self._session.begin():
            return await self._users.update(
                user_id,
                display_name=(
                    data.display_name.strip() if data.display_name is not None else None
                ),
                locale=data.locale.strip().lower() if data.locale is not None else None,
            )

    async def deactivate(self, user_id: UUID) -> None:
        async with self._session.begin():
            await self._users.deactivate(user_id)

    @staticmethod
    def _constraint_name(exc: IntegrityError) -> str | None:
        original = exc.orig
        diagnostic = getattr(original, "diag", None)
        return getattr(diagnostic, "constraint_name", None) or getattr(
            original,
            "constraint_name",
            None,
        )


class GameService:
    def __init__(
        self,
        session: AsyncSession,
        packs: PackLoader,
        dice_roller: DiceRoller | None = None,
        card_shuffler: CardShuffler | None = None,
    ) -> None:
        self._session = session
        self._packs = packs
        self._games = GameRepository(session)
        secure_random = random.SystemRandom()
        self._dice_roller = dice_roller or (
            lambda: (secure_random.randint(1, 6), secure_random.randint(1, 6))
        )
        self._card_shuffler = card_shuffler or (
            lambda card_ids: secure_random.sample(card_ids, k=len(card_ids))
        )

    async def create(self, pack_id: str, actor: User) -> GameState:
        pack = self._packs.load(pack_id)
        game = GameState(
            host_user_id=actor.id,
            pack_id=pack.manifest.id,
            pack_version=pack.manifest.version,
            settings=GameSettings(
                max_players=pack.manifest.max_players,
                rules=pack.manifest.default_rules.model_copy(deep=True),
            ),
            houses_remaining=pack.manifest.house_supply,
            hotels_remaining=pack.manifest.hotel_supply,
            players=[
                PlayerState(
                    user_id=actor.id,
                    display_name=actor.display_name,
                    balance=pack.manifest.starting_balance,
                )
            ],
        )
        self._append_event(game, "game.created", {"pack_id": pack_id})
        self._append_event(game, "player.joined", {"player_id": str(actor.id)})
        async with self._session.begin():
            await self._games.create(game)
        return game

    async def get(self, game_id: UUID, actor_id: UUID) -> GameState:
        game = await self._games.get(game_id)
        self._require_member(game, actor_id)
        return game

    async def join(self, game_id: UUID, actor: User) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = len(game.events)
            pack = self._pack(game)
            if any(player.user_id == actor.id for player in game.players):
                return game
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("the game already started")
            player_limit = game.settings.max_players or pack.manifest.max_players
            if len(game.players) >= player_limit:
                raise ConflictError("the game is full")
            game.spectators = [
                spectator
                for spectator in game.spectators
                if spectator.user_id != actor.id
            ]
            game.players.append(
                PlayerState(
                    user_id=actor.id,
                    display_name=actor.display_name,
                    balance=pack.manifest.starting_balance,
                )
            )
            self._append_event(game, "player.joined", {"player_id": str(actor.id)})
            await self._games.save(game, previous_sequence)
            return game

    async def watch(self, game_id: UUID, actor: User) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = len(game.events)
            if game.status is GameStatus.CANCELLED:
                raise ConflictError("the game was cancelled")
            if any(player.user_id == actor.id for player in game.players):
                return game
            if any(
                spectator.user_id == actor.id for spectator in game.spectators
            ):
                return game
            if not game.settings.allow_spectators:
                raise ConflictError("spectators are disabled for this game")
            if len(game.spectators) >= 50:
                raise ConflictError("the spectator list is full")
            game.spectators.append(
                SpectatorState(
                    user_id=actor.id,
                    display_name=actor.display_name,
                )
            )
            self._append_event(
                game,
                "spectator.joined",
                {
                    "spectator_id": str(actor.id),
                    "display_name": actor.display_name,
                },
            )
            await self._games.save(game, previous_sequence)
            return game

    async def update_settings(
        self,
        game_id: UUID,
        actor_id: UUID,
        data: UpdateGameSettingsRequest,
    ) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can update game settings")
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("game settings can only change in the lobby")
            previous_sequence = len(game.events)
            pack = self._pack(game)
            changes: dict[str, object] = {}
            if data.max_players is not None:
                if not (
                    pack.manifest.min_players
                    <= data.max_players
                    <= pack.manifest.max_players
                ):
                    raise ConflictError(
                        "max players must stay within the pack limits"
                    )
                if data.max_players < len(game.players):
                    raise ConflictError(
                        "max players cannot be lower than the current player count"
                    )
                game.settings.max_players = data.max_players
                changes["max_players"] = data.max_players
            if data.allow_spectators is not None:
                if not data.allow_spectators and game.spectators:
                    raise ConflictError(
                        "spectators must leave before disabling spectators"
                    )
                game.settings.allow_spectators = data.allow_spectators
                changes["allow_spectators"] = data.allow_spectators
            if data.rules is not None:
                allowed_rules = {
                    rule.value for rule in pack.manifest.configurable_rules
                }
                requested_rules = data.rules.model_dump(
                    exclude_none=True,
                    exclude_unset=True,
                )
                unavailable = sorted(requested_rules.keys() - allowed_rules)
                if unavailable:
                    raise ConflictError(
                        f"rules are not configurable for this pack: {unavailable}"
                    )
                for rule_name, value in requested_rules.items():
                    setattr(game.settings.rules, rule_name, value)
                changes["rules"] = requested_rules
            self._append_event(game, "game.settings_updated", changes)
            await self._games.save(game, previous_sequence)
            return game

    async def leave(self, game_id: UUID, actor_id: UUID) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = len(game.events)
            spectator = next(
                (
                    candidate
                    for candidate in game.spectators
                    if candidate.user_id == actor_id
                ),
                None,
            )
            if spectator is not None:
                game.spectators.remove(spectator)
                self._append_event(
                    game,
                    "spectator.left",
                    {
                        "spectator_id": str(actor_id),
                        "display_name": spectator.display_name,
                    },
                )
                await self._games.save(game, previous_sequence)
                return game

            player_index = next(
                (
                    index
                    for index, player in enumerate(game.players)
                    if player.user_id == actor_id
                ),
                None,
            )
            if player_index is None:
                raise ForbiddenError("the user is not a member of this game")
            player = game.players[player_index]
            if game.status is GameStatus.LOBBY:
                game.players.pop(player_index)
                self._append_event(
                    game,
                    "player.left",
                    {
                        "player_id": str(actor_id),
                        "display_name": player.display_name,
                    },
                )
                if not game.players:
                    game.status = GameStatus.CANCELLED
                    game.current_player_index = 0
                    self._append_event(game, "game.cancelled")
                else:
                    game.current_player_index = 0
                    if game.host_user_id == actor_id:
                        game.host_user_id = game.players[0].user_id
                        self._append_event(
                            game,
                            "host.transferred",
                            {"host_id": str(game.host_user_id)},
                        )
                await self._games.save(game, previous_sequence)
                return game
            if game.status in {GameStatus.FINISHED, GameStatus.CANCELLED}:
                return game
            if player.bankrupt:
                return game
            if (
                game.active_debt is not None
                and game.active_debt.debtor_id != actor_id
            ):
                raise ConflictError(
                    "a player cannot resign while another debt is being resolved"
                )
            if game.active_auction is not None:
                auction = game.active_auction
                if actor_id not in auction.passed_player_ids:
                    auction.passed_player_ids.append(actor_id)
                if auction.current_bidder_id == actor_id:
                    auction.current_bidder_id = None
                    auction.current_bid = 0
                self._resolve_auction_if_finished(game)
            if (
                game.current_player is not None
                and game.current_player.user_id == actor_id
            ):
                game.pending_tile_id = None
                game.extra_roll_pending = False
            if game.active_debt is None:
                game.active_debt = DebtState(
                    debtor_id=actor_id,
                    amount=max(player.balance + 1, 1),
                    reason=DebtReason.RESIGNATION,
                    tile_id="resignation",
                )
            self._append_event(
                game,
                "player.resigned",
                {
                    "player_id": str(actor_id),
                    "display_name": player.display_name,
                },
            )
            self._declare_bankruptcy(game, actor_id, forced=True)
            await self._games.save(game, previous_sequence)
            return game

    async def start(self, game_id: UUID, actor_id: UUID) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can start the game")
            previous_sequence = len(game.events)
            pack = self._pack(game)
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("the game already started")
            if len(game.players) < pack.manifest.min_players:
                raise ConflictError(
                    f"at least {pack.manifest.min_players} players are required"
                )
            game.status = GameStatus.PLAYING
            game.phase = TurnPhase.WAITING_FOR_ROLL
            for deck in pack.board.decks:
                game.deck_orders[deck.id] = self._card_shuffler(
                    [card.id for card in deck.cards]
                )
                game.deck_cursors[deck.id] = 0
            self._append_event(game, "game.started")
            await self._games.save(game, previous_sequence)
            return game

    async def execute(
        self,
        game_id: UUID,
        actor_id: UUID,
        command: GameCommand,
    ) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            self._require_participant(game, actor_id)
            previous_sequence = len(game.events)
            if game.status is not GameStatus.PLAYING:
                raise ConflictError("the game is not active")

            if game.active_auction is not None:
                if isinstance(command, BidCommand):
                    self._bid(game, actor_id, command.amount)
                elif isinstance(command, PassAuctionCommand):
                    self._pass_auction(game, actor_id)
                else:
                    raise ConflictError("the auction must finish before continuing")
            elif game.active_debt is not None:
                if actor_id != game.active_debt.debtor_id:
                    raise ConflictError("the debtor must resolve the outstanding debt")
                if isinstance(command, MortgagePropertyCommand):
                    self._mortgage_property(game, actor_id, command.property_id)
                elif isinstance(command, SellBuildingCommand):
                    self._sell_building(game, actor_id, command.property_id)
                elif isinstance(command, PayDebtCommand):
                    self._pay_debt(game, actor_id)
                elif isinstance(command, DeclareBankruptcyCommand):
                    self._declare_bankruptcy(game, actor_id)
                else:
                    raise ConflictError("the debt must be paid or bankruptcy declared")
            elif isinstance(command, MortgagePropertyCommand):
                self._mortgage_property(game, actor_id, command.property_id)
            elif isinstance(command, UnmortgagePropertyCommand):
                self._unmortgage_property(game, actor_id, command.property_id)
            elif isinstance(command, BuildPropertyCommand):
                self._build_property(game, actor_id, command.property_id)
            elif isinstance(command, SellBuildingCommand):
                self._sell_building(game, actor_id, command.property_id)
            elif isinstance(command, (PayDebtCommand, DeclareBankruptcyCommand)):
                raise ConflictError("there is no outstanding debt")
            elif isinstance(command, ProposeTradeCommand):
                self._propose_trade(game, actor_id, command)
            elif isinstance(command, AcceptTradeCommand):
                self._accept_trade(game, actor_id, command)
            elif isinstance(command, RejectTradeCommand):
                self._reject_trade(game, actor_id, command)
            elif isinstance(command, CancelTradeCommand):
                self._cancel_trade(game, actor_id, command)
            elif isinstance(command, (BidCommand, PassAuctionCommand)):
                raise ConflictError("there is no active auction")
            else:
                self._execute_turn_command(game, actor_id, command)
            await self._games.save(game, previous_sequence)
            return game

    def _execute_turn_command(
        self,
        game: GameState,
        actor_id: UUID,
        command: GameCommand,
    ) -> None:
        player = game.current_player
        if player is None or player.user_id != actor_id:
            raise ConflictError("it is not this player's turn")
        if isinstance(command, RollCommand):
            self._roll(game, player)
        elif isinstance(command, PayJailFineCommand):
            self._pay_jail_fine(game, player)
        elif isinstance(command, UseJailCardCommand):
            self._use_jail_card(game, player)
        elif isinstance(command, BuyPropertyCommand):
            self._buy_property(game, player)
        elif isinstance(command, DeclinePropertyCommand):
            if game.settings.rules.auction_unpurchased_properties:
                self._start_auction(game)
            else:
                property_id = game.pending_tile_id
                game.pending_tile_id = None
                game.phase = TurnPhase.WAITING_FOR_END
                self._append_event(
                    game,
                    "property.declined",
                    {
                        "player_id": str(player.user_id),
                        "property_id": property_id,
                    },
                )
        elif isinstance(command, EndTurnCommand):
            self._end_turn(game)

    def _roll(self, game: GameState, player: PlayerState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_ROLL:
            raise ConflictError("the dice cannot be rolled now")
        pack = self._pack(game)
        dice = self._dice_roller()
        game.last_roll = dice
        game.pending_tile_id = None
        game.last_card_id = None
        if player.in_jail:
            self._roll_from_jail(game, player, dice)
            return

        is_double = dice[0] == dice[1]
        game.consecutive_doubles = game.consecutive_doubles + 1 if is_double else 0
        if game.consecutive_doubles >= pack.manifest.max_consecutive_doubles:
            self._append_event(
                game,
                "dice.rolled",
                {
                    "player_id": str(player.user_id),
                    "dice": list(dice),
                    "position": player.position,
                    "consecutive_doubles": game.consecutive_doubles,
                },
            )
            self._send_to_jail(game, player, "consecutive_doubles")
            return

        game.extra_roll_pending = is_double
        self._move_forward(game, player, sum(dice))
        tile = pack.board.tiles[player.position]
        if (
            tile.kind in {TileKind.PROPERTY, TileKind.TRANSPORT, TileKind.UTILITY}
            and tile.id not in game.owners
        ):
            game.pending_tile_id = tile.id
            game.phase = TurnPhase.BUY_DECISION
        else:
            game.phase = TurnPhase.WAITING_FOR_END
        self._append_event(
            game,
            "dice.rolled",
            {
                "player_id": str(player.user_id),
                "dice": list(dice),
                "position": player.position,
                "tile_id": tile.id,
                "is_double": is_double,
            },
        )
        if game.phase is TurnPhase.WAITING_FOR_END:
            self._resolve_landed_tile(game, player, tile.id, sum(dice))

    def _roll_from_jail(
        self,
        game: GameState,
        player: PlayerState,
        dice: tuple[int, int],
    ) -> None:
        pack = self._pack(game)
        is_double = dice[0] == dice[1]
        self._append_event(
            game,
            "dice.rolled",
            {
                "player_id": str(player.user_id),
                "dice": list(dice),
                "position": player.position,
                "jail_attempt": True,
                "is_double": is_double,
            },
        )
        if not is_double:
            player.jail_failed_rolls += 1
            if player.jail_failed_rolls < pack.manifest.jail_max_failed_rolls:
                game.phase = TurnPhase.WAITING_FOR_END
                self._append_event(
                    game,
                    "jail.roll_failed",
                    {
                        "player_id": str(player.user_id),
                        "failed_rolls": player.jail_failed_rolls,
                    },
                )
                return
            player.in_jail = False
            player.jail_failed_rolls = 0
            self._charge_player(
                game,
                player,
                amount=pack.manifest.jail_fine,
                creditor_id=None,
                reason=DebtReason.JAIL_FINE,
                tile_id=self._jail_tile(game).id,
            )
            self._append_event(
                game,
                "jail.released",
                {"player_id": str(player.user_id), "method": "forced_fine"},
            )
        else:
            player.in_jail = False
            player.jail_failed_rolls = 0
            self._append_event(
                game,
                "jail.released",
                {"player_id": str(player.user_id), "method": "doubles"},
            )

        game.consecutive_doubles = 0
        game.extra_roll_pending = False
        self._move_forward(game, player, sum(dice))
        tile = pack.board.tiles[player.position]
        if (
            tile.kind in {TileKind.PROPERTY, TileKind.TRANSPORT, TileKind.UTILITY}
            and tile.id not in game.owners
        ):
            game.pending_tile_id = tile.id
            game.phase = TurnPhase.BUY_DECISION
        else:
            game.phase = TurnPhase.WAITING_FOR_END
            if game.active_debt is None:
                self._resolve_landed_tile(game, player, tile.id, sum(dice))

    def _pay_jail_fine(self, game: GameState, player: PlayerState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_ROLL or not player.in_jail:
            raise ConflictError("the player cannot pay a jail fine now")
        fine = self._pack(game).manifest.jail_fine
        if player.balance < fine:
            raise ConflictError("insufficient balance")
        player.balance -= fine
        self._deposit_bank_pot(game, fine, DebtReason.JAIL_FINE)
        player.in_jail = False
        player.jail_failed_rolls = 0
        self._append_event(
            game,
            "jail.released",
            {
                "player_id": str(player.user_id),
                "method": "fine",
                "amount": fine,
            },
        )

    def _use_jail_card(self, game: GameState, player: PlayerState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_ROLL or not player.in_jail:
            raise ConflictError("the player cannot use a jail card now")
        if not player.jail_card_ids:
            raise ConflictError("the player does not have a jail card")
        card_id = player.jail_card_ids.pop(0)
        player.in_jail = False
        player.jail_failed_rolls = 0
        self._append_event(
            game,
            "jail.released",
            {
                "player_id": str(player.user_id),
                "method": "card",
                "card_id": card_id,
            },
        )

    def _buy_property(self, game: GameState, player: PlayerState) -> None:
        if game.phase is not TurnPhase.BUY_DECISION or game.pending_tile_id is None:
            raise ConflictError("there is no property available to buy")
        pack = self._pack(game)
        tile = next(tile for tile in pack.board.tiles if tile.id == game.pending_tile_id)
        price = tile.price or 0
        if player.balance < price:
            raise ConflictError("insufficient balance")
        player.balance -= price
        game.owners[tile.id] = player.user_id
        game.pending_tile_id = None
        game.phase = TurnPhase.WAITING_FOR_END
        self._append_event(
            game,
            "property.purchased",
            {
                "player_id": str(player.user_id),
                "tile_id": tile.id,
                "price": price,
            },
        )

    def _resolve_landed_tile(
        self,
        game: GameState,
        player: PlayerState,
        tile_id: str,
        dice_total: int,
    ) -> None:
        tile = self._tile(game, tile_id)
        if tile.kind is TileKind.GO_TO_JAIL:
            self._send_to_jail(game, player, "tile")
            return
        if tile.kind is TileKind.CARD:
            self._draw_card(game, player, tile.deck_id or "")
            return
        if tile.kind is TileKind.TAX:
            self._charge_player(
                game,
                player,
                amount=tile.amount or 0,
                creditor_id=None,
                reason=DebtReason.TAX,
                tile_id=tile.id,
            )
            return
        if (
            tile.kind is TileKind.FREE
            and game.settings.rules.free_parking_jackpot
            and game.bank_pot > 0
        ):
            amount = game.bank_pot
            game.bank_pot = 0
            player.balance += amount
            self._append_event(
                game,
                "free_parking.collected",
                {
                    "player_id": str(player.user_id),
                    "amount": amount,
                    "tile_id": tile.id,
                },
            )
            return
        owner_id = game.owners.get(tile.id)
        if (
            owner_id is None
            or owner_id == player.user_id
            or tile.id in game.mortgaged_property_ids
        ):
            return
        rent = self._calculate_rent(game, tile, owner_id, dice_total)
        self._charge_player(
            game,
            player,
            amount=rent,
            creditor_id=owner_id,
            reason=DebtReason.RENT,
            tile_id=tile.id,
        )

    def _draw_card(
        self,
        game: GameState,
        player: PlayerState,
        deck_id: str,
    ) -> None:
        pack = self._pack(game)
        deck = next((item for item in pack.board.decks if item.id == deck_id), None)
        if deck is None:
            raise ConflictError("the card deck does not exist")
        order = game.deck_orders.get(deck_id)
        if not order:
            order = [card.id for card in deck.cards]
            game.deck_orders[deck_id] = order
            game.deck_cursors[deck_id] = 0
        held_cards = {
            card_id
            for candidate in game.players
            for card_id in candidate.jail_card_ids
        }
        cursor = game.deck_cursors.get(deck_id, 0) % len(order)
        card_id = None
        for offset in range(len(order)):
            candidate_id = order[(cursor + offset) % len(order)]
            if candidate_id not in held_cards:
                card_id = candidate_id
                game.deck_cursors[deck_id] = (cursor + offset + 1) % len(order)
                break
        if card_id is None:
            self._append_event(game, "card.deck_empty", {"deck_id": deck_id})
            return
        card = next(item for item in deck.cards if item.id == card_id)
        game.last_card_id = card.id
        self._append_event(
            game,
            "card.drawn",
            {
                "player_id": str(player.user_id),
                "deck_id": deck_id,
                "card_id": card.id,
            },
        )
        effect = card.effect
        if isinstance(effect, CashCardEffect):
            if effect.amount >= 0:
                player.balance += effect.amount
                self._append_event(
                    game,
                    "card.cash_applied",
                    {
                        "player_id": str(player.user_id),
                        "card_id": card.id,
                        "amount": effect.amount,
                    },
                )
            else:
                self._charge_player(
                    game,
                    player,
                    amount=abs(effect.amount),
                    creditor_id=None,
                    reason=DebtReason.CARD,
                    tile_id=card.id,
                )
            return
        if isinstance(effect, MoveToCardEffect):
            target_position = next(
                index
                for index, tile in enumerate(pack.board.tiles)
                if tile.id == effect.tile_id
            )
            steps = (target_position - player.position) % pack.manifest.tile_count
            if effect.collect_start:
                self._move_forward(game, player, steps)
            else:
                player.position = target_position
            self._resolve_card_destination(game, player, card.id)
            return
        if isinstance(effect, MoveRelativeCardEffect):
            if effect.steps > 0 and effect.collect_start:
                self._move_forward(game, player, effect.steps)
            else:
                player.position = (
                    player.position + effect.steps
                ) % pack.manifest.tile_count
            self._resolve_card_destination(game, player, card.id)
            return
        if isinstance(effect, MoveToNearestCardEffect):
            target_kind = TileKind(effect.tile_kind)
            candidates = [
                index
                for index, tile in enumerate(pack.board.tiles)
                if tile.kind is target_kind
            ]
            if not candidates:
                raise ConflictError(
                    f"the board does not define a {effect.tile_kind} tile"
                )
            target_position = min(
                candidates,
                key=lambda index: (
                    (index - player.position) % pack.manifest.tile_count
                    or pack.manifest.tile_count
                ),
            )
            steps = (
                target_position - player.position
            ) % pack.manifest.tile_count or pack.manifest.tile_count
            if effect.collect_start:
                self._move_forward(game, player, steps)
            else:
                player.position = target_position
            self._resolve_nearest_card_destination(
                game,
                player,
                card.id,
                effect,
            )
            return
        if isinstance(effect, RepairsCardEffect):
            house_count = sum(
                level if level < 5 else 0
                for property_id, level in game.building_levels.items()
                if game.owners.get(property_id) == player.user_id
            )
            hotel_count = sum(
                level == 5
                for property_id, level in game.building_levels.items()
                if game.owners.get(property_id) == player.user_id
            )
            amount = (
                house_count * effect.house_amount
                + hotel_count * effect.hotel_amount
            )
            self._append_event(
                game,
                "card.repairs_assessed",
                {
                    "player_id": str(player.user_id),
                    "card_id": card.id,
                    "houses": house_count,
                    "hotels": hotel_count,
                    "amount": amount,
                },
            )
            self._charge_player(
                game,
                player,
                amount=amount,
                creditor_id=None,
                reason=DebtReason.CARD,
                tile_id=card.id,
            )
            return
        if isinstance(effect, CashEachCardEffect):
            active_others = [
                candidate
                for candidate in game.players
                if candidate.user_id != player.user_id and not candidate.bankrupt
            ]
            if effect.amount > 0:
                payments = [
                    CardPaymentState(
                        payer_id=candidate.user_id,
                        recipient_id=player.user_id,
                        amount=effect.amount,
                        card_id=card.id,
                    )
                    for candidate in active_others
                ]
            else:
                payments = [
                    CardPaymentState(
                        payer_id=player.user_id,
                        recipient_id=candidate.user_id,
                        amount=abs(effect.amount),
                        card_id=card.id,
                    )
                    for candidate in active_others
                ]
            game.pending_card_payments.extend(payments)
            self._process_card_payments(game)
            return
        if isinstance(effect, GoToJailCardEffect):
            self._send_to_jail(game, player, "card")
            return
        if isinstance(effect, GetOutOfJailCardEffect):
            player.jail_card_ids.append(card.id)

    def _resolve_card_destination(
        self,
        game: GameState,
        player: PlayerState,
        card_id: str,
    ) -> None:
        target = self._pack(game).board.tiles[player.position]
        game.pending_tile_id = None
        self._append_event(
            game,
            "card.player_moved",
            {
                "player_id": str(player.user_id),
                "card_id": card_id,
                "tile_id": target.id,
                "position": player.position,
            },
        )
        if (
            target.kind
            in {TileKind.PROPERTY, TileKind.TRANSPORT, TileKind.UTILITY}
            and target.id not in game.owners
        ):
            game.pending_tile_id = target.id
            game.phase = TurnPhase.BUY_DECISION
            return
        game.phase = TurnPhase.WAITING_FOR_END
        if target.kind is not TileKind.CARD:
            self._resolve_landed_tile(game, player, target.id, 0)

    def _resolve_nearest_card_destination(
        self,
        game: GameState,
        player: PlayerState,
        card_id: str,
        effect: MoveToNearestCardEffect,
    ) -> None:
        tile = self._pack(game).board.tiles[player.position]
        game.pending_tile_id = None
        self._append_event(
            game,
            "card.player_moved",
            {
                "player_id": str(player.user_id),
                "card_id": card_id,
                "tile_id": tile.id,
                "position": player.position,
            },
        )
        owner_id = game.owners.get(tile.id)
        if owner_id is None:
            game.pending_tile_id = tile.id
            game.phase = TurnPhase.BUY_DECISION
            return
        game.phase = TurnPhase.WAITING_FOR_END
        if owner_id == player.user_id or tile.id in game.mortgaged_property_ids:
            return
        dice_total = 0
        if effect.dice_multiplier is not None:
            dice = self._dice_roller()
            dice_total = sum(dice)
            rent = dice_total * effect.dice_multiplier
            self._append_event(
                game,
                "card.utility_dice_rolled",
                {
                    "player_id": str(player.user_id),
                    "card_id": card_id,
                    "dice": list(dice),
                },
            )
        else:
            rent = (
                self._calculate_rent(game, tile, owner_id, dice_total)
                * effect.rent_multiplier
            )
        self._charge_player(
            game,
            player,
            amount=rent,
            creditor_id=owner_id,
            reason=DebtReason.RENT,
            tile_id=tile.id,
        )

    def _move_forward(
        self,
        game: GameState,
        player: PlayerState,
        steps: int,
    ) -> None:
        if steps < 0:
            raise ValueError("forward movement cannot use negative steps")
        pack = self._pack(game)
        tile_count = pack.manifest.tile_count
        start_position = next(
            index
            for index, tile in enumerate(pack.board.tiles)
            if tile.kind is TileKind.START
        )
        old_position = player.position
        distance_to_start = (start_position - old_position) % tile_count
        if distance_to_start == 0:
            distance_to_start = tile_count
        crossings = (
            0
            if steps < distance_to_start
            else 1 + (steps - distance_to_start) // tile_count
        )
        player.position = (old_position + steps) % tile_count
        if crossings == 0:
            return
        amount = crossings * pack.manifest.pass_start_salary
        if (
            game.settings.rules.double_salary_on_start
            and player.position == start_position
        ):
            amount += pack.manifest.pass_start_salary
        player.balance += amount
        self._append_event(
            game,
            "salary.collected",
            {
                "player_id": str(player.user_id),
                "amount": amount,
                "crossings": crossings,
                "landed_on_start": player.position == start_position,
            },
        )

    def _process_card_payments(self, game: GameState) -> None:
        while game.pending_card_payments and game.active_debt is None:
            payment = game.pending_card_payments.pop(0)
            payer = self._player(game, payment.payer_id)
            recipient = self._player(game, payment.recipient_id)
            if payer.bankrupt or recipient.bankrupt:
                continue
            self._append_event(
                game,
                "card.cash_each_applied",
                {
                    "payer_id": str(payer.user_id),
                    "recipient_id": str(recipient.user_id),
                    "amount": payment.amount,
                    "card_id": payment.card_id,
                },
            )
            self._charge_player(
                game,
                payer,
                amount=payment.amount,
                creditor_id=recipient.user_id,
                reason=DebtReason.CARD,
                tile_id=payment.card_id,
            )

    def _send_to_jail(
        self,
        game: GameState,
        player: PlayerState,
        reason: str,
    ) -> None:
        jail_tile = self._jail_tile(game)
        pack = self._pack(game)
        player.position = next(
            index for index, tile in enumerate(pack.board.tiles) if tile.id == jail_tile.id
        )
        player.in_jail = True
        player.jail_failed_rolls = 0
        game.pending_tile_id = None
        game.phase = TurnPhase.WAITING_FOR_END
        game.extra_roll_pending = False
        game.consecutive_doubles = 0
        self._append_event(
            game,
            "jail.entered",
            {"player_id": str(player.user_id), "reason": reason},
        )

    def _calculate_rent(
        self,
        game: GameState,
        tile: TileDefinition,
        owner_id: UUID,
        dice_total: int,
    ) -> int:
        pack = self._pack(game)
        if tile.kind is TileKind.PROPERTY:
            level = game.building_levels.get(tile.id, 0)
            rent_levels = tile.rent_levels or [tile.base_rent or 0]
            rent = rent_levels[level]
            group_tiles = self._group_tiles(game, tile)
            if (
                level == 0
                and all(game.owners.get(item.id) == owner_id for item in group_tiles)
                and not any(
                    item.id in game.mortgaged_property_ids for item in group_tiles
                )
            ):
                rent *= pack.manifest.monopoly_rent_multiplier
            return rent
        owned_kind_count = sum(
            owner == owner_id and self._tile(game, property_id).kind is tile.kind
            for property_id, owner in game.owners.items()
        )
        if tile.kind is TileKind.TRANSPORT:
            rent_levels = tile.rent_levels or [tile.base_rent or 0]
            return rent_levels[min(owned_kind_count, len(rent_levels)) - 1]
        if tile.kind is TileKind.UTILITY:
            multipliers = tile.rent_multipliers or [1]
            return dice_total * multipliers[min(owned_kind_count, len(multipliers)) - 1]
        return 0

    def _charge_player(
        self,
        game: GameState,
        player: PlayerState,
        *,
        amount: int,
        creditor_id: UUID | None,
        reason: DebtReason,
        tile_id: str,
    ) -> None:
        if amount <= 0:
            return
        if player.balance >= amount:
            player.balance -= amount
            if creditor_id is not None:
                self._player(game, creditor_id).balance += amount
            else:
                self._deposit_bank_pot(game, amount, reason)
            self._append_event(
                game,
                "payment.completed",
                {
                    "debtor_id": str(player.user_id),
                    "creditor_id": str(creditor_id) if creditor_id else None,
                    "amount": amount,
                    "reason": reason.value,
                    "tile_id": tile_id,
                },
            )
            return
        game.active_debt = DebtState(
            debtor_id=player.user_id,
            creditor_id=creditor_id,
            amount=amount,
            reason=reason,
            tile_id=tile_id,
        )
        self._append_event(
            game,
            "debt.created",
            {
                "debtor_id": str(player.user_id),
                "creditor_id": str(creditor_id) if creditor_id else None,
                "amount": amount,
                "reason": reason.value,
                "tile_id": tile_id,
            },
        )

    def _deposit_bank_pot(
        self,
        game: GameState,
        amount: int,
        reason: DebtReason,
    ) -> None:
        if (
            game.settings.rules.free_parking_jackpot
            and reason in {DebtReason.TAX, DebtReason.CARD, DebtReason.JAIL_FINE}
        ):
            game.bank_pot += amount
            self._append_event(
                game,
                "bank_pot.increased",
                {
                    "amount": amount,
                    "balance": game.bank_pot,
                    "reason": reason.value,
                },
            )

    def _end_turn(self, game: GameState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_END:
            raise ConflictError("the turn cannot end now")
        game.pending_tile_id = None
        current = game.current_player
        if (
            game.extra_roll_pending
            and current is not None
            and not current.in_jail
        ):
            game.extra_roll_pending = False
            game.phase = TurnPhase.WAITING_FOR_ROLL
            self._append_event(
                game,
                "turn.extra_roll",
                {"player_id": str(current.user_id)},
            )
            return
        self._advance_to_next_active_player(game)

    def _mortgage_property(
        self,
        game: GameState,
        actor_id: UUID,
        property_id: str,
    ) -> None:
        player = self._active_player(game, actor_id)
        tile = self._owned_tile(game, actor_id, property_id)
        if property_id in game.mortgaged_property_ids:
            raise ConflictError("the property is already mortgaged")
        if tile.kind is TileKind.PROPERTY and any(
            game.building_levels.get(item.id, 0) > 0
            for item in self._group_tiles(game, tile)
        ):
            raise ConflictError("all buildings in the group must be sold first")
        value = tile.mortgage_value or 0
        player.balance += value
        game.mortgaged_property_ids.append(property_id)
        self._append_event(
            game,
            "property.mortgaged",
            {
                "player_id": str(actor_id),
                "property_id": property_id,
                "amount": value,
            },
        )

    def _unmortgage_property(
        self,
        game: GameState,
        actor_id: UUID,
        property_id: str,
    ) -> None:
        player = self._active_player(game, actor_id)
        tile = self._owned_tile(game, actor_id, property_id)
        if property_id not in game.mortgaged_property_ids:
            raise ConflictError("the property is not mortgaged")
        pack = self._pack(game)
        value = tile.mortgage_value or 0
        interest = (value * pack.manifest.mortgage_interest_percent + 99) // 100
        cost = value + interest
        if player.balance < cost:
            raise ConflictError("insufficient balance")
        player.balance -= cost
        game.mortgaged_property_ids.remove(property_id)
        self._append_event(
            game,
            "property.unmortgaged",
            {
                "player_id": str(actor_id),
                "property_id": property_id,
                "amount": cost,
            },
        )

    def _build_property(
        self,
        game: GameState,
        actor_id: UUID,
        property_id: str,
    ) -> None:
        player = self._active_player(game, actor_id)
        tile = self._owned_tile(game, actor_id, property_id)
        if tile.kind is not TileKind.PROPERTY:
            raise ConflictError("buildings are only allowed on properties")
        group_tiles = self._group_tiles(game, tile)
        if not all(game.owners.get(item.id) == actor_id for item in group_tiles):
            raise ConflictError("the complete property group is required")
        if any(item.id in game.mortgaged_property_ids for item in group_tiles):
            raise ConflictError("mortgaged groups cannot be developed")
        levels = {item.id: game.building_levels.get(item.id, 0) for item in group_tiles}
        current_level = levels[property_id]
        if current_level >= 5:
            raise ConflictError("the property already has a hotel")
        if current_level != min(levels.values()):
            raise ConflictError("buildings must be distributed evenly")
        cost = tile.build_cost or 0
        if player.balance < cost:
            raise ConflictError("insufficient balance")
        if current_level < 4:
            if game.houses_remaining < 1:
                raise ConflictError("there are no houses available")
            game.houses_remaining -= 1
        else:
            if game.hotels_remaining < 1:
                raise ConflictError("there are no hotels available")
            game.hotels_remaining -= 1
            game.houses_remaining += 4
        player.balance -= cost
        game.building_levels[property_id] = current_level + 1
        self._append_event(
            game,
            "building.purchased",
            {
                "player_id": str(actor_id),
                "property_id": property_id,
                "level": current_level + 1,
                "amount": cost,
            },
        )

    def _sell_building(
        self,
        game: GameState,
        actor_id: UUID,
        property_id: str,
    ) -> None:
        player = self._active_player(game, actor_id)
        tile = self._owned_tile(game, actor_id, property_id)
        if tile.kind is not TileKind.PROPERTY:
            raise ConflictError("this property cannot have buildings")
        group_tiles = self._group_tiles(game, tile)
        levels = {item.id: game.building_levels.get(item.id, 0) for item in group_tiles}
        current_level = levels[property_id]
        if current_level <= 0:
            raise ConflictError("the property has no buildings")
        if current_level != max(levels.values()):
            raise ConflictError("buildings must be sold evenly")
        pack = self._pack(game)
        refund = (tile.build_cost or 0) * pack.manifest.building_sell_percent // 100
        if current_level < 5:
            game.houses_remaining += 1
        else:
            if game.houses_remaining < 4:
                raise ConflictError("four houses are required to sell this hotel")
            game.houses_remaining -= 4
            game.hotels_remaining += 1
        player.balance += refund
        if current_level == 1:
            game.building_levels.pop(property_id, None)
        else:
            game.building_levels[property_id] = current_level - 1
        self._append_event(
            game,
            "building.sold",
            {
                "player_id": str(actor_id),
                "property_id": property_id,
                "level": current_level - 1,
                "amount": refund,
            },
        )

    def _pay_debt(self, game: GameState, actor_id: UUID) -> None:
        debt = game.active_debt
        if debt is None or debt.debtor_id != actor_id:
            raise ConflictError("there is no outstanding debt for this player")
        player = self._active_player(game, actor_id)
        if player.balance < debt.amount:
            raise ConflictError("insufficient balance")
        player.balance -= debt.amount
        if debt.creditor_id is not None:
            self._player(game, debt.creditor_id).balance += debt.amount
        else:
            self._deposit_bank_pot(game, debt.amount, debt.reason)
        self._append_event(
            game,
            "debt.paid",
            {
                "debtor_id": str(actor_id),
                "creditor_id": str(debt.creditor_id) if debt.creditor_id else None,
                "amount": debt.amount,
            },
        )
        game.active_debt = None
        self._process_card_payments(game)

    def _declare_bankruptcy(
        self,
        game: GameState,
        actor_id: UUID,
        *,
        forced: bool = False,
    ) -> None:
        debt = game.active_debt
        if debt is None or debt.debtor_id != actor_id:
            raise ConflictError("there is no outstanding debt for this player")
        player = self._active_player(game, actor_id)
        if not forced and player.balance >= debt.amount:
            raise ConflictError("the debt can be paid with the available balance")
        pack = self._pack(game)
        owned_property_ids = [
            property_id
            for property_id, owner_id in game.owners.items()
            if owner_id == actor_id
        ]
        liquidation = sum(
            (self._tile(game, property_id).build_cost or 0)
            * game.building_levels.get(property_id, 0)
            * pack.manifest.building_sell_percent
            // 100
            for property_id in owned_property_ids
        )
        for property_id in owned_property_ids:
            level = game.building_levels.get(property_id, 0)
            if level == 5:
                game.hotels_remaining += 1
            else:
                game.houses_remaining += level
        player.balance += liquidation
        transferred_amount = player.balance
        if debt.creditor_id is None:
            board_order = {
                tile.id: index for index, tile in enumerate(pack.board.tiles)
            }
            for property_id in sorted(
                owned_property_ids,
                key=lambda item: board_order[item],
            ):
                game.owners.pop(property_id, None)
                if property_id in game.mortgaged_property_ids:
                    game.mortgaged_property_ids.remove(property_id)
                game.bank_auction_queue.append(property_id)
        else:
            creditor = self._active_player(game, debt.creditor_id)
            creditor.balance += transferred_amount
            for property_id in owned_property_ids:
                game.owners[property_id] = creditor.user_id
        for property_id in owned_property_ids:
            game.building_levels.pop(property_id, None)
        player.balance = 0
        player.bankrupt = True
        game.pending_card_payments = [
            payment
            for payment in game.pending_card_payments
            if actor_id not in {payment.payer_id, payment.recipient_id}
        ]
        cancelled_trade_ids = []
        for trade in game.trades:
            if (
                trade.status is TradeStatus.PENDING
                and actor_id in {trade.proposer_id, trade.recipient_id}
            ):
                trade.status = TradeStatus.CANCELLED
                trade.resolved_at = datetime.now(UTC)
                cancelled_trade_ids.append(str(trade.id))
        game.active_debt = None
        self._append_event(
            game,
            "player.bankrupt",
            {
                "player_id": str(actor_id),
                "creditor_id": str(debt.creditor_id) if debt.creditor_id else None,
                "transferred_amount": transferred_amount,
                "property_ids": owned_property_ids,
                "cancelled_trade_ids": cancelled_trade_ids,
            },
        )
        active_players = [candidate for candidate in game.players if not candidate.bankrupt]
        if len(active_players) == 1:
            game.status = GameStatus.FINISHED
            game.active_auction = None
            game.bank_auction_queue.clear()
            game.pending_card_payments.clear()
            self._append_event(
                game,
                "game.finished",
                {"winner_id": str(active_players[0].user_id)},
            )
            return
        if game.current_player is not None and game.current_player.user_id == actor_id:
            self._advance_to_next_active_player(game)
        self._start_next_bank_auction(game)
        if game.active_auction is None:
            self._process_card_payments(game)

    def _start_auction(self, game: GameState) -> None:
        if game.phase is not TurnPhase.BUY_DECISION or game.pending_tile_id is None:
            raise ConflictError("there is no property available for auction")
        eligible_player_ids = [
            player.user_id for player in game.players if not player.bankrupt
        ]
        if len(eligible_player_ids) < 2:
            raise ConflictError("at least two active players are required for an auction")
        property_id = game.pending_tile_id
        game.active_auction = AuctionState(
            property_id=property_id,
            eligible_player_ids=eligible_player_ids,
        )
        game.pending_tile_id = None
        game.phase = TurnPhase.WAITING_FOR_END
        self._append_event(
            game,
            "auction.started",
            {
                "property_id": property_id,
                "eligible_player_ids": [
                    str(player_id) for player_id in eligible_player_ids
                ],
            },
        )

    def _start_next_bank_auction(self, game: GameState) -> None:
        if game.active_auction is not None or not game.bank_auction_queue:
            return
        eligible_player_ids = [
            player.user_id for player in game.players if not player.bankrupt
        ]
        if len(eligible_player_ids) < 2:
            game.bank_auction_queue.clear()
            return
        property_id = game.bank_auction_queue.pop(0)
        game.active_auction = AuctionState(
            property_id=property_id,
            eligible_player_ids=eligible_player_ids,
        )
        self._append_event(
            game,
            "auction.started",
            {
                "property_id": property_id,
                "eligible_player_ids": [
                    str(player_id) for player_id in eligible_player_ids
                ],
                "source": "bankruptcy",
            },
        )

    def _bid(self, game: GameState, actor_id: UUID, amount: int) -> None:
        auction = game.active_auction
        if auction is None:
            raise ConflictError("there is no active auction")
        if actor_id not in auction.eligible_player_ids:
            raise ConflictError("the player cannot participate in this auction")
        if actor_id in auction.passed_player_ids:
            raise ConflictError("the player already passed")
        if amount <= auction.current_bid:
            raise ConflictError("the bid must be higher than the current bid")
        player = self._player(game, actor_id)
        if player.balance < amount:
            raise ConflictError("insufficient balance")
        auction.current_bid = amount
        auction.current_bidder_id = actor_id
        self._append_event(
            game,
            "auction.bid_placed",
            {
                "property_id": auction.property_id,
                "player_id": str(actor_id),
                "amount": amount,
            },
        )
        self._resolve_auction_if_finished(game)

    def _pass_auction(self, game: GameState, actor_id: UUID) -> None:
        auction = game.active_auction
        if auction is None:
            raise ConflictError("there is no active auction")
        if actor_id not in auction.eligible_player_ids:
            raise ConflictError("the player cannot participate in this auction")
        if actor_id == auction.current_bidder_id:
            raise ConflictError("the highest bidder cannot pass")
        if actor_id in auction.passed_player_ids:
            raise ConflictError("the player already passed")
        auction.passed_player_ids.append(actor_id)
        self._append_event(
            game,
            "auction.player_passed",
            {
                "property_id": auction.property_id,
                "player_id": str(actor_id),
            },
        )
        self._resolve_auction_if_finished(game)

    def _resolve_auction_if_finished(self, game: GameState) -> None:
        auction = game.active_auction
        if auction is None:
            return
        remaining = [
            player_id
            for player_id in auction.eligible_player_ids
            if player_id not in auction.passed_player_ids
        ]
        if auction.current_bidder_id is not None and remaining == [
            auction.current_bidder_id
        ]:
            winner = self._player(game, auction.current_bidder_id)
            if winner.balance < auction.current_bid:
                raise ConflictError("the highest bidder no longer has sufficient balance")
            winner.balance -= auction.current_bid
            game.owners[auction.property_id] = winner.user_id
            self._append_event(
                game,
                "auction.completed",
                {
                    "property_id": auction.property_id,
                    "winner_id": str(winner.user_id),
                    "amount": auction.current_bid,
                },
            )
            game.active_auction = None
            self._start_next_bank_auction(game)
        elif not remaining:
            self._append_event(
                game,
                "auction.completed",
                {
                    "property_id": auction.property_id,
                    "winner_id": None,
                    "amount": 0,
                },
            )
            game.active_auction = None
            self._start_next_bank_auction(game)

    def _propose_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: ProposeTradeCommand,
    ) -> None:
        if game.active_auction is not None:
            raise ConflictError("trades are unavailable during an auction")
        if command.recipient_id == actor_id:
            raise ConflictError("a player cannot trade with themselves")
        self._player(game, command.recipient_id)
        if sum(trade.status is TradeStatus.PENDING for trade in game.trades) >= 20:
            raise ConflictError("the game has too many pending trades")
        self._validate_trade_assets(
            game,
            proposer_id=actor_id,
            recipient_id=command.recipient_id,
            offered_cash=command.offered_cash,
            requested_cash=command.requested_cash,
            offered_property_ids=command.offered_property_ids,
            requested_property_ids=command.requested_property_ids,
        )
        if len(game.trades) >= 100:
            pending = [
                trade for trade in game.trades if trade.status is TradeStatus.PENDING
            ]
            resolved = [
                trade for trade in game.trades if trade.status is not TradeStatus.PENDING
            ]
            game.trades = resolved[-(99 - len(pending)) :] + pending
        trade = TradeOffer(
            proposer_id=actor_id,
            recipient_id=command.recipient_id,
            offered_cash=command.offered_cash,
            requested_cash=command.requested_cash,
            offered_property_ids=command.offered_property_ids,
            requested_property_ids=command.requested_property_ids,
        )
        game.trades.append(trade)
        self._append_event(
            game,
            "trade.proposed",
            {
                "trade_id": str(trade.id),
                "proposer_id": str(actor_id),
                "recipient_id": str(command.recipient_id),
            },
        )

    def _accept_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: AcceptTradeCommand,
    ) -> None:
        if game.active_auction is not None:
            raise ConflictError("trades are unavailable during an auction")
        trade = self._pending_trade(game, command.trade_id)
        if trade.recipient_id != actor_id:
            raise ForbiddenError("only the recipient can accept this trade")
        self._validate_trade_assets(
            game,
            proposer_id=trade.proposer_id,
            recipient_id=trade.recipient_id,
            offered_cash=trade.offered_cash,
            requested_cash=trade.requested_cash,
            offered_property_ids=trade.offered_property_ids,
            requested_property_ids=trade.requested_property_ids,
        )
        proposer = self._player(game, trade.proposer_id)
        recipient = self._player(game, trade.recipient_id)
        proposer.balance += trade.requested_cash - trade.offered_cash
        recipient.balance += trade.offered_cash - trade.requested_cash
        for property_id in trade.offered_property_ids:
            game.owners[property_id] = recipient.user_id
        for property_id in trade.requested_property_ids:
            game.owners[property_id] = proposer.user_id
        self._resolve_trade(game, trade, TradeStatus.ACCEPTED, actor_id)

    def _reject_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: RejectTradeCommand,
    ) -> None:
        trade = self._pending_trade(game, command.trade_id)
        if trade.recipient_id != actor_id:
            raise ForbiddenError("only the recipient can reject this trade")
        self._resolve_trade(game, trade, TradeStatus.REJECTED, actor_id)

    def _cancel_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: CancelTradeCommand,
    ) -> None:
        trade = self._pending_trade(game, command.trade_id)
        if trade.proposer_id != actor_id:
            raise ForbiddenError("only the proposer can cancel this trade")
        self._resolve_trade(game, trade, TradeStatus.CANCELLED, actor_id)

    def _validate_trade_assets(
        self,
        game: GameState,
        *,
        proposer_id: UUID,
        recipient_id: UUID,
        offered_cash: int,
        requested_cash: int,
        offered_property_ids: list[str],
        requested_property_ids: list[str],
    ) -> None:
        proposer = self._player(game, proposer_id)
        recipient = self._player(game, recipient_id)
        if proposer.bankrupt or recipient.bankrupt:
            raise ConflictError("bankrupt players cannot trade")
        if proposer.balance < offered_cash or recipient.balance < requested_cash:
            raise ConflictError("insufficient balance for this trade")
        pack = self._pack(game)
        purchasable_ids = {
            tile.id
            for tile in pack.board.tiles
            if tile.kind in {TileKind.PROPERTY, TileKind.TRANSPORT, TileKind.UTILITY}
        }
        for property_id in offered_property_ids:
            if property_id not in purchasable_ids:
                raise ConflictError("the trade contains an unknown property")
            if game.owners.get(property_id) != proposer_id:
                raise ConflictError("the proposer no longer owns an offered property")
            if game.building_levels.get(property_id, 0) > 0:
                raise ConflictError("properties with buildings cannot be traded")
        for property_id in requested_property_ids:
            if property_id not in purchasable_ids:
                raise ConflictError("the trade contains an unknown property")
            if game.owners.get(property_id) != recipient_id:
                raise ConflictError("the recipient no longer owns a requested property")
            if game.building_levels.get(property_id, 0) > 0:
                raise ConflictError("properties with buildings cannot be traded")

    @staticmethod
    def _pending_trade(game: GameState, trade_id: UUID) -> TradeOffer:
        trade = next((item for item in game.trades if item.id == trade_id), None)
        if trade is None:
            raise ConflictError("the trade does not exist")
        if trade.status is not TradeStatus.PENDING:
            raise ConflictError("the trade is no longer pending")
        return trade

    def _resolve_trade(
        self,
        game: GameState,
        trade: TradeOffer,
        status: TradeStatus,
        actor_id: UUID,
    ) -> None:
        trade.status = status
        trade.resolved_at = datetime.now(UTC)
        self._append_event(
            game,
            f"trade.{status.value}",
            {"trade_id": str(trade.id), "actor_id": str(actor_id)},
        )

    def _tile(self, game: GameState, tile_id: str) -> TileDefinition:
        pack = self._pack(game)
        tile = next((item for item in pack.board.tiles if item.id == tile_id), None)
        if tile is None:
            raise ConflictError("the property does not exist in this game")
        return tile

    def _jail_tile(self, game: GameState) -> TileDefinition:
        pack = self._pack(game)
        tile = next(
            (item for item in pack.board.tiles if item.kind is TileKind.JAIL),
            None,
        )
        if tile is None:
            raise ConflictError("the board does not define a jail tile")
        return tile

    def _pack(self, game: GameState) -> ContentPack:
        return self._packs.load(game.pack_id, version=game.pack_version)

    def _owned_tile(
        self,
        game: GameState,
        actor_id: UUID,
        tile_id: str,
    ) -> TileDefinition:
        tile = self._tile(game, tile_id)
        if tile.kind not in {
            TileKind.PROPERTY,
            TileKind.TRANSPORT,
            TileKind.UTILITY,
        }:
            raise ConflictError("the tile is not a purchasable property")
        if game.owners.get(tile_id) != actor_id:
            raise ForbiddenError("the player does not own this property")
        return tile

    def _group_tiles(
        self,
        game: GameState,
        tile: TileDefinition,
    ) -> list[TileDefinition]:
        if tile.kind is not TileKind.PROPERTY or tile.group is None:
            return [tile]
        pack = self._pack(game)
        return [
            item
            for item in pack.board.tiles
            if item.kind is TileKind.PROPERTY and item.group == tile.group
        ]

    def _active_player(self, game: GameState, player_id: UUID) -> PlayerState:
        player = self._player(game, player_id)
        if player.bankrupt:
            raise ConflictError("bankrupt players cannot perform this action")
        return player

    def _advance_to_next_active_player(self, game: GameState) -> None:
        for _ in game.players:
            game.current_player_index = (game.current_player_index + 1) % len(
                game.players
            )
            if not game.players[game.current_player_index].bankrupt:
                game.phase = TurnPhase.WAITING_FOR_ROLL
                game.consecutive_doubles = 0
                game.extra_roll_pending = False
                self._append_event(
                    game,
                    "turn.started",
                    {"player_id": str(game.current_player.user_id)},
                )
                return
        raise ConflictError("the game has no active players")

    @staticmethod
    def _player(game: GameState, player_id: UUID) -> PlayerState:
        player = next(
            (candidate for candidate in game.players if candidate.user_id == player_id),
            None,
        )
        if player is None:
            raise ForbiddenError("the user is not a participant in this game")
        return player

    @staticmethod
    def _require_participant(game: GameState, actor_id: UUID) -> None:
        if not any(player.user_id == actor_id for player in game.players):
            raise ForbiddenError("the user is not a participant in this game")

    @staticmethod
    def _require_member(game: GameState, actor_id: UUID) -> None:
        if not any(player.user_id == actor_id for player in game.players) and not any(
            spectator.user_id == actor_id for spectator in game.spectators
        ):
            raise ForbiddenError("the user is not a member of this game")

    @staticmethod
    def _append_event(
        game: GameState,
        event_type: str,
        data: dict[str, object] | None = None,
    ) -> None:
        game.events.append(
            GameEvent(
                sequence=len(game.events) + 1,
                type=event_type,
                data=data or {},
            )
        )
