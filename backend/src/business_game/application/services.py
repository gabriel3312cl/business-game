from __future__ import annotations

import random
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.advanced_economy import (
    audited_net_worth,
    indexed_amount,
    indexed_rent,
    operating_costs_by_player,
    public_project_terms,
    qualifies_for_public_project,
)
from business_game.application.board_service import PackResolver
from business_game.application.card_collections import select_deck_collections
from business_game.application.economic_simulation import (
    advance_economic_week,
    initialize_economic_simulation,
)
from business_game.application.economy import (
    available_bank_cash,
    credit_offer,
    credit_profile,
    initialize_bank,
    market_order_quote,
    minimum_reserve,
    reconcile_bank,
    refresh_credit_profiles,
    refresh_market_index,
    synchronize_trade_volumes,
)
from business_game.application.pack_loader import PackLoader
from business_game.application.relationships import (
    clamp_score,
    relationship_changes_for_events,
)
from business_game.config import settings
from business_game.domain.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from business_game.domain.models import (
    AcceptFinancedTradeCommand,
    AcceptRentDebtPlanCommand,
    AcceptTradeCommand,
    AddBotRequest,
    AllPlayersMoveRelativeCardEffect,
    AuctionState,
    BankLoanState,
    BidCommand,
    BidPublicProjectCommand,
    BoardHistoricalStats,
    BotController,
    BotPersonality,
    BotRelationshipState,
    BuildGroupRoundCommand,
    BuildPropertyCommand,
    BuyPropertyCommand,
    BuySharesCommand,
    CancelMarketOrderCommand,
    CancelTradeCommand,
    CardPaymentState,
    CashCardEffect,
    CashEachCardEffect,
    ChooseCardCommand,
    CompleteGroupsCashCardEffect,
    ContentPack,
    ContinueCardChoiceResultCommand,
    ContinueCardCommand,
    CounterTradeCommand,
    DebtReason,
    DebtState,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    DeferOperatingCostsCommand,
    DemandRentDebtCommand,
    EconomicDifficulty,
    EndTurnCommand,
    EqualizeCashCardEffect,
    FinaleState,
    FinaleVoteState,
    ForgiveRentDebtCommand,
    GameCommand,
    GameEvent,
    GameSettings,
    GameState,
    GameStatus,
    GetOutOfJailCardEffect,
    GoToJailCardEffect,
    InteractiveChoiceCardEffect,
    InvestmentInstrumentState,
    MarketOrderSide,
    MarketOrderState,
    MortgagedPropertiesCashCardEffect,
    MortgagePropertyCommand,
    MoveRelativeCardEffect,
    MoveToCardEffect,
    MoveToNearestAuctionCardEffect,
    MoveToNearestCardEffect,
    OfferPropertyAuctionCommand,
    OperatingCostAssessmentState,
    OperatingDebtState,
    OwnedPropertiesCashCardEffect,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    PayOperatingCostsCommand,
    PayRentDebtPlanCommand,
    PendingCardChoiceResultState,
    PendingCardChoiceState,
    PendingCardDrawState,
    PlaceLimitOrderCommand,
    PlayerState,
    ProposeRentDebtPlanCommand,
    ProposeTradeCommand,
    PublicProjectBidState,
    PublicProjectKind,
    PublicProjectState,
    ReadyAuctionCommand,
    RefinanceMortgageCardEffect,
    RejectRentDebtPlanCommand,
    RejectTradeCommand,
    RentDebtPlanProposal,
    RentDebtPlanState,
    RentDebtPlanTemplate,
    RepairsCardEffect,
    RepayLoanCommand,
    RepayOperatingDebtCommand,
    RequestLoanCommand,
    ResolveCardChoiceCommand,
    RollCommand,
    RuleOptionName,
    SalaryCashCardEffect,
    SelectAuctionPropertyCommand,
    SellBuildingCommand,
    SellGroupRoundCommand,
    SellSharesCommand,
    SetPropertyTradeAvailabilityCommand,
    SpectatorState,
    SwapPositionCardEffect,
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
    UserPreferences,
    UserPreferencesUpdate,
    UserUpdate,
    VoteFinaleCommand,
)
from business_game.infrastructure.repositories import (
    AuthSessionRepository,
    GameRepository,
    UserRepository,
)
from business_game.security import (
    create_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)

DiceRoller = Callable[[], tuple[int, int]]
CardShuffler = Callable[[list[str]], list[str]]
Clock = Callable[[], datetime]
OutcomeRoller = Callable[[int], int]
AUCTION_BID_WINDOW = timedelta(seconds=5)
AUCTION_READY_WINDOW = timedelta(seconds=30)
MAX_EFFECTS_PER_COMMAND = 32
DIVIDEND_SCALE = 10_000
INDEX_DIVIDEND_ALLOCATION_PERCENT = 10
GLOBAL_FINANCIAL_RULES = {
    RuleOptionName.LOANS_ENABLED.value,
    RuleOptionName.STOCK_MARKET_ENABLED.value,
    RuleOptionName.CUSTOM_RENT_DEBTS_ENABLED.value,
}
FUN_BOT_NAMES_BY_PERSONALITY: dict[BotPersonality, tuple[str, ...]] = {
    BotPersonality.CONSERVATIVE: (
        "Doña Alcancía",
        "Capitán Ahorro",
        "Conde Caja Fuerte",
        "Reina del Vuelto",
        "Maestro Centavito",
        "Señor Presupuesto",
        "La Guardiana del Peso",
        "Barón Bajo Riesgo",
        "Doña Reserva",
        "Don Colchón",
        "Capitana Prudencia",
        "El Ermitaño del Efectivo",
    ),
    BotPersonality.BALANCED: (
        "Señor Mitad y Mitad",
        "Doña Balanza",
        "Capitán Promedio",
        "Maestro Equilibrio",
        "La Jefa del Punto Medio",
        "Don Plan B",
        "Reina del Balance",
        "Barón Moderado",
        "Doctor Diversifica",
        "Señor Tranquilo",
        "Capitana Cartera",
        "La Maestra del Empate",
    ),
    BotPersonality.AGGRESSIVE: (
        "Don Todo o Nada",
        "Tiburón del Mapocho",
        "Reina del Remate",
        "Capitán Riesgo",
        "La Tormenta Bursátil",
        "Barón Compra Todo",
        "Doña Apuesta Fuerte",
        "El Martillo",
        "Comandante Plusvalía",
        "Señor Sin Frenos",
        "La Fiera del Mercado",
        "Don Dados Calientes",
    ),
    BotPersonality.NEGOTIATOR: (
        "Maestro Regateo",
        "Doña Contraoferta",
        "El Rey del Trato",
        "Capitana Cláusula",
        "Señor Permuta",
        "La Dama del Acuerdo",
        "Don Último Precio",
        "Barón del Trueque",
        "Doctor Comisión",
        "Reina del Contrato",
        "El Susurrador de Ofertas",
        "Doña Firma Aquí",
    ),
}
FUN_BOT_NAMES = tuple(
    name
    for personality_names in FUN_BOT_NAMES_BY_PERSONALITY.values()
    for name in personality_names
)
DUMMY_PASSWORD_HASH = hash_password("business-game-invalid-account")


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
        password_hash = (
            record.password_hash if record is not None and record.is_active else DUMMY_PASSWORD_HASH
        )
        password_valid = verify_password(password, password_hash)
        if record is None or not record.is_active or not password_valid:
            raise UnauthorizedError("invalid email or password")
        return await self._users.get(record.id)

    async def get(self, user_id: UUID) -> User:
        return await self._users.get(user_id)

    async def update(self, user_id: UUID, data: UserUpdate) -> User:
        async with self._session.begin():
            return await self._users.update(
                user_id,
                display_name=(data.display_name.strip() if data.display_name is not None else None),
                locale=data.locale.strip().lower() if data.locale is not None else None,
            )

    async def get_preferences(self, user_id: UUID) -> UserPreferences:
        return await self._users.get_preferences(user_id)

    async def update_preferences(
        self,
        user_id: UUID,
        preferences: UserPreferencesUpdate,
    ) -> UserPreferences:
        async with self._session.begin():
            return await self._users.update_preferences(user_id, preferences)

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


class SessionService:
    def __init__(self, session: AsyncSession):
        self._session = session
        self._sessions = AuthSessionRepository(session)
        self._users = UserRepository(session)

    async def create(self, user_id: UUID) -> str:
        token = create_session_token()
        async with self._session.begin():
            await self._sessions.create(
                user_id=user_id,
                token_hash=hash_session_token(token),
                expires_at=datetime.now(UTC) + timedelta(days=settings.session_days),
            )
        return token

    async def resolve(self, token: str) -> User:
        async with self._session.begin():
            record = await self._sessions.get_active(hash_session_token(token))
            if record is None:
                raise UnauthorizedError("session is invalid or expired")
            try:
                user = await self._users.get(record.user_id)
            except NotFoundError as exc:
                raise UnauthorizedError("session user is invalid or inactive") from exc
            await self._sessions.touch(record)
            return user

    async def revoke(self, token: str) -> None:
        async with self._session.begin():
            await self._sessions.revoke(hash_session_token(token))


class GameService:
    def __init__(
        self,
        session: AsyncSession,
        packs: PackLoader,
        pack_resolver: PackResolver | None = None,
        dice_roller: DiceRoller | None = None,
        card_shuffler: CardShuffler | None = None,
        clock: Clock | None = None,
        outcome_roller: OutcomeRoller | None = None,
    ) -> None:
        self._session = session
        self._packs = packs
        self._pack_resolver = pack_resolver
        self._games = GameRepository(session)
        secure_random = random.SystemRandom()
        self._dice_roller = dice_roller or (
            lambda: (secure_random.randint(1, 6), secure_random.randint(1, 6))
        )
        self._card_shuffler = card_shuffler or (
            lambda card_ids: secure_random.sample(card_ids, k=len(card_ids))
        )
        self._clock = clock or (lambda: datetime.now(UTC))
        self._outcome_roller = outcome_roller or secure_random.randrange
        self._appearance_slot_picker = secure_random.choice
        self._bot_personality_picker = secure_random.choice
        self._bot_name_picker = secure_random.choice
        self._remaining_effects = MAX_EFFECTS_PER_COMMAND

    def _next_appearance_slot(self, game: GameState) -> int:
        used_slots = {
            player.appearance_slot for player in game.players if player.appearance_slot is not None
        }
        available_slots = [slot for slot in range(20) if slot not in used_slots]
        if not available_slots:
            raise ConflictError("the game is full")
        return self._appearance_slot_picker(available_slots)

    def _append_bot(
        self,
        game: GameState,
        pack: ContentPack,
        data: AddBotRequest,
    ) -> None:
        display_name = (data.display_name or "").strip()
        if not display_name:
            used_names = {player.display_name.casefold() for player in game.players}
            preferred_names = [
                name
                for name in FUN_BOT_NAMES_BY_PERSONALITY[data.personality]
                if name.casefold() not in used_names
            ]
            available_names = preferred_names or [
                name for name in FUN_BOT_NAMES if name.casefold() not in used_names
            ]
            display_name = self._bot_name_picker(available_names)
        bot = PlayerState(
            user_id=uuid4(),
            display_name=display_name,
            appearance_slot=self._next_appearance_slot(game),
            is_bot=True,
            bot_personality=data.personality,
            bot_controller=data.controller,
            balance=pack.manifest.starting_balance,
        )
        game.players.append(bot)
        self._append_event(
            game,
            "player.joined",
            {
                "player_id": str(bot.user_id),
                "display_name": bot.display_name,
                "is_bot": True,
                "bot_personality": data.personality.value,
                "bot_controller": data.controller.value,
            },
        )

    def _ensure_economy(self, game: GameState) -> None:
        initialize_economic_simulation(game)
        initialize_bank(game, self._pack(game))

    def _sync_bank(self, game: GameState) -> None:
        issued = reconcile_bank(game)
        if issued:
            self._append_event(
                game,
                "bank.emergency_issued",
                {
                    "amount": issued,
                    "total_issuance": game.bank.emergency_issuance,
                },
            )
        refresh_credit_profiles(game, self._pack(game))

    async def create(
        self,
        pack_id: str,
        actor: User,
        version: str | None = None,
        deck_collection_ids: dict[str, list[str]] | None = None,
        economic_difficulty: EconomicDifficulty = EconomicDifficulty.STANDARD,
        advanced_economy_enabled: bool = True,
    ) -> GameState:
        async with self._session.begin():
            pack = (
                await self._pack_resolver.load(pack_id, version=version)
                if self._pack_resolver is not None
                else self._packs.load(pack_id, version=version)
            )
            pack, selected_collections = select_deck_collections(
                pack,
                deck_collection_ids,
            )
            game = GameState(
                host_user_id=actor.id,
                pack_id=pack.manifest.id,
                pack_version=pack.manifest.version,
                pack_snapshot=(
                    pack if pack.manifest.schema_version == 5 or selected_collections else None
                ),
                deck_collection_ids=selected_collections,
                settings=GameSettings(
                    max_players=pack.manifest.max_players,
                    economic_difficulty=economic_difficulty,
                    advanced_economy_enabled=advanced_economy_enabled,
                    rules=pack.manifest.default_rules.model_copy(deep=True),
                ),
                houses_remaining=pack.manifest.house_supply,
                hotels_remaining=pack.manifest.hotel_supply,
            )
            game.economy.current_date = self._clock().date()
            initialize_economic_simulation(game)
            game.players.append(
                PlayerState(
                    user_id=actor.id,
                    display_name=actor.display_name,
                    appearance_slot=self._next_appearance_slot(game),
                    balance=pack.manifest.starting_balance,
                )
            )
            self._append_event(game, "game.created", {"pack_id": pack_id})
            self._append_event(game, "player.joined", {"player_id": str(actor.id)})
            initialize_bank(game, pack)
            await self._games.create(game)
        return game

    async def get(self, game_id: UUID, actor_id: UUID) -> GameState:
        game = await self._games.get(game_id)
        self._require_member(game, actor_id)
        synchronize_trade_volumes(game)
        return game

    async def list_active(self, actor_id: UUID) -> list[GameState]:
        return await self._games.list_active_for_user(actor_id)

    async def admin_cancel(self, game_id: UUID, admin_id: UUID) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.status in {GameStatus.FINISHED, GameStatus.CANCELLED}:
                return game
            previous_sequence = game.event_sequence
            game.status = GameStatus.CANCELLED
            self._append_event(
                game,
                "game.cancelled",
                {"source": "admin", "admin_id": str(admin_id)},
            )
            await self._games.save(game, previous_sequence)
            return game

    async def list_scheduled_auctions(self) -> list[GameState]:
        return await self._games.list_with_scheduled_auctions()

    async def board_history(
        self,
        game_id: UUID,
        actor_id: UUID,
    ) -> BoardHistoricalStats:
        game = await self.get(game_id, actor_id)
        pack = self._pack(game)
        property_ids = [tile.id for tile in pack.board.tiles if tile.is_purchasable]
        return await self._games.board_history(
            pack_id=game.pack_id,
            exclude_game_id=game.id,
            property_ids=property_ids,
            property_positions={
                position: tile.id
                for position, tile in enumerate(pack.board.tiles)
                if tile.is_purchasable
            },
            tile_count=pack.manifest.tile_count,
        )

    async def join(self, game_id: UUID, actor: User) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            pack = self._pack(game)
            if any(player.user_id == actor.id for player in game.players):
                return game
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("the game already started")
            player_limit = game.settings.max_players or pack.manifest.max_players
            if len(game.players) >= player_limit:
                raise ConflictError("the game is full")
            game.spectators = [
                spectator for spectator in game.spectators if spectator.user_id != actor.id
            ]
            game.players.append(
                PlayerState(
                    user_id=actor.id,
                    display_name=actor.display_name,
                    appearance_slot=self._next_appearance_slot(game),
                    balance=pack.manifest.starting_balance,
                )
            )
            self._append_event(game, "player.joined", {"player_id": str(actor.id)})
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence, sync_members=True)
            return game

    async def add_bot(
        self,
        game_id: UUID,
        actor_id: UUID,
        data: AddBotRequest,
    ) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can add bots")
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("bots can only be added in the lobby")
            pack = self._pack(game)
            player_limit = game.settings.max_players or pack.manifest.max_players
            if len(game.players) >= player_limit:
                raise ConflictError("the game is full")
            previous_sequence = game.event_sequence
            self._append_bot(game, pack, data)
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def fill_with_random_bots(
        self,
        game_id: UUID,
        actor_id: UUID,
    ) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can add bots")
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("bots can only be added in the lobby")
            pack = self._pack(game)
            player_limit = game.settings.max_players or pack.manifest.max_players
            remaining_slots = player_limit - len(game.players)
            if remaining_slots <= 0:
                raise ConflictError("the game is full")
            previous_sequence = game.event_sequence
            personalities = list(BotPersonality)
            for _ in range(remaining_slots):
                self._append_bot(
                    game,
                    pack,
                    AddBotRequest(
                        controller=BotController.STANDARD,
                        personality=self._bot_personality_picker(personalities),
                    ),
                )
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def remove_bot(
        self,
        game_id: UUID,
        actor_id: UUID,
        bot_id: UUID,
    ) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can remove bots")
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("bots can only be removed in the lobby")
            bot = next(
                (player for player in game.players if player.user_id == bot_id and player.is_bot),
                None,
            )
            if bot is None:
                raise NotFoundError("bot was not found in this game")
            previous_sequence = game.event_sequence
            game.players.remove(bot)
            self._append_event(
                game,
                "player.left",
                {
                    "player_id": str(bot.user_id),
                    "display_name": bot.display_name,
                    "is_bot": True,
                },
            )
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def watch(self, game_id: UUID, actor: User) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            if game.status is GameStatus.CANCELLED:
                raise ConflictError("the game was cancelled")
            if any(player.user_id == actor.id for player in game.players):
                return game
            if any(spectator.user_id == actor.id for spectator in game.spectators):
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
            await self._games.save(game, previous_sequence, sync_members=True)
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
            previous_sequence = game.event_sequence
            pack = self._pack(game)
            changes: dict[str, object] = {}
            if data.max_players is not None:
                if not (pack.manifest.min_players <= data.max_players <= pack.manifest.max_players):
                    raise ConflictError("max players must stay within the pack limits")
                if data.max_players < len(game.players):
                    raise ConflictError("max players cannot be lower than the current player count")
                game.settings.max_players = data.max_players
                changes["max_players"] = data.max_players
            if data.allow_spectators is not None:
                if not data.allow_spectators and game.spectators:
                    raise ConflictError("spectators must leave before disabling spectators")
                game.settings.allow_spectators = data.allow_spectators
                changes["allow_spectators"] = data.allow_spectators
            if data.auction_deposit_percent is not None:
                game.settings.auction_deposit_percent = data.auction_deposit_percent
                changes["auction_deposit_percent"] = data.auction_deposit_percent
            if data.auction_minimum_bid_percent is not None:
                game.settings.auction_minimum_bid_percent = data.auction_minimum_bid_percent
                changes["auction_minimum_bid_percent"] = data.auction_minimum_bid_percent
            if data.economic_difficulty is not None:
                game.settings.economic_difficulty = data.economic_difficulty
                changes["economic_difficulty"] = data.economic_difficulty.value
            for setting_name in (
                "advanced_economy_enabled",
                "operating_cost_percent",
                "finale_trigger_week",
                "finale_duration_weeks",
                "finale_vote_interval_weeks",
            ):
                value = getattr(data, setting_name)
                if value is not None:
                    setattr(game.settings, setting_name, value)
                    changes[setting_name] = value
            if data.rules is not None:
                allowed_rules = {
                    rule.value for rule in pack.manifest.configurable_rules
                } | GLOBAL_FINANCIAL_RULES
                requested_rules = data.rules.model_dump(
                    exclude_none=True,
                    exclude_unset=True,
                )
                unavailable = sorted(requested_rules.keys() - allowed_rules)
                if unavailable:
                    raise ConflictError(f"rules are not configurable for this pack: {unavailable}")
                for rule_name, value in requested_rules.items():
                    setattr(game.settings.rules, rule_name, value)
                changes["rules"] = requested_rules
            self._append_event(game, "game.settings_updated", changes)
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def configure_economic_simulation(
        self,
        game_id: UUID,
        difficulty: EconomicDifficulty,
    ) -> GameState:
        """Maintenance path for configuring an existing local game."""
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            game.settings.economic_difficulty = difficulty
            if game.economy.elapsed_weeks == 0:
                game.economy.current_date = self._clock().date()
                initialize_economic_simulation(game)
            self._append_event(
                game,
                "game.settings_updated",
                {"economic_difficulty": difficulty.value},
            )
            await self._games.save(game, previous_sequence)
            return game

    async def activate_financial_features(self, game_id: UUID) -> GameState:
        """One-time maintenance path for an already-running local game."""
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            was_initialized = game.bank.initialized
            previous_investment_count = len(game.bank.investments)
            rules_changed = (
                not game.settings.rules.loans_enabled
                or not game.settings.rules.stock_market_enabled
            )
            game.settings.rules.loans_enabled = True
            game.settings.rules.stock_market_enabled = True
            if game.pack_snapshot is not None:
                game.pack_snapshot.manifest.investment_dividend_percent = 30
                (game.pack_snapshot.manifest.investment_transaction_fee_percent) = 1
                game.pack_snapshot.manifest.investment_max_ownership_percent = 30
                game.pack_snapshot.manifest.investment_spread_percent = 1
            self._ensure_economy(game)
            if rules_changed:
                self._append_event(
                    game,
                    "game.settings_updated",
                    {
                        "rules": {
                            "loans_enabled": True,
                            "stock_market_enabled": True,
                        },
                        "source": "authorized_maintenance",
                    },
                )
            added_investments = len(game.bank.investments) - previous_investment_count
            if added_investments:
                self._append_event(
                    game,
                    "investment.market_expanded",
                    {
                        "added_instruments": added_investments,
                        "instrument_count": len(game.bank.investments),
                        "source": "authorized_maintenance",
                    },
                )
            if not was_initialized:
                self._append_event(
                    game,
                    "bank.initialized",
                    {
                        "monetary_base": game.bank.monetary_base,
                        "cash": game.bank.cash,
                        "minimum_reserve_percent": (game.bank.minimum_reserve_percent),
                        "investment_count": len(game.bank.investments),
                    },
                )
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def activate_custom_rent_debts(self, game_id: UUID) -> GameState:
        """Enable custom rent debt terms in an already-running local game."""
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            if not game.settings.rules.custom_rent_debts_enabled:
                game.settings.rules.custom_rent_debts_enabled = True
                self._append_event(
                    game,
                    "game.settings_updated",
                    {
                        "rules": {"custom_rent_debts_enabled": True},
                        "source": "authorized_maintenance",
                    },
                )
                await self._games.save(game, previous_sequence)
            return game

    async def leave(self, game_id: UUID, actor_id: UUID) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            previous_sequence = game.event_sequence
            spectator = next(
                (candidate for candidate in game.spectators if candidate.user_id == actor_id),
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
                await self._games.save(game, previous_sequence, sync_members=True)
                return game

            player_index = next(
                (index for index, player in enumerate(game.players) if player.user_id == actor_id),
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
                human_players = [candidate for candidate in game.players if not candidate.is_bot]
                if not human_players:
                    game.players.clear()
                    game.status = GameStatus.CANCELLED
                    game.current_player_index = 0
                    self._append_event(game, "game.cancelled")
                else:
                    game.current_player_index = 0
                    if game.host_user_id == actor_id:
                        game.host_user_id = human_players[0].user_id
                        self._append_event(
                            game,
                            "host.transferred",
                            {"host_id": str(game.host_user_id)},
                        )
                self._ensure_economy(game)
                self._sync_bank(game)
                await self._games.save(game, previous_sequence, sync_members=True)
                return game
            if game.status in {GameStatus.FINISHED, GameStatus.CANCELLED}:
                return game
            if player.bankrupt:
                return game
            if game.active_debt is not None and game.active_debt.debtor_id != actor_id:
                raise ConflictError("a player cannot resign while another debt is being resolved")
            if game.active_auction is not None:
                auction = game.active_auction
                self._refund_auction_deposit(
                    game,
                    auction,
                    actor_id,
                    reason="player_left",
                )
                if actor_id not in auction.passed_player_ids:
                    auction.passed_player_ids.append(actor_id)
                if auction.current_bidder_id == actor_id:
                    auction.current_bidder_id = None
                    auction.current_bid = 0
                    auction.bid_deadline = None
                self._resolve_auction_if_finished(game)
            if game.current_player is not None and game.current_player.user_id == actor_id:
                game.pending_tile_id = None
                game.pending_purchase_discount_percent = 0
                game.pending_auction_selector_id = None
                game.pending_auction_minimum_bid = None
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
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence, sync_members=True)
            return game

    async def start(self, game_id: UUID, actor_id: UUID) -> GameState:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            if game.host_user_id != actor_id:
                raise ForbiddenError("only the host can start the game")
            previous_sequence = game.event_sequence
            pack = self._pack(game)
            if game.status is not GameStatus.LOBBY:
                raise ConflictError("the game already started")
            if len(game.players) < pack.manifest.min_players:
                raise ConflictError(f"at least {pack.manifest.min_players} players are required")
            self._ensure_economy(game)
            game.status = GameStatus.PLAYING
            game.phase = TurnPhase.WAITING_FOR_ROLL
            for deck in pack.board.decks:
                game.deck_orders[deck.id] = self._card_shuffler([card.id for card in deck.cards])
                game.deck_cursors[deck.id] = 0
            self._append_event(
                game,
                "game.started",
                {
                    "player_count": len(game.players),
                    "bank_monetary_base": game.bank.monetary_base,
                    "market_share_supply": (
                        game.bank.investments[0].total_shares if game.bank.investments else 0
                    ),
                },
            )
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            return game

    async def execute(
        self,
        game_id: UUID,
        actor_id: UUID,
        command: GameCommand,
        *,
        expected_sequence: int | None = None,
        command_id: UUID | None = None,
        automation_reason: str | None = None,
        automation_note: str | None = None,
    ) -> GameState:
        self._remaining_effects = MAX_EFFECTS_PER_COMMAND
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            self._require_participant(game, actor_id)
            previous_sequence = game.event_sequence
            if command_id is not None and await self._games.command_was_processed(
                game_id,
                actor_id,
                command_id,
            ):
                return game
            if expected_sequence is not None and previous_sequence != expected_sequence:
                auction_scoped = isinstance(
                    command,
                    (BidCommand, PassAuctionCommand, ReadyAuctionCommand),
                ) or (isinstance(command, RequestLoanCommand) and command.auction_id is not None)
                if not auction_scoped:
                    raise ConflictError("the game changed before the command ran")
            if game.status is not GameStatus.PLAYING:
                raise ConflictError("the game is not active")
            self._ensure_economy(game)

            if isinstance(
                command,
                (
                    MortgagePropertyCommand,
                    UnmortgagePropertyCommand,
                    BuildPropertyCommand,
                    BuildGroupRoundCommand,
                    SellBuildingCommand,
                    SellGroupRoundCommand,
                    RepayLoanCommand,
                    BuySharesCommand,
                    SellSharesCommand,
                    PlaceLimitOrderCommand,
                    CancelMarketOrderCommand,
                    OfferPropertyAuctionCommand,
                ),
            ):
                current_player = game.current_player
                if current_player is None or current_player.user_id != actor_id:
                    raise ConflictError("it is not this player's turn")

            if isinstance(command, RequestLoanCommand) and game.active_auction is None:
                current_player = game.current_player
                if current_player is None or current_player.user_id != actor_id:
                    raise ConflictError("it is not this player's turn")

            if isinstance(command, VoteFinaleCommand):
                self._vote_finale(game, actor_id, command.approve)
            elif isinstance(command, BidPublicProjectCommand):
                self._bid_public_project(game, actor_id, command)
            elif isinstance(command, PayOperatingCostsCommand):
                self._pay_operating_costs(game, actor_id)
            elif isinstance(command, DeferOperatingCostsCommand):
                self._defer_operating_costs(game, actor_id)
            elif isinstance(command, RepayOperatingDebtCommand):
                self._repay_operating_debt(game, actor_id, command.amount)
            elif game.pending_card_choice_result is not None:
                if isinstance(command, ContinueCardChoiceResultCommand):
                    self._continue_card_choice_result(game, actor_id)
                else:
                    raise ConflictError("the card choice result must be continued")
            elif game.pending_card_draw is not None:
                if isinstance(command, ChooseCardCommand):
                    self._choose_card(game, actor_id, command.card_index)
                elif isinstance(command, ContinueCardCommand):
                    self._continue_card(game, actor_id)
                else:
                    raise ConflictError("the pending card must be continued")
            elif game.pending_card_choice is not None:
                if isinstance(command, ResolveCardChoiceCommand):
                    self._resolve_card_choice(game, actor_id, command.choice_id)
                else:
                    raise ConflictError("the pending card choice must be resolved")
            elif isinstance(command, SetPropertyTradeAvailabilityCommand):
                self._set_property_trade_availability(game, actor_id, command)
            elif game.active_auction is not None:
                if isinstance(command, BidCommand):
                    self._bid(game, actor_id, command)
                elif isinstance(command, PassAuctionCommand):
                    self._pass_auction(game, actor_id, command)
                elif isinstance(command, ReadyAuctionCommand):
                    self._ready_auction(game, actor_id, command)
                elif isinstance(command, RequestLoanCommand):
                    if command.auction_id is None:
                        raise ConflictError("auction loan commands require auction_id")
                    auction = self._require_matching_auction(
                        game,
                        command.auction_id,
                    )
                    if (
                        auction.phase != "bidding"
                        or actor_id not in auction.ready_player_ids
                        or actor_id in auction.passed_player_ids
                    ):
                        raise ConflictError("only an active auction participant can request a loan")
                    self._request_loan(game, actor_id, command.amount)
                else:
                    raise ConflictError("the auction must finish before continuing")
            elif game.pending_auction_selector_id is not None:
                if actor_id != game.pending_auction_selector_id:
                    raise ConflictError("the current player must select the auction property")
                if isinstance(command, SelectAuctionPropertyCommand):
                    self._select_auction_property(game, actor_id, command.property_id)
                else:
                    raise ConflictError("an auction property must be selected")
            elif game.active_debt is not None:
                if isinstance(command, DemandRentDebtCommand):
                    self._demand_rent_debt(game, actor_id)
                elif isinstance(command, ForgiveRentDebtCommand):
                    self._forgive_rent_debt(game, actor_id)
                elif isinstance(command, ProposeRentDebtPlanCommand):
                    self._propose_rent_debt_plan(game, actor_id, command)
                elif isinstance(command, AcceptRentDebtPlanCommand):
                    self._accept_rent_debt_plan(game, actor_id)
                elif isinstance(command, RejectRentDebtPlanCommand):
                    self._reject_rent_debt_plan(game, actor_id)
                elif (
                    isinstance(command, ProposeTradeCommand)
                    and actor_id == game.active_debt.debtor_id
                    and self._is_pure_money_request_command(command)
                ):
                    self._propose_trade(game, actor_id, command)
                elif isinstance(
                    command,
                    (
                        AcceptTradeCommand,
                        AcceptFinancedTradeCommand,
                        RejectTradeCommand,
                        CancelTradeCommand,
                    ),
                ) and self._is_pure_money_request_trade(game, command.trade_id):
                    if isinstance(command, AcceptTradeCommand):
                        self._accept_trade(game, actor_id, command)
                    elif isinstance(command, AcceptFinancedTradeCommand):
                        self._accept_financed_trade(game, actor_id, command)
                    elif isinstance(command, RejectTradeCommand):
                        self._reject_trade(game, actor_id, command)
                    else:
                        self._cancel_trade(game, actor_id, command)
                elif self._rent_debt_waits_for_creditor(game):
                    raise ConflictError("the rent creditor must choose how to resolve the debt")
                elif actor_id != game.active_debt.debtor_id:
                    raise ConflictError("the debtor must resolve the outstanding debt")
                elif isinstance(command, MortgagePropertyCommand):
                    self._mortgage_property(game, actor_id, command.property_id)
                elif isinstance(command, SellBuildingCommand):
                    self._sell_building(game, actor_id, command.property_id)
                elif isinstance(command, SellGroupRoundCommand):
                    self._sell_group_round(game, actor_id, command.group_id)
                elif isinstance(command, SellSharesCommand):
                    self._sell_shares(game, actor_id, command)
                elif isinstance(command, CancelMarketOrderCommand):
                    self._cancel_market_order(game, actor_id, command.order_id)
                elif isinstance(command, RequestLoanCommand):
                    self._request_loan(game, actor_id, command.amount)
                elif isinstance(command, PayDebtCommand):
                    self._pay_debt(game, actor_id)
                elif isinstance(command, DeclareBankruptcyCommand):
                    self._declare_bankruptcy(game, actor_id)
                else:
                    raise ConflictError("the debt must be paid or bankruptcy declared")
            elif isinstance(command, PayRentDebtPlanCommand):
                self._pay_rent_debt_plan(game, actor_id, command)
            elif isinstance(command, MortgagePropertyCommand):
                self._mortgage_property(game, actor_id, command.property_id)
            elif isinstance(command, UnmortgagePropertyCommand):
                self._unmortgage_property(game, actor_id, command.property_id)
            elif isinstance(command, BuildPropertyCommand):
                self._build_property(game, actor_id, command.property_id)
            elif isinstance(command, BuildGroupRoundCommand):
                self._build_group_round(game, actor_id, command.group_id)
            elif isinstance(command, SellBuildingCommand):
                self._sell_building(game, actor_id, command.property_id)
            elif isinstance(command, SellGroupRoundCommand):
                self._sell_group_round(game, actor_id, command.group_id)
            elif isinstance(command, RequestLoanCommand):
                self._request_loan(game, actor_id, command.amount)
            elif isinstance(command, RepayLoanCommand):
                self._repay_loan(game, actor_id, command.amount)
            elif isinstance(command, OfferPropertyAuctionCommand):
                self._offer_property_auction(game, actor_id, command)
            elif isinstance(command, BuySharesCommand):
                self._buy_shares(game, actor_id, command)
            elif isinstance(command, SellSharesCommand):
                self._sell_shares(game, actor_id, command)
            elif isinstance(command, PlaceLimitOrderCommand):
                self._place_limit_order(game, actor_id, command)
            elif isinstance(command, CancelMarketOrderCommand):
                self._cancel_market_order(game, actor_id, command.order_id)
            elif isinstance(
                command,
                (
                    PayDebtCommand,
                    DemandRentDebtCommand,
                    ForgiveRentDebtCommand,
                    ProposeRentDebtPlanCommand,
                    AcceptRentDebtPlanCommand,
                    RejectRentDebtPlanCommand,
                    DeclareBankruptcyCommand,
                ),
            ):
                raise ConflictError("there is no outstanding debt")
            elif isinstance(command, ProposeTradeCommand):
                self._propose_trade(game, actor_id, command)
            elif isinstance(command, CounterTradeCommand):
                self._counter_trade(game, actor_id, command)
            elif isinstance(command, AcceptTradeCommand):
                self._accept_trade(game, actor_id, command)
            elif isinstance(command, AcceptFinancedTradeCommand):
                self._accept_financed_trade(game, actor_id, command)
            elif isinstance(command, RejectTradeCommand):
                self._reject_trade(game, actor_id, command)
            elif isinstance(command, CancelTradeCommand):
                self._cancel_trade(game, actor_id, command)
            elif isinstance(
                command,
                (
                    BidCommand,
                    PassAuctionCommand,
                    ReadyAuctionCommand,
                    SelectAuctionPropertyCommand,
                ),
            ):
                raise ConflictError("there is no active auction")
            elif isinstance(command, (ChooseCardCommand, ContinueCardCommand)):
                raise ConflictError("there is no pending card")
            elif isinstance(command, ResolveCardChoiceCommand):
                raise ConflictError("there is no pending card choice")
            elif isinstance(command, ContinueCardChoiceResultCommand):
                raise ConflictError("there is no pending card choice result")
            else:
                self._execute_turn_command(game, actor_id, command)
            self._explain_automated_decision(
                game,
                previous_sequence,
                automation_reason,
                automation_note,
            )
            self._apply_relationship_effects(game, previous_sequence)
            self._ensure_economy(game)
            self._sync_bank(game)
            await self._games.save(game, previous_sequence)
            if command_id is not None:
                await self._games.record_command(game_id, actor_id, command_id)
            return game

    @staticmethod
    def _explain_automated_decision(
        game: GameState,
        previous_sequence: int,
        reason: str | None,
        note: str | None,
    ) -> None:
        """Attach the bot's motive to the trade events it just produced.

        Only negotiation events carry it: that is where a player wonders why the
        answer was no, and it keeps the rest of the log untouched.
        """
        if reason is None:
            return
        for event in game.events[previous_sequence:]:
            if not event.type.startswith("trade."):
                continue
            event.data["bot_reason"] = reason
            if note is not None:
                event.data["bot_note"] = note

    async def settle_expired_auction(
        self,
        game_id: UUID,
        expected_deadline: datetime,
    ) -> GameState | None:
        async with self._session.begin():
            game = await self._games.get(game_id, for_update=True)
            auction = game.active_auction
            if (
                auction is None
                or auction.bid_deadline is None
                or auction.bid_deadline != expected_deadline
                or auction.bid_deadline > self._clock()
            ):
                return None
            previous_sequence = game.event_sequence
            if auction.phase == "idle":
                pending_player_ids = [
                    player_id
                    for player_id in auction.eligible_player_ids
                    if player_id not in auction.ready_player_ids
                    and player_id not in auction.passed_player_ids
                ]
                for player_id in pending_player_ids:
                    auction.passed_player_ids.append(player_id)
                    self._append_event(
                        game,
                        "auction.player_passed",
                        {
                            "auction_id": str(auction.id),
                            "property_id": auction.property_id,
                            "player_id": str(player_id),
                            "before_bidding": True,
                            "reason": "readiness_timeout",
                        },
                    )
                self._start_auction_bidding_if_ready(game)
            else:
                self._complete_auction(game)
            self._ensure_economy(game)
            self._sync_bank(game)
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
        if self._operating_cost_due_for(game, actor_id) > 0:
            raise ConflictError("operating costs must be paid or deferred before continuing")
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
                game.pending_purchase_discount_percent = 0
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
        game.pending_purchase_discount_percent = 0
        game.last_card_id = None
        if player.in_jail:
            self._roll_from_jail(game, player, dice)
            return

        is_double = dice[0] == dice[1]
        game.consecutive_doubles = game.consecutive_doubles + 1 if is_double else 0
        if game.consecutive_doubles >= pack.manifest.max_consecutive_doubles:
            position = player.position
            self._append_event(
                game,
                "dice.rolled",
                {
                    "player_id": str(player.user_id),
                    "dice": list(dice),
                    "from_position": position,
                    "to_position": position,
                    "position": position,
                    "steps": 0,
                    "movement": "step",
                    "consecutive_doubles": game.consecutive_doubles,
                    "tile_id": pack.board.tiles[position].id,
                },
            )
            self._send_to_jail(game, player, "consecutive_doubles")
            return

        game.extra_roll_pending = is_double
        from_position = player.position
        steps = sum(dice)
        to_position = (from_position + steps) % pack.manifest.tile_count
        tile = pack.board.tiles[to_position]
        self._append_event(
            game,
            "dice.rolled",
            {
                "player_id": str(player.user_id),
                "dice": list(dice),
                "from_position": from_position,
                "to_position": to_position,
                "position": to_position,
                "steps": steps,
                "movement": "step",
                "tile_id": tile.id,
                "is_double": is_double,
            },
        )
        self._move_forward(game, player, steps)
        if tile.is_purchasable and tile.id not in game.owners:
            game.pending_tile_id = tile.id
            game.phase = TurnPhase.BUY_DECISION
        else:
            game.phase = TurnPhase.WAITING_FOR_END
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
        from_position = player.position
        will_move = is_double or player.jail_failed_rolls + 1 >= pack.manifest.jail_max_failed_rolls
        steps = sum(dice) if will_move else 0
        to_position = (from_position + steps) % pack.manifest.tile_count
        self._append_event(
            game,
            "dice.rolled",
            {
                "player_id": str(player.user_id),
                "dice": list(dice),
                "from_position": from_position,
                "to_position": to_position,
                "position": to_position,
                "steps": steps,
                "movement": "step",
                "jail_attempt": True,
                "is_double": is_double,
                "tile_id": pack.board.tiles[to_position].id,
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
                amount=indexed_amount(game, pack.manifest.jail_fine, 80),
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
        if tile.is_purchasable and tile.id not in game.owners:
            game.pending_tile_id = tile.id
            game.phase = TurnPhase.BUY_DECISION
        else:
            game.phase = TurnPhase.WAITING_FOR_END
            if game.active_debt is None:
                self._resolve_landed_tile(game, player, tile.id, sum(dice))

    def _pay_jail_fine(self, game: GameState, player: PlayerState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_ROLL or not player.in_jail:
            raise ConflictError("the player cannot pay a jail fine now")
        fine = indexed_amount(game, self._pack(game).manifest.jail_fine, 80)
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
        discount_percent = game.pending_purchase_discount_percent
        price = indexed_amount(game, tile.price or 0) * (100 - discount_percent) // 100
        if player.balance < price:
            raise ConflictError("insufficient balance")
        player.balance -= price
        game.owners[tile.id] = player.user_id
        self._protect_acquired_properties(game, [tile.id])
        game.pending_tile_id = None
        game.pending_purchase_discount_percent = 0
        game.phase = TurnPhase.WAITING_FOR_END
        self._append_event(
            game,
            "property.purchased",
            {
                "player_id": str(player.user_id),
                "tile_id": tile.id,
                "price": price,
                "discount_percent": discount_percent,
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
            amount = self._tax_amount(game, player, tile)
            self._charge_player(
                game,
                player,
                amount=amount or 0,
                creditor_id=None,
                reason=DebtReason.TAX,
                tile_id=tile.id,
            )
            if game.active_debt is None:
                self._apply_landing_effects(game, player, tile)
            return
        if tile.auction_minimum_bid is not None:
            self._request_auction_selection(
                game,
                player,
                minimum_bid=tile.auction_minimum_bid,
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
        if not tile.is_purchasable:
            self._apply_landing_effects(game, player, tile)
            return
        owner_id = game.owners.get(tile.id)
        if owner_id is None or owner_id == player.user_id or tile.id in game.mortgaged_property_ids:
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

    def _apply_landing_effects(
        self,
        game: GameState,
        player: PlayerState,
        tile: TileDefinition,
    ) -> None:
        for effect in tile.landing_effects:
            self._apply_effect(
                game,
                player,
                effect,
                source_id=tile.id,
            )
            if game.active_debt is not None or isinstance(effect, GoToJailCardEffect):
                return

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
        candidates = self._draw_candidates(game, deck_id)
        if not candidates:
            self._append_event(game, "card.deck_empty", {"deck_id": deck_id})
            return
        self._append_event(
            game,
            "card.selection_started",
            {
                "player_id": str(player.user_id),
                "deck_id": deck_id,
                "offer_count": len(candidates),
            },
        )
        game.pending_card_draw = PendingCardDrawState(
            player_id=player.user_id,
            deck_id=deck_id,
            offer_count=len(candidates),
            draw_sequence=game.event_sequence,
        )

    @staticmethod
    def _draw_candidates(
        game: GameState,
        deck_id: str,
    ) -> list[tuple[int, str]]:
        order = game.deck_orders.get(deck_id) or []
        if not order:
            return []
        held_cards = {card_id for candidate in game.players for card_id in candidate.jail_card_ids}
        cursor = game.deck_cursors.get(deck_id, 0) % len(order)
        candidates: list[tuple[int, str]] = []
        for offset in range(len(order)):
            position = (cursor + offset) % len(order)
            card_id = order[position]
            if card_id in held_cards:
                continue
            candidates.append((position, card_id))
            if len(candidates) == 7:
                break
        return candidates

    def _choose_card(
        self,
        game: GameState,
        actor_id: UUID,
        card_index: int,
    ) -> None:
        pending = game.pending_card_draw
        if pending is None:
            raise ConflictError("there is no pending card")
        if pending.player_id != actor_id:
            raise ConflictError("only the selected player can choose this card")
        if pending.card_id is not None:
            raise ConflictError("the pending card was already chosen")
        candidates = self._draw_candidates(game, pending.deck_id)
        if card_index >= min(pending.offer_count, len(candidates)):
            raise ConflictError("the selected card position is not available")

        first_position, _ = candidates[0]
        selected_position, card_id = candidates[card_index]
        order = game.deck_orders[pending.deck_id]
        order[first_position], order[selected_position] = (
            order[selected_position],
            order[first_position],
        )
        game.deck_cursors[pending.deck_id] = (first_position + 1) % len(order)
        pending.card_id = card_id
        pending.selected_index = card_index
        game.last_card_id = card_id
        self._append_event(
            game,
            "card.drawn",
            {
                "player_id": str(actor_id),
                "deck_id": pending.deck_id,
                "card_id": card_id,
                "selected_index": card_index,
            },
        )
        pending.reveal_sequence = game.event_sequence

    def _continue_card(self, game: GameState, actor_id: UUID) -> None:
        pending = game.pending_card_draw
        if pending is None:
            raise ConflictError("there is no pending card")
        if pending.player_id != actor_id:
            raise ConflictError("only the selected player can continue this card")
        if pending.card_id is None:
            raise ConflictError("a card must be chosen before continuing")
        pack = self._pack(game)
        deck = next(
            (item for item in pack.board.decks if item.id == pending.deck_id),
            None,
        )
        if deck is None:
            raise ConflictError("the pending card deck does not exist")
        card = next(
            (item for item in deck.cards if item.id == pending.card_id),
            None,
        )
        if card is None:
            raise ConflictError("the pending card does not exist")

        game.pending_card_draw = None
        player = self._player(game, actor_id)
        self._append_event(
            game,
            "card.continued",
            {
                "player_id": str(player.user_id),
                "deck_id": pending.deck_id,
                "card_id": card.id,
                "draw_sequence": pending.draw_sequence,
            },
        )
        for effect in card.resolved_effects():
            self._apply_effect(
                game,
                player,
                effect,
                source_id=card.id,
            )
            if game.active_debt is not None or isinstance(effect, GoToJailCardEffect):
                break
            if game.pending_card_draw is not None or game.pending_card_choice is not None:
                break

    def _apply_effect(
        self,
        game: GameState,
        player: PlayerState,
        effect: object,
        *,
        source_id: str,
    ) -> bool:
        if self._remaining_effects <= 0:
            raise ConflictError("the configured effect chain exceeds the safe limit")
        self._remaining_effects -= 1
        pack = self._pack(game)
        if isinstance(effect, CashCardEffect):
            self._apply_card_cash(game, player, effect.amount, source_id)
            return False
        if isinstance(effect, MoveToCardEffect):
            from_position = player.position
            target_id = effect.tile_id
            if effect.tile_tag is not None:
                target_id = next(
                    tile.id for tile in pack.board.tiles if effect.tile_tag in tile.card_tags
                )
            target_position = next(
                index for index, tile in enumerate(pack.board.tiles) if tile.id == target_id
            )
            steps = (target_position - from_position) % pack.manifest.tile_count
            if effect.collect_start:
                self._move_forward(game, player, steps)
            else:
                player.position = target_position
            self._resolve_card_destination(
                game,
                player,
                source_id,
                from_position=from_position,
                steps=steps if effect.collect_start else 0,
                movement="step" if effect.collect_start else "teleport",
            )
            return True
        if isinstance(effect, MoveRelativeCardEffect):
            from_position = player.position
            if effect.steps > 0 and effect.collect_start:
                self._move_forward(game, player, effect.steps)
            else:
                player.position = (player.position + effect.steps) % pack.manifest.tile_count
            game.pending_purchase_discount_percent = effect.purchase_discount_percent or 0
            self._resolve_card_destination(
                game,
                player,
                source_id,
                from_position=from_position,
                steps=effect.steps,
                movement="step",
            )
            return True
        if isinstance(effect, MoveToNearestAuctionCardEffect):
            from_position = player.position
            candidates = [
                index
                for index, tile in enumerate(pack.board.tiles)
                if tile.auction_minimum_bid is not None
            ]
            if not candidates:
                raise ConflictError("the board does not define an auction tile")
            target_position = min(
                candidates,
                key=lambda index: (
                    (from_position - index) % pack.manifest.tile_count or pack.manifest.tile_count
                ),
            )
            steps = -(
                (from_position - target_position) % pack.manifest.tile_count
                or pack.manifest.tile_count
            )
            player.position = target_position
            self._resolve_card_destination(
                game,
                player,
                source_id,
                from_position=from_position,
                steps=steps,
                movement="step",
            )
            return True
        if isinstance(effect, MoveToNearestCardEffect):
            from_position = player.position
            target_kind = TileKind(effect.tile_kind)
            candidates = [
                index for index, tile in enumerate(pack.board.tiles) if tile.kind is target_kind
            ]
            if not candidates:
                raise ConflictError(f"the board does not define a {effect.tile_kind} tile")
            target_position = min(
                candidates,
                key=lambda index: (
                    (index - from_position) % pack.manifest.tile_count or pack.manifest.tile_count
                ),
            )
            steps = (
                target_position - from_position
            ) % pack.manifest.tile_count or pack.manifest.tile_count
            if effect.collect_start:
                self._move_forward(game, player, steps)
            else:
                player.position = target_position
            self._resolve_nearest_card_destination(
                game,
                player,
                source_id,
                effect,
                from_position=from_position,
                steps=steps if effect.collect_start else 0,
                movement="step" if effect.collect_start else "teleport",
            )
            return True
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
            amount = indexed_amount(
                game,
                house_count * effect.house_amount + hotel_count * effect.hotel_amount,
                80,
            )
            self._append_event(
                game,
                "card.repairs_assessed",
                {
                    "player_id": str(player.user_id),
                    "card_id": source_id,
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
                tile_id=source_id,
            )
            return False
        if isinstance(effect, CashEachCardEffect):
            indexed_payment = indexed_amount(game, abs(effect.amount), 80)
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
                        amount=indexed_payment,
                        card_id=source_id,
                    )
                    for candidate in active_others
                ]
            else:
                payments = [
                    CardPaymentState(
                        payer_id=player.user_id,
                        recipient_id=candidate.user_id,
                        amount=indexed_payment,
                        card_id=source_id,
                    )
                    for candidate in active_others
                ]
            game.pending_card_payments.extend(payments)
            self._process_card_payments(game)
            return False
        if isinstance(effect, GoToJailCardEffect):
            self._send_to_jail(game, player, "card")
            return True
        if isinstance(effect, GetOutOfJailCardEffect):
            player.jail_card_ids.append(source_id)
            return False
        if isinstance(effect, CompleteGroupsCashCardEffect):
            group_count = self._complete_group_count(game, player.user_id)
            amount = (
                effect.amount_if_at_least
                if group_count >= effect.threshold
                else effect.amount_otherwise
            )
            self._apply_card_cash(game, player, amount, source_id)
            return False
        if isinstance(effect, OwnedPropertiesCashCardEffect):
            owned_count = sum(owner_id == player.user_id for owner_id in game.owners.values())
            self._apply_card_cash(
                game,
                player,
                effect.amount_per_property * owned_count,
                source_id,
            )
            return False
        if isinstance(effect, MortgagedPropertiesCashCardEffect):
            mortgaged_count = sum(
                game.owners.get(property_id) == player.user_id
                for property_id in game.mortgaged_property_ids
            )
            self._apply_card_cash(
                game,
                player,
                effect.amount_per_property * mortgaged_count,
                source_id,
            )
            return False
        if isinstance(effect, RefinanceMortgageCardEffect):
            candidates = sorted(
                (
                    self._tile(game, property_id)
                    for property_id in game.mortgaged_property_ids
                    if game.owners.get(property_id) == player.user_id
                    and indexed_amount(
                        game,
                        self._tile(game, property_id).mortgage_value or 0,
                    )
                    <= player.balance
                ),
                key=lambda tile: (-(tile.mortgage_value or 0), tile.id),
            )
            if candidates:
                tile = candidates[0]
                amount = indexed_amount(game, tile.mortgage_value or 0)
                player.balance -= amount
                game.mortgaged_property_ids.remove(tile.id)
                self._append_event(
                    game,
                    "property.unmortgaged",
                    {
                        "player_id": str(player.user_id),
                        "property_id": tile.id,
                        "amount": amount,
                        "card_id": source_id,
                    },
                )
            return False
        if isinstance(effect, SalaryCashCardEffect):
            amount = pack.manifest.pass_start_salary * effect.salary_percent // 100
            self._apply_card_cash(game, player, amount, source_id)
            return False
        if isinstance(effect, EqualizeCashCardEffect):
            target = self._card_target_player(game, player, effect.target)
            if target is None:
                return False
            player_before = player.balance
            target_before = target.balance
            combined = player.balance + target.balance
            player.balance = combined // 2
            target.balance = combined - player.balance
            self._append_event(
                game,
                "card.cash_equalized",
                {
                    "player_id": str(player.user_id),
                    "target_player_id": str(target.user_id),
                    "card_id": source_id,
                    "player_balance_before": player_before,
                    "player_balance_after": player.balance,
                    "target_balance_before": target_before,
                    "target_balance_after": target.balance,
                },
            )
            return False
        if isinstance(effect, SwapPositionCardEffect):
            target = self._card_target_player(game, player, effect.target)
            if target is None:
                return False
            player_from = player.position
            target_from = target.position
            player.position, target.position = target_from, player_from
            self._append_card_movement_event(
                game,
                player,
                source_id,
                from_position=player_from,
                steps=0,
                movement="teleport",
            )
            self._append_card_movement_event(
                game,
                target,
                source_id,
                from_position=target_from,
                steps=0,
                movement="teleport",
            )
            return True
        if isinstance(effect, AllPlayersMoveRelativeCardEffect):
            for candidate in game.players:
                if candidate.bankrupt:
                    continue
                from_position = candidate.position
                if effect.steps > 0 and effect.collect_start:
                    self._move_forward(game, candidate, effect.steps)
                else:
                    candidate.position = (
                        candidate.position + effect.steps
                    ) % pack.manifest.tile_count
                self._append_card_movement_event(
                    game,
                    candidate,
                    source_id,
                    from_position=from_position,
                    steps=effect.steps,
                    movement="step",
                )
            return True
        if isinstance(effect, InteractiveChoiceCardEffect):
            if game.pending_card_choice is not None:
                raise ConflictError("another card choice is already pending")
            game.pending_card_choice = PendingCardChoiceState(
                player_id=player.user_id,
                card_id=source_id,
                effect=effect,
            )
            self._append_event(
                game,
                "card.choice_presented",
                {
                    "player_id": str(player.user_id),
                    "card_id": source_id,
                    "prompt_key": effect.prompt_key,
                    "category": effect.category,
                },
            )
            return True
        raise ValueError(f"unsupported effect type: {type(effect).__name__}")

    def _resolve_card_choice(
        self,
        game: GameState,
        actor_id: UUID,
        choice_id: str,
    ) -> None:
        pending = game.pending_card_choice
        if pending is None:
            raise ConflictError("there is no pending card choice")
        if pending.player_id != actor_id:
            raise ConflictError("only the selected player can resolve this card")
        choice = next(
            (item for item in pending.effect.choices if item.id == choice_id),
            None,
        )
        if choice is None:
            raise ConflictError("the selected card choice is not available")
        roll = self._outcome_roller(100)
        if roll < 0 or roll >= 100:
            raise ValueError("outcome roller must return a value from 0 to 99")
        cumulative = 0
        outcome = choice.outcomes[-1]
        for candidate in choice.outcomes:
            cumulative += candidate.weight
            if roll < cumulative:
                outcome = candidate
                break

        game.pending_card_choice = None
        player = self._player(game, actor_id)
        self._append_event(
            game,
            "card.choice_resolved",
            {
                "player_id": str(player.user_id),
                "card_id": pending.card_id,
                "choice_id": choice.id,
                "choice_label_key": choice.label_key,
                "result_key": outcome.result_key,
            },
        )
        resolved_sequence = game.event_sequence
        for effect in outcome.effects:
            self._apply_effect(game, player, effect, source_id=pending.card_id)
            if (
                game.active_debt is not None
                or game.pending_card_draw is not None
                or game.pending_card_choice is not None
                or isinstance(effect, GoToJailCardEffect)
            ):
                break
        game.pending_card_choice_result = PendingCardChoiceResultState(
            player_id=player.user_id,
            card_id=pending.card_id,
            effect=pending.effect,
            choice_id=choice.id,
            choice_label_key=choice.label_key,
            result_key=outcome.result_key,
            resolved_sequence=resolved_sequence,
        )

    def _continue_card_choice_result(
        self,
        game: GameState,
        actor_id: UUID,
    ) -> None:
        pending = game.pending_card_choice_result
        if pending is None:
            raise ConflictError("there is no pending card choice result")
        if pending.player_id != actor_id:
            raise ConflictError("only the selected player can continue this result")
        game.pending_card_choice_result = None
        self._append_event(
            game,
            "card.choice_result_acknowledged",
            {
                "player_id": str(actor_id),
                "card_id": pending.card_id,
                "choice_id": pending.choice_id,
            },
        )

    def _card_target_player(
        self,
        game: GameState,
        player: PlayerState,
        target: str,
    ) -> PlayerState | None:
        candidates = [
            candidate
            for candidate in game.players
            if candidate.user_id != player.user_id and not candidate.bankrupt
        ]
        if not candidates:
            return None
        ranked = sorted(
            candidates,
            key=lambda candidate: (
                self._player_net_worth(game, candidate),
                str(candidate.user_id),
            ),
        )
        return ranked[-1] if target == "wealthiest" else ranked[0]

    def _append_card_movement_event(
        self,
        game: GameState,
        player: PlayerState,
        card_id: str,
        *,
        from_position: int,
        steps: int,
        movement: str,
    ) -> None:
        tile = self._pack(game).board.tiles[player.position]
        self._append_event(
            game,
            "card.player_moved",
            {
                "player_id": str(player.user_id),
                "card_id": card_id,
                "tile_id": tile.id,
                "from_position": from_position,
                "to_position": player.position,
                "position": player.position,
                "steps": steps,
                "movement": movement,
            },
        )

    def _resolve_card_destination(
        self,
        game: GameState,
        player: PlayerState,
        card_id: str,
        *,
        from_position: int,
        steps: int,
        movement: str,
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
                "from_position": from_position,
                "to_position": player.position,
                "position": player.position,
                "steps": steps,
                "movement": movement,
            },
        )
        if target.is_purchasable and target.id not in game.owners:
            game.pending_tile_id = target.id
            game.phase = TurnPhase.BUY_DECISION
            return
        game.pending_purchase_discount_percent = 0
        game.phase = TurnPhase.WAITING_FOR_END
        self._resolve_landed_tile(game, player, target.id, 0)

    def _resolve_nearest_card_destination(
        self,
        game: GameState,
        player: PlayerState,
        card_id: str,
        effect: MoveToNearestCardEffect,
        *,
        from_position: int,
        steps: int,
        movement: str,
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
                "from_position": from_position,
                "to_position": player.position,
                "position": player.position,
                "steps": steps,
                "movement": movement,
            },
        )
        owner_id = game.owners.get(tile.id)
        if not tile.is_purchasable:
            game.phase = TurnPhase.WAITING_FOR_END
            self._resolve_landed_tile(game, player, tile.id, 0)
            return
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
            rent = self._calculate_rent(game, tile, owner_id, dice_total) * effect.rent_multiplier
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
            index for index, tile in enumerate(pack.board.tiles) if tile.kind is TileKind.START
        )
        old_position = player.position
        distance_to_start = (start_position - old_position) % tile_count
        if distance_to_start == 0:
            distance_to_start = tile_count
        crossings = (
            0 if steps < distance_to_start else 1 + (steps - distance_to_start) // tile_count
        )
        player.position = (old_position + steps) % tile_count
        if crossings == 0:
            return
        indexed_salary = indexed_amount(game, pack.manifest.pass_start_salary, 80)
        amount = crossings * indexed_salary
        if game.settings.rules.double_salary_on_start and player.position == start_position:
            amount += indexed_salary
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
        self._collect_loan_installments(game, player, crossings)

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
        from_position = player.position
        to_position = next(
            index for index, tile in enumerate(pack.board.tiles) if tile.id == jail_tile.id
        )
        player.position = to_position
        player.in_jail = True
        player.jail_failed_rolls = 0
        game.pending_tile_id = None
        game.pending_purchase_discount_percent = 0
        game.pending_auction_selector_id = None
        game.pending_auction_minimum_bid = None
        game.phase = TurnPhase.WAITING_FOR_END
        game.extra_roll_pending = False
        game.consecutive_doubles = 0
        self._append_event(
            game,
            "jail.entered",
            {
                "player_id": str(player.user_id),
                "reason": reason,
                "from_position": from_position,
                "to_position": to_position,
                "position": to_position,
                "steps": 0,
                "movement": "teleport",
            },
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
                and not any(item.id in game.mortgaged_property_ids for item in group_tiles)
            ):
                rent *= pack.manifest.monopoly_rent_multiplier
            return indexed_rent(game, tile, rent)
        owned_kind_count = sum(
            owner == owner_id and self._tile(game, property_id).kind is tile.kind
            for property_id, owner in game.owners.items()
        )
        if tile.kind is TileKind.TRANSPORT:
            rent_levels = tile.rent_levels or [tile.base_rent or 0]
            return indexed_rent(
                game,
                tile,
                rent_levels[min(owned_kind_count, len(rent_levels)) - 1],
            )
        if tile.kind is TileKind.UTILITY:
            multipliers = tile.rent_multipliers or [1]
            return indexed_rent(
                game,
                tile,
                dice_total * multipliers[min(owned_kind_count, len(multipliers)) - 1],
            )
        return 0

    def _player_net_worth(self, game: GameState, player: PlayerState) -> int:
        pack = self._pack(game)
        tiles_by_id = {tile.id: tile for tile in pack.board.tiles}
        owned_tiles = {
            tile_id: tiles_by_id[tile_id]
            for tile_id, owner_id in game.owners.items()
            if owner_id == player.user_id and tile_id in tiles_by_id
        }
        property_value = sum(
            indexed_amount(
                game,
                (tile.mortgage_value if tile.id in game.mortgaged_property_ids else tile.price)
                or 0,
            )
            for tile in owned_tiles.values()
        )
        building_value = 0
        for tile_id, level in game.building_levels.items():
            tile = owned_tiles.get(tile_id)
            if tile is None:
                continue
            house_cost = indexed_amount(game, tile.build_cost or 0)
            building_value += house_cost * min(level, 4)
            if level == 5:
                building_value += indexed_amount(
                    game,
                    tile.hotel_cost or tile.build_cost or 0,
                )
        investment_value = sum(
            instrument.current_price * instrument.holdings.get(player.user_id, 0)
            for instrument in game.bank.investments
        )
        investment_value += sum(
            self._investment(game, order.instrument_id).current_price * order.remaining_quantity
            for order in game.bank.market_orders
            if order.player_id == player.user_id and order.side is MarketOrderSide.SELL
        )
        reserved_cash = sum(
            order.reserved_cash
            for order in game.bank.market_orders
            if order.player_id == player.user_id and order.side is MarketOrderSide.BUY
        )
        loan_balance = sum(
            loan.remaining_balance for loan in game.bank.loans if loan.player_id == player.user_id
        )
        operating_debt = sum(
            debt.remaining_amount
            for debt in game.economy.operating_debts
            if debt.player_id == player.user_id
        )
        installment_debt = sum(
            plan.remaining_amount
            for plan in game.rent_debt_plans
            if plan.debtor_id == player.user_id
        )
        return max(
            0,
            player.balance
            + property_value
            + building_value
            + investment_value
            + reserved_cash
            - loan_balance
            - operating_debt
            - installment_debt,
        )

    def _complete_group_count(self, game: GameState, owner_id: UUID) -> int:
        pack = self._pack(game)
        return sum(
            bool(group_tiles) and all(game.owners.get(tile.id) == owner_id for tile in group_tiles)
            for group in pack.board.groups
            if (
                group_tiles := [
                    tile
                    for tile in pack.board.tiles
                    if tile.kind is TileKind.PROPERTY and tile.group == group.id
                ]
            )
        )

    def _tax_amount(
        self,
        game: GameState,
        player: PlayerState,
        tile: TileDefinition,
    ) -> int:
        if tile.amount is not None:
            return indexed_amount(game, tile.amount, 80)
        if tile.net_worth_percent is not None:
            return self._player_net_worth(game, player) * tile.net_worth_percent // 100
        if tile.complete_group_amount is not None:
            return indexed_amount(
                game,
                self._complete_group_count(game, player.user_id) * tile.complete_group_amount,
                80,
            )
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
        return indexed_amount(
            game,
            house_count * (tile.house_amount or 0) + hotel_count * (tile.hotel_amount or 0),
            80,
        )

    def _apply_card_cash(
        self,
        game: GameState,
        player: PlayerState,
        amount: int,
        card_id: str,
    ) -> None:
        amount = indexed_amount(game, abs(amount), 80) * (1 if amount >= 0 else -1)
        if amount >= 0:
            player.balance += amount
            self._append_event(
                game,
                "card.cash_applied",
                {
                    "player_id": str(player.user_id),
                    "card_id": card_id,
                    "amount": amount,
                },
            )
            return
        self._charge_player(
            game,
            player,
            amount=abs(amount),
            creditor_id=None,
            reason=DebtReason.CARD,
            tile_id=card_id,
        )

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
                if reason is DebtReason.RENT:
                    self._distribute_investment_rent(
                        game,
                        creditor_id,
                        amount,
                        tile_id,
                    )
                else:
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

    def _accrue_investment_dividends(
        self,
        game: GameState,
        instrument: InvestmentInstrumentState,
        amount: int,
        *,
        dividend_percent: int | None = None,
        allocation_percent: int = 100,
    ) -> tuple[dict[str, int], dict[str, int], dict[str, int], int, int]:
        accruals: dict[str, int] = {}
        payouts: dict[str, int] = {}
        loan_payments: dict[str, int] = {}
        accrued_units = 0
        applied_dividend_percent = (
            instrument.dividend_percent if dividend_percent is None else dividend_percent
        )
        for holder_id, shares in instrument.holdings.items():
            holder_units = (
                amount
                * applied_dividend_percent
                * allocation_percent
                * shares
                * DIVIDEND_SCALE
                // (10_000 * instrument.total_shares)
            )
            if holder_units <= 0:
                continue
            accruals[str(holder_id)] = holder_units
            accrued_units += holder_units

        funding_units = game.bank.dividend_unfunded_units + accrued_units
        funded = funding_units // DIVIDEND_SCALE
        game.bank.dividend_unfunded_units = funding_units % DIVIDEND_SCALE
        game.bank.dividend_cash_reserve += funded

        for holder_id_text, holder_units in accruals.items():
            holder_id = UUID(holder_id_text)
            holder = self._player(game, holder_id)
            holder.pending_dividend_units += holder_units
            instrument.pending_dividend_units[holder_id] = (
                instrument.pending_dividend_units.get(holder_id, 0) + holder_units
            )

        instrument.dividends_accrued_units += accrued_units
        return accruals, payouts, loan_payments, accrued_units, funded

    def _accrue_market_revenue(
        self,
        game: GameState,
        instrument: InvestmentInstrumentState,
        amount: int,
    ) -> tuple[dict[str, int], int, int, int]:
        (
            accruals,
            _,
            _,
            accrued_units,
            funded,
        ) = self._accrue_investment_dividends(
            game,
            instrument,
            amount,
            allocation_percent=100 - INDEX_DIVIDEND_ALLOCATION_PERCENT,
        )
        index_instrument = next(
            (item for item in game.bank.investments if item.instrument_kind == "index"),
            None,
        )
        index_accrued_units = 0
        if index_instrument is not None and instrument.instrument_kind != "index":
            (
                _,
                _,
                _,
                index_accrued_units,
                index_funded,
            ) = self._accrue_investment_dividends(
                game,
                index_instrument,
                amount,
                dividend_percent=instrument.dividend_percent,
                allocation_percent=INDEX_DIVIDEND_ALLOCATION_PERCENT,
            )
            index_instrument.gross_revenue += amount
            index_instrument.period_revenue += amount
            funded += index_funded
        return accruals, accrued_units, index_accrued_units, funded

    def _settle_market_dividends(self, game: GameState) -> None:
        if not game.settings.rules.stock_market_enabled:
            return
        payouts: dict[str, int] = {}
        loan_payments: dict[str, int] = {}
        instrument_payouts: dict[str, dict[str, int]] = {}
        for instrument in game.bank.investments:
            instrument_paid = 0
            for holder_id, units in list(instrument.pending_dividend_units.items()):
                payout = units // DIVIDEND_SCALE
                if payout <= 0:
                    continue
                if payout > game.bank.dividend_cash_reserve:
                    raise RuntimeError("dividend cash reserve is inconsistent")
                instrument.pending_dividend_units[holder_id] = units % DIVIDEND_SCALE
                holder = self._player(game, holder_id)
                holder.pending_dividend_units -= payout * DIVIDEND_SCALE
                game.bank.dividend_cash_reserve -= payout
                loan_payment = self._credit_investment_payout(
                    game,
                    holder_id,
                    payout,
                )
                holder_id_text = str(holder_id)
                payouts[holder_id_text] = payouts.get(holder_id_text, 0) + payout
                instrument_payouts.setdefault(instrument.id, {})[holder_id_text] = payout
                if loan_payment:
                    loan_payments[holder_id_text] = (
                        loan_payments.get(holder_id_text, 0) + loan_payment
                    )
                instrument_paid += payout
            instrument.dividends_paid += instrument_paid
            instrument.period_revenue = 0
            instrument.last_settlement_sequence = game.event_sequence + 1
        game.bank.market_round += 1
        self._append_event(
            game,
            "investment.dividends_settled",
            {
                "market_round": game.bank.market_round,
                "payouts": payouts,
                "instrument_payouts": instrument_payouts,
                "loan_payments": loan_payments,
                "amount": sum(payouts.values()),
                "pending_dividend_units": sum(
                    player.pending_dividend_units for player in game.players
                ),
            },
        )
        self._enforce_margin_controls(game)

    def _enforce_margin_controls(self, game: GameState) -> None:
        pack = self._pack(game)
        for loan in list(game.bank.loans):
            player = self._player(game, loan.player_id)
            if player.bankrupt:
                continue
            required_reserve = (
                loan.installment_amount * pack.manifest.loan_investment_installment_reserve
                + pack.manifest.pass_start_salary
                * pack.manifest.loan_investment_reserve_salary_percent
                // 100
            )
            exposure = sum(
                instrument.current_price * instrument.holdings.get(player.user_id, 0)
                for instrument in game.bank.investments
            )
            exposure += sum(
                self._investment(game, order.instrument_id).current_price * order.remaining_quantity
                for order in game.bank.market_orders
                if order.player_id == player.user_id and order.side is MarketOrderSide.SELL
            )
            exposure += sum(
                order.limit_price * order.remaining_quantity
                for order in game.bank.market_orders
                if order.player_id == player.user_id and order.side is MarketOrderSide.BUY
            )
            exposure_limit = max(
                0,
                self._player_net_worth(game, player)
                * pack.manifest.loan_investment_max_net_worth_percent
                // 100,
            )
            if player.balance >= required_reserve and exposure <= exposure_limit:
                continue
            cancelled_order_ids = [
                order.id
                for order in game.bank.market_orders
                if order.player_id == player.user_id and order.side is MarketOrderSide.BUY
            ]
            for order_id in cancelled_order_ids:
                self._cancel_market_order(game, player.user_id, order_id)
            self._append_event(
                game,
                "investment.margin_call",
                {
                    "player_id": str(player.user_id),
                    "cash_reserve": player.balance,
                    "required_reserve": required_reserve,
                    "exposure": exposure,
                    "exposure_limit": exposure_limit,
                    "cancelled_orders": len(cancelled_order_ids),
                },
            )

    def _distribute_investment_rent(
        self,
        game: GameState,
        owner_id: UUID,
        amount: int,
        tile_id: str,
    ) -> None:
        instrument = next(
            (item for item in game.bank.investments if item.tile_id == tile_id),
            None,
        )
        held_shares = sum(instrument.holdings.values()) if instrument else 0
        if not game.settings.rules.stock_market_enabled or instrument is None or held_shares == 0:
            self._player(game, owner_id).balance += amount
            return
        revenue_fee = amount * instrument.revenue_fee_percent // 100
        (
            accruals,
            accrued_units,
            index_accrued_units,
            funded,
        ) = self._accrue_market_revenue(game, instrument, amount)
        payouts: dict[str, int] = {}
        loan_payments: dict[str, int] = {}
        distributed = 0
        owner_amount = amount - revenue_fee - funded
        self._player(game, owner_id).balance += owner_amount
        instrument.gross_revenue += amount
        instrument.period_revenue += amount
        previous_price = instrument.current_price
        performance_step = max(
            1,
            amount // max(1, instrument.total_shares * 20),
        )
        performance_step = min(
            performance_step,
            max(1, instrument.current_price * 5 // 100),
        )
        instrument.current_price += performance_step
        instrument.session_high = max(
            instrument.session_high,
            instrument.current_price,
        )
        instrument.session_low = min(
            instrument.session_low or previous_price,
            previous_price,
        )
        refresh_market_index(game)
        self._append_event(
            game,
            "investment.dividend_paid",
            {
                "instrument_id": instrument.id,
                "tile_id": tile_id,
                "rent": amount,
                "owner_id": str(owner_id),
                "owner_amount": owner_amount,
                "bank_fee": revenue_fee,
                "dividends": distributed,
                "dividend_accrued_units": accrued_units,
                "index_dividend_accrued_units": index_accrued_units,
                "dividend_funded": funded,
                "dividend_accruals": accruals,
                "pending_dividend_units": sum(
                    player.pending_dividend_units for player in game.players
                ),
                "payouts": payouts,
                "loan_payments": loan_payments,
                "previous_price": previous_price,
                "new_price": instrument.current_price,
            },
        )

    def _distribute_institution_revenue(
        self,
        game: GameState,
        instrument_kind: str,
        amount: int,
        revenue_type: str,
    ) -> int:
        if amount <= 0 or not game.settings.rules.stock_market_enabled:
            return amount
        instrument = next(
            (item for item in game.bank.investments if item.instrument_kind == instrument_kind),
            None,
        )
        if instrument is None:
            return amount
        (
            accruals,
            accrued_units,
            index_accrued_units,
            funded,
        ) = self._accrue_market_revenue(game, instrument, amount)
        payouts: dict[str, int] = {}
        loan_payments: dict[str, int] = {}
        distributed = 0
        instrument.gross_revenue += amount
        instrument.period_revenue += amount
        previous_price = instrument.current_price
        performance_step = max(
            1,
            amount // max(1, instrument.total_shares * 20),
        )
        performance_step = min(
            performance_step,
            max(1, instrument.current_price * 5 // 100),
        )
        instrument.current_price += performance_step
        instrument.session_high = max(
            instrument.session_high,
            instrument.current_price,
        )
        instrument.session_low = min(
            instrument.session_low or previous_price,
            previous_price,
        )
        refresh_market_index(game)
        self._append_event(
            game,
            "investment.institution_revenue",
            {
                "instrument_id": instrument.id,
                "tile_id": instrument.tile_id,
                "instrument_kind": instrument_kind,
                "revenue_type": revenue_type,
                "amount": amount,
                "dividends": distributed,
                "dividend_accrued_units": accrued_units,
                "index_dividend_accrued_units": index_accrued_units,
                "dividend_funded": funded,
                "dividend_accruals": accruals,
                "pending_dividend_units": sum(
                    player.pending_dividend_units for player in game.players
                ),
                "payouts": payouts,
                "loan_payments": loan_payments,
                "previous_price": previous_price,
                "new_price": instrument.current_price,
            },
        )
        return amount - funded

    def _credit_investment_payout(
        self,
        game: GameState,
        holder_id: UUID,
        payout: int,
    ) -> int:
        holder = self._player(game, holder_id)
        holder.balance += payout
        loan = next(
            (
                item
                for item in game.bank.loans
                if item.player_id == holder_id and item.remaining_balance > 0
            ),
            None,
        )
        if loan is None:
            return 0
        loan_payment = min(payout, loan.remaining_balance)
        self._apply_loan_payment(
            game,
            holder,
            loan,
            loan_payment,
            automatic=False,
        )
        return loan_payment

    def _deposit_bank_pot(
        self,
        game: GameState,
        amount: int,
        reason: DebtReason,
    ) -> None:
        instrument_kind = {
            DebtReason.JAIL_FINE: "jail",
            DebtReason.TAX: "tax",
            DebtReason.CARD: "bank",
        }.get(reason)
        net_amount = (
            self._distribute_institution_revenue(
                game,
                instrument_kind,
                amount,
                reason.value,
            )
            if instrument_kind is not None
            else amount
        )
        if game.settings.rules.free_parking_jackpot and reason in {
            DebtReason.TAX,
            DebtReason.CARD,
            DebtReason.JAIL_FINE,
        }:
            game.bank_pot += net_amount
            self._append_event(
                game,
                "bank_pot.increased",
                {
                    "amount": net_amount,
                    "balance": game.bank_pot,
                    "reason": reason.value,
                },
            )

    @staticmethod
    def _operating_cost_due_for(game: GameState, player_id: UUID) -> int:
        assessment = game.economy.operating_cost_assessment
        if assessment is None or assessment.due_week > game.economy.elapsed_weeks:
            return 0
        if player_id in assessment.resolved_player_ids:
            return 0
        return assessment.amounts.get(player_id, 0)

    def _pay_operating_costs(self, game: GameState, actor_id: UUID) -> None:
        current = game.current_player
        if current is None or current.user_id != actor_id:
            raise ConflictError("operating costs can only be resolved on the player's turn")
        amount = self._operating_cost_due_for(game, actor_id)
        if amount <= 0:
            raise ConflictError("this player has no operating costs due")
        player = self._active_player(game, actor_id)
        if player.balance < amount:
            raise ConflictError("insufficient balance")
        player.balance -= amount
        assessment = game.economy.operating_cost_assessment
        assert assessment is not None
        assessment.resolved_player_ids.append(actor_id)
        self._append_event(
            game,
            "economy.operating_cost_paid",
            {
                "player_id": str(actor_id),
                "amount": amount,
                "week": game.economy.elapsed_weeks,
            },
        )

    def _defer_operating_costs(self, game: GameState, actor_id: UUID) -> None:
        current = game.current_player
        if current is None or current.user_id != actor_id:
            raise ConflictError("operating costs can only be resolved on the player's turn")
        amount = self._operating_cost_due_for(game, actor_id)
        if amount <= 0:
            raise ConflictError("this player has no operating costs due")
        total_due = (amount * 110 + 99) // 100
        debt = next(
            (item for item in game.economy.operating_debts if item.player_id == actor_id),
            None,
        )
        if debt is None:
            debt = OperatingDebtState(
                player_id=actor_id,
                principal=amount,
                remaining_amount=total_due,
                created_week=game.economy.elapsed_weeks,
            )
            game.economy.operating_debts.append(debt)
        else:
            debt.principal += amount
            debt.remaining_amount += total_due
        assessment = game.economy.operating_cost_assessment
        assert assessment is not None
        assessment.resolved_player_ids.append(actor_id)
        self._append_event(
            game,
            "economy.operating_cost_deferred",
            {
                "player_id": str(actor_id),
                "amount": amount,
                "total_due": total_due,
                "rent_penalty_percent": 25,
                "week": game.economy.elapsed_weeks,
            },
        )

    def _repay_operating_debt(
        self,
        game: GameState,
        actor_id: UUID,
        requested_amount: int | None,
    ) -> None:
        player = self._active_player(game, actor_id)
        debt = next(
            (item for item in game.economy.operating_debts if item.player_id == actor_id),
            None,
        )
        if debt is None:
            raise ConflictError("this player has no operating debt")
        amount = min(requested_amount or debt.remaining_amount, debt.remaining_amount)
        if player.balance < amount:
            raise ConflictError("insufficient balance")
        player.balance -= amount
        debt.remaining_amount -= amount
        completed = debt.remaining_amount == 0
        if completed:
            game.economy.operating_debts.remove(debt)
        self._append_event(
            game,
            "economy.operating_debt_paid",
            {
                "player_id": str(actor_id),
                "amount": amount,
                "remaining_amount": debt.remaining_amount,
                "completed": completed,
            },
        )

    def _bid_public_project(
        self,
        game: GameState,
        actor_id: UUID,
        command: BidPublicProjectCommand,
    ) -> None:
        player = self._active_player(game, actor_id)
        project = next(
            (item for item in game.economy.public_projects if item.id == command.project_id),
            None,
        )
        if project is None or project.status != "bidding":
            raise ConflictError("the public project is not accepting bids")
        if game.economy.elapsed_weeks >= project.bidding_ends_week:
            raise ConflictError("the public project bidding period ended")
        if command.amount < project.minimum_bid:
            raise ConflictError("the bid is below the project minimum")
        previous_bid = project.bids.get(actor_id)
        if previous_bid is not None and command.amount <= previous_bid.amount:
            raise ConflictError("the new project bid must be higher")
        if player.balance < command.amount:
            raise ConflictError("insufficient balance")
        required_kind = TileKind(project.required_tile_kind)
        if not qualifies_for_public_project(
            game,
            self._pack(game),
            actor_id,
            required_kind,
            project.required_building_levels,
        ):
            raise ConflictError("the player does not meet the project requirements")
        project.bids[actor_id] = PublicProjectBidState(
            amount=command.amount,
            sequence=game.event_sequence + 1,
        )
        self._append_event(
            game,
            "economy.public_project_bid",
            {
                "project_id": str(project.id),
                "player_id": str(actor_id),
                "amount": command.amount,
                "kind": project.kind.value,
            },
        )

    def _vote_finale(self, game: GameState, actor_id: UUID, approve: bool) -> None:
        vote = game.economy.finale_vote
        if vote is None:
            raise ConflictError("there is no open finale vote")
        if actor_id not in vote.eligible_player_ids:
            raise ForbiddenError("only active human players can vote")
        vote.votes[actor_id] = approve
        self._append_event(
            game,
            "game.finale_vote_cast",
            {"player_id": str(actor_id), "approve": approve},
        )
        if not approve:
            game.economy.finale_vote = None
            game.economy.next_finale_vote_week = (
                game.economy.elapsed_weeks + game.settings.finale_vote_interval_weeks
            )
            self._append_event(
                game,
                "game.finale_vote_rejected",
                {"next_vote_week": game.economy.next_finale_vote_week},
            )
            return
        if all(player_id in vote.votes for player_id in vote.eligible_player_ids):
            ends_week = game.economy.elapsed_weeks + game.settings.finale_duration_weeks
            game.economy.finale = FinaleState(
                started_week=game.economy.elapsed_weeks,
                ends_week=ends_week,
            )
            game.economy.finale_vote = None
            self._append_event(
                game,
                "game.finale_started",
                {
                    "started_week": game.economy.elapsed_weeks,
                    "ends_week": ends_week,
                },
            )

    def _process_advanced_week(self, game: GameState) -> None:
        if not game.settings.advanced_economy_enabled:
            return
        economy = game.economy
        pack = self._pack(game)
        assessment = economy.operating_cost_assessment
        if assessment is not None and assessment.due_week < economy.elapsed_weeks:
            for player_id, amount in assessment.amounts.items():
                if player_id in assessment.resolved_player_ids or amount <= 0:
                    continue
                player = self._player(game, player_id)
                if player.bankrupt:
                    assessment.resolved_player_ids.append(player_id)
                    continue
                current_index = game.current_player_index
                try:
                    game.current_player_index = next(
                        index
                        for index, player in enumerate(game.players)
                        if player.user_id == player_id
                    )
                    self._defer_operating_costs(game, player_id)
                finally:
                    game.current_player_index = current_index
            economy.operating_cost_assessment = None

        next_cost_week = economy.next_operating_cost_week
        if next_cost_week is not None and economy.elapsed_weeks == next_cost_week - 1:
            amounts = operating_costs_by_player(game, pack)
            economy.operating_cost_assessment = OperatingCostAssessmentState(
                due_week=next_cost_week,
                announced_week=economy.elapsed_weeks,
                amounts=amounts,
            )
            self._append_event(
                game,
                "economy.operating_cost_announced",
                {
                    "due_week": next_cost_week,
                    "amounts": {str(key): value for key, value in amounts.items()},
                },
            )
        if next_cost_week is not None and economy.elapsed_weeks >= next_cost_week:
            amounts = operating_costs_by_player(game, pack)
            economy.operating_cost_assessment = OperatingCostAssessmentState(
                due_week=economy.elapsed_weeks,
                announced_week=max(0, economy.elapsed_weeks - 1),
                amounts=amounts,
            )
            economy.next_operating_cost_week = economy.elapsed_weeks + 4
            self._append_event(
                game,
                "economy.operating_cost_due",
                {
                    "week": economy.elapsed_weeks,
                    "amounts": {str(key): value for key, value in amounts.items()},
                    "next_due_week": economy.next_operating_cost_week,
                },
            )

        self._process_public_projects(game)
        self._maybe_open_finale_vote(game)
        if economy.finale is not None and economy.elapsed_weeks >= economy.finale.ends_week:
            self._finish_finale(game)

    def _process_public_projects(self, game: GameState) -> None:
        economy = game.economy
        pack = self._pack(game)
        for project in economy.public_projects:
            if project.status == "bidding" and economy.elapsed_weeks >= project.bidding_ends_week:
                candidates = sorted(
                    project.bids.items(),
                    key=lambda item: (-item[1].amount, item[1].sequence, str(item[0])),
                )
                winner: PlayerState | None = None
                winning_bid = 0
                for player_id, bid in candidates:
                    player = self._player(game, player_id)
                    if (
                        not player.bankrupt
                        and player.balance >= bid.amount
                        and qualifies_for_public_project(
                            game,
                            pack,
                            player_id,
                            TileKind(project.required_tile_kind),
                            project.required_building_levels,
                        )
                    ):
                        winner = player
                        winning_bid = bid.amount
                        break
                if winner is None:
                    project.status = "expired"
                else:
                    winner.balance -= winning_bid
                    project.status = "active"
                    project.owner_id = winner.user_id
                    project.winning_bid = winning_bid
                    project.completes_week = economy.elapsed_weeks + 4
                self._append_event(
                    game,
                    "economy.public_project_awarded",
                    {
                        "project_id": str(project.id),
                        "kind": project.kind.value,
                        "winner_id": str(winner.user_id) if winner else None,
                        "amount": winning_bid,
                        "completes_week": project.completes_week,
                    },
                )
            if (
                project.status == "active"
                and project.completes_week is not None
                and economy.elapsed_weeks >= project.completes_week
                and project.owner_id is not None
            ):
                owner = self._player(game, project.owner_id)
                completed = not owner.bankrupt and qualifies_for_public_project(
                    game,
                    pack,
                    owner.user_id,
                    TileKind(project.required_tile_kind),
                    project.required_building_levels,
                )
                project.status = "completed" if completed else "failed"
                if completed:
                    owner.balance += project.reward_amount
                self._append_event(
                    game,
                    "economy.public_project_completed"
                    if completed
                    else "economy.public_project_failed",
                    {
                        "project_id": str(project.id),
                        "kind": project.kind.value,
                        "player_id": str(owner.user_id),
                        "reward_amount": project.reward_amount if completed else 0,
                    },
                )

        next_project_week = economy.next_public_project_week
        if next_project_week is None or economy.elapsed_weeks < next_project_week:
            return
        kinds = list(PublicProjectKind)
        kind = kinds[(economy.elapsed_weeks // 8 - 1) % len(kinds)]
        minimum, reward, required_kind, required_levels = public_project_terms(
            game,
            pack,
            kind,
        )
        project = PublicProjectState(
            kind=kind,
            announced_week=economy.elapsed_weeks,
            bidding_ends_week=economy.elapsed_weeks + 1,
            minimum_bid=minimum,
            reward_amount=reward,
            required_tile_kind=required_kind.value,
            required_building_levels=required_levels,
        )
        if len(economy.public_projects) >= 40:
            economy.public_projects = [
                item for item in economy.public_projects if item.status in {"bidding", "active"}
            ][-39:]
        economy.public_projects.append(project)
        economy.next_public_project_week = economy.elapsed_weeks + 8
        self._append_event(
            game,
            "economy.public_project_announced",
            {
                "project_id": str(project.id),
                "kind": kind.value,
                "minimum_bid": minimum,
                "reward_amount": reward,
                "bidding_ends_week": project.bidding_ends_week,
                "required_tile_kind": required_kind.value,
                "required_building_levels": required_levels,
            },
        )
        for bot in game.players:
            if (
                bot.bankrupt
                or not bot.is_bot
                or bot.balance < minimum
                or not qualifies_for_public_project(
                    game,
                    pack,
                    bot.user_id,
                    required_kind,
                    required_levels,
                )
            ):
                continue
            premium = 20 if bot.bot_personality is BotPersonality.AGGRESSIVE else 5
            amount = min(bot.balance, minimum * (100 + premium) // 100)
            self._bid_public_project(
                game,
                bot.user_id,
                BidPublicProjectCommand(
                    action="bid_public_project",
                    project_id=project.id,
                    amount=amount,
                ),
            )

    def _maybe_open_finale_vote(self, game: GameState) -> None:
        economy = game.economy
        if economy.finale is not None or economy.finale_vote is not None:
            return
        active = [player for player in game.players if not player.bankrupt]
        next_vote_week = economy.next_finale_vote_week
        if (
            len(active) > 3
            or next_vote_week is None
            or economy.elapsed_weeks < max(game.settings.finale_trigger_week, next_vote_week)
        ):
            return
        humans = [player.user_id for player in active if not player.is_bot]
        if not humans:
            economy.next_finale_vote_week = (
                economy.elapsed_weeks + game.settings.finale_vote_interval_weeks
            )
            return
        economy.finale_vote = FinaleVoteState(
            opened_week=economy.elapsed_weeks,
            eligible_player_ids=humans,
        )
        self._append_event(
            game,
            "game.finale_vote_opened",
            {
                "week": economy.elapsed_weeks,
                "eligible_player_ids": [str(player_id) for player_id in humans],
                "duration_weeks": game.settings.finale_duration_weeks,
            },
        )

    def _finish_finale(self, game: GameState) -> None:
        finale = game.economy.finale
        if finale is None:
            return
        pack = self._pack(game)
        active = [player for player in game.players if not player.bankrupt]
        scores = {player.user_id: audited_net_worth(game, pack, player) for player in active}
        winner = max(
            active,
            key=lambda player: (
                scores[player.user_id],
                player.balance,
                str(player.user_id),
            ),
        )
        finale.final_scores = scores
        finale.winner_id = winner.user_id
        game.status = GameStatus.FINISHED
        self._refund_all_auction_deposits(game, reason="game_finished")
        game.active_auction = None
        game.bank_auction_queue.clear()
        game.pending_card_payments.clear()
        self._append_event(
            game,
            "game.finished",
            {
                "winner_id": str(winner.user_id),
                "reason": "finale_countdown",
                "scores": {str(key): value for key, value in scores.items()},
            },
        )

    def _end_turn(self, game: GameState) -> None:
        if game.phase is not TurnPhase.WAITING_FOR_END:
            raise ConflictError("the turn cannot end now")
        game.pending_tile_id = None
        current = game.current_player
        if game.extra_roll_pending and current is not None and not current.in_jail:
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
            game.building_levels.get(item.id, 0) > 0 for item in self._group_tiles(game, tile)
        ):
            raise ConflictError("all buildings in the group must be sold first")
        value = indexed_amount(game, tile.mortgage_value or 0)
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
        value = indexed_amount(game, tile.mortgage_value or 0)
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
        base_cost = (
            tile.hotel_cost
            if current_level == 4 and tile.hotel_cost is not None
            else tile.build_cost or 0
        )
        cost = indexed_amount(game, base_cost)
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
        base_building_cost = (
            tile.hotel_cost
            if current_level == 5 and tile.hotel_cost is not None
            else tile.build_cost or 0
        )
        building_cost = indexed_amount(game, base_building_cost)
        refund = building_cost * pack.manifest.building_sell_percent // 100
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

    def _build_group_round(
        self,
        game: GameState,
        actor_id: UUID,
        group_id: str,
    ) -> None:
        player = self._active_player(game, actor_id)
        group_tiles = self._owned_property_group(game, actor_id, group_id)
        if any(item.id in game.mortgaged_property_ids for item in group_tiles):
            raise ConflictError("mortgaged groups cannot be developed")
        levels = {item.id: game.building_levels.get(item.id, 0) for item in group_tiles}
        minimum_level = min(levels.values())
        maximum_level = max(levels.values())
        if maximum_level - minimum_level > 1:
            raise ConflictError("buildings must be distributed evenly")
        if minimum_level >= 5:
            raise ConflictError("the property group already has hotels")
        target_tiles = [item for item in group_tiles if levels[item.id] == minimum_level]
        costs = [
            indexed_amount(
                game,
                (
                    item.hotel_cost
                    if minimum_level == 4 and item.hotel_cost is not None
                    else item.build_cost or 0
                ),
            )
            for item in target_tiles
        ]
        if player.balance < sum(costs):
            raise ConflictError("insufficient balance for the property group")
        if minimum_level < 4 and game.houses_remaining < len(target_tiles):
            raise ConflictError("there are not enough houses available")
        if minimum_level == 4 and game.hotels_remaining < len(target_tiles):
            raise ConflictError("there are not enough hotels available")
        for tile in target_tiles:
            self._build_property(game, actor_id, tile.id)

    def _sell_group_round(
        self,
        game: GameState,
        actor_id: UUID,
        group_id: str,
    ) -> None:
        self._active_player(game, actor_id)
        group_tiles = self._owned_property_group(game, actor_id, group_id)
        levels = {item.id: game.building_levels.get(item.id, 0) for item in group_tiles}
        minimum_level = min(levels.values())
        maximum_level = max(levels.values())
        if maximum_level - minimum_level > 1:
            raise ConflictError("buildings must be sold evenly")
        if maximum_level <= 0:
            raise ConflictError("the property group has no buildings")
        target_tiles = [item for item in group_tiles if levels[item.id] == maximum_level]
        hotels_to_sell = sum(levels[item.id] == 5 for item in target_tiles)
        houses_required = hotels_to_sell * 4
        if game.houses_remaining < houses_required:
            raise ConflictError("four houses per hotel are required to sell this round")
        for tile in target_tiles:
            self._sell_building(game, actor_id, tile.id)

    def _request_loan(
        self,
        game: GameState,
        actor_id: UUID,
        amount: int,
    ) -> None:
        player = self._active_player(game, actor_id)
        if not game.settings.rules.loans_enabled:
            raise ConflictError("bank loans are disabled for this game")
        if any(loan.player_id == actor_id for loan in game.bank.loans):
            raise ConflictError("the player already has an active bank loan")
        pack = self._pack(game)
        offer = credit_offer(game, pack, player)
        if offer.maximum_amount <= 0 or amount > offer.maximum_amount:
            raise ConflictError(f"the maximum available loan is {offer.maximum_amount}")
        if available_bank_cash(game) - amount < minimum_reserve(game):
            raise ConflictError("the bank reserve is too low for this loan")
        interest = (amount * offer.interest_percent + 99) // 100
        total_due = amount + interest
        maximum_installment = max(
            1,
            pack.manifest.pass_start_salary * pack.manifest.loan_salary_payment_percent // 100,
        )
        installments = min(
            offer.maximum_term_laps,
            max(
                pack.manifest.loan_term_laps,
                (total_due + maximum_installment - 1) // maximum_installment,
            ),
        )
        installment = (total_due + installments - 1) // installments
        player.balance += amount
        profile = credit_profile(game, actor_id)
        profile.total_borrowed += amount
        loan = BankLoanState(
            player_id=actor_id,
            principal=amount,
            interest_amount=interest,
            interest_percent=offer.interest_percent,
            remaining_balance=total_due,
            installment_amount=installment,
            installments_remaining=installments,
            issued_at_sequence=game.event_sequence + 1,
        )
        game.bank.loans.append(loan)
        self._append_event(
            game,
            "bank.loan_issued",
            {
                "loan_id": str(loan.id),
                "player_id": str(actor_id),
                "principal": amount,
                "interest": interest,
                "interest_percent": offer.interest_percent,
                "total_due": total_due,
                "installment": installment,
                "installments": installments,
                "credit_score": profile.score,
            },
        )

    def _repay_loan(
        self,
        game: GameState,
        actor_id: UUID,
        requested_amount: int | None,
    ) -> None:
        player = self._active_player(game, actor_id)
        loan = next(
            (item for item in game.bank.loans if item.player_id == actor_id),
            None,
        )
        if loan is None:
            raise ConflictError("the player does not have an active bank loan")
        amount = min(requested_amount or loan.remaining_balance, loan.remaining_balance)
        if player.balance < amount:
            raise ConflictError("insufficient balance")
        self._apply_loan_payment(game, player, loan, amount, automatic=False)

    def _collect_loan_installments(
        self,
        game: GameState,
        player: PlayerState,
        crossings: int,
    ) -> None:
        for _ in range(crossings):
            loan = next(
                (item for item in game.bank.loans if item.player_id == player.user_id),
                None,
            )
            if loan is None:
                return
            amount = min(loan.installment_amount, loan.remaining_balance)
            if player.balance < amount:
                available = player.balance
                if available:
                    self._apply_loan_payment(
                        game,
                        player,
                        loan,
                        available,
                        automatic=False,
                    )
                profile = credit_profile(game, player.user_id)
                profile.late_payments += 1
                profile.score = max(300, profile.score - 35)
                self._append_event(
                    game,
                    "bank.loan_payment_missed",
                    {
                        "loan_id": str(loan.id),
                        "player_id": str(player.user_id),
                        "expected_amount": amount,
                        "paid_amount": available,
                        "shortfall": amount - available,
                        "credit_score": profile.score,
                        "score_change": -35,
                    },
                )
                continue
            self._apply_loan_payment(game, player, loan, amount, automatic=True)

    def _apply_loan_payment(
        self,
        game: GameState,
        player: PlayerState,
        loan: BankLoanState,
        amount: int,
        *,
        automatic: bool,
    ) -> None:
        player.balance -= amount
        loan.remaining_balance -= amount
        if automatic:
            loan.installments_remaining = max(0, loan.installments_remaining - 1)
            loan.scheduled_payments_made += 1
        elif loan.remaining_balance:
            loan.installments_remaining = max(
                1,
                (loan.remaining_balance + loan.installment_amount - 1) // loan.installment_amount,
            )
        paid_off = loan.remaining_balance == 0
        remaining_interest = max(0, loan.interest_amount - loan.interest_paid)
        if paid_off:
            interest_component = remaining_interest
        else:
            original_total = loan.principal + loan.interest_amount
            interest_component = min(
                remaining_interest,
                (amount * loan.interest_amount + original_total - 1) // original_total,
            )
        loan.interest_paid += interest_component
        profile = credit_profile(game, player.user_id)
        score_change = 0
        if automatic:
            profile.on_time_payments += 1
            score_change += 5
        if paid_off and loan.scheduled_payments_made > 0:
            profile.successful_loans += 1
            score_change += 20
        profile.score = min(850, profile.score + score_change)
        self._append_event(
            game,
            "bank.loan_payment",
            {
                "loan_id": str(loan.id),
                "player_id": str(player.user_id),
                "amount": amount,
                "remaining_balance": loan.remaining_balance,
                "automatic": automatic,
                "paid_off": paid_off,
                "credit_score": profile.score,
                "score_change": score_change,
                "interest_component": interest_component,
            },
        )
        if interest_component:
            self._distribute_institution_revenue(
                game,
                "bank",
                interest_component,
                "loan_interest",
            )
        if paid_off and loan in game.bank.loans:
            game.bank.loans.remove(loan)

    def _validate_leveraged_purchase(
        self,
        game: GameState,
        player: PlayerState,
        gross: int,
        total: int,
    ) -> None:
        loan = next(
            (item for item in game.bank.loans if item.player_id == player.user_id),
            None,
        )
        if loan is None:
            return
        pack = self._pack(game)
        profile = credit_profile(game, player.user_id)
        if profile.score < 600:
            raise ConflictError("the credit score is too low for leveraged investing")
        required_reserve = (
            loan.installment_amount * pack.manifest.loan_investment_installment_reserve
            + pack.manifest.pass_start_salary
            * pack.manifest.loan_investment_reserve_salary_percent
            // 100
        )
        if player.balance - total < required_reserve:
            raise ConflictError(
                f"leveraged investing requires a cash reserve of {required_reserve}"
            )
        current_exposure = sum(
            item.current_price * item.holdings.get(player.user_id, 0)
            for item in game.bank.investments
        )
        current_exposure += sum(
            self._investment(game, order.instrument_id).current_price * order.remaining_quantity
            for order in game.bank.market_orders
            if order.player_id == player.user_id and order.side is MarketOrderSide.SELL
        )
        current_exposure += sum(
            order.limit_price * order.remaining_quantity
            for order in game.bank.market_orders
            if order.player_id == player.user_id and order.side is MarketOrderSide.BUY
        )
        exposure_limit = max(
            0,
            self._player_net_worth(game, player)
            * pack.manifest.loan_investment_max_net_worth_percent
            // 100,
        )
        if current_exposure + gross > exposure_limit:
            raise ConflictError(f"leveraged investment exposure cannot exceed {exposure_limit}")

    @staticmethod
    def _limit_buy_reserve(
        instrument: InvestmentInstrumentState,
        price: int,
        quantity: int,
    ) -> int:
        per_share_fee = (price * instrument.transaction_fee_percent + 99) // 100
        return quantity * (price + per_share_fee)

    def _place_limit_order(
        self,
        game: GameState,
        actor_id: UUID,
        command: PlaceLimitOrderCommand,
    ) -> None:
        player = self._active_player(game, actor_id)
        if not game.settings.rules.stock_market_enabled:
            raise ConflictError("the investment market is disabled for this game")
        instrument = self._investment(game, command.instrument_id)
        if any(
            order.player_id == actor_id
            and order.instrument_id == instrument.id
            and order.side is not command.side
            and (
                command.limit_price >= order.limit_price
                if command.side is MarketOrderSide.BUY
                else command.limit_price <= order.limit_price
            )
            for order in game.bank.market_orders
        ):
            raise ConflictError("an order cannot trade against the same player")
        if command.side is MarketOrderSide.BUY:
            maximum_holding = max(
                1,
                instrument.total_shares * instrument.max_ownership_percent // 100,
            )
            pending_buys = sum(
                order.remaining_quantity
                for order in game.bank.market_orders
                if order.player_id == actor_id
                and order.instrument_id == instrument.id
                and order.side is MarketOrderSide.BUY
            )
            reserved_sells = sum(
                order.remaining_quantity
                for order in game.bank.market_orders
                if order.player_id == actor_id
                and order.instrument_id == instrument.id
                and order.side is MarketOrderSide.SELL
            )
            if (
                instrument.holdings.get(actor_id, 0)
                + reserved_sells
                + pending_buys
                + command.quantity
                > maximum_holding
            ):
                raise ConflictError("the investment ownership limit would be exceeded")
            reserved_cash = self._limit_buy_reserve(
                instrument,
                command.limit_price,
                command.quantity,
            )
            if player.balance < reserved_cash:
                raise ConflictError("insufficient balance for the limit order")
            self._validate_leveraged_purchase(
                game,
                player,
                command.limit_price * command.quantity,
                reserved_cash,
            )
            player.balance -= reserved_cash
        else:
            current_holding = instrument.holdings.get(actor_id, 0)
            if current_holding < command.quantity:
                raise ConflictError("the player does not own enough shares")
            remaining = current_holding - command.quantity
            if remaining:
                instrument.holdings[actor_id] = remaining
            else:
                instrument.holdings.pop(actor_id, None)
            reserved_cash = 0
        order = MarketOrderState(
            instrument_id=instrument.id,
            player_id=actor_id,
            side=command.side,
            limit_price=command.limit_price,
            original_quantity=command.quantity,
            remaining_quantity=command.quantity,
            reserved_cash=reserved_cash,
            created_at_sequence=game.event_sequence + 1,
        )
        game.bank.market_orders.append(order)
        self._append_event(
            game,
            "investment.limit_order_placed",
            {
                "order_id": str(order.id),
                "instrument_id": instrument.id,
                "player_id": str(actor_id),
                "side": order.side.value,
                "quantity": order.original_quantity,
                "limit_price": order.limit_price,
            },
        )
        self._match_limit_orders(game, instrument)

    def _cancel_market_order(
        self,
        game: GameState,
        actor_id: UUID,
        order_id: UUID,
    ) -> None:
        order = next(
            (item for item in game.bank.market_orders if item.id == order_id),
            None,
        )
        if order is None:
            raise ConflictError("the market order does not exist")
        if order.player_id != actor_id:
            raise ForbiddenError("only the order owner can cancel it")
        instrument = self._investment(game, order.instrument_id)
        player = self._player(game, actor_id)
        if order.side is MarketOrderSide.BUY:
            player.balance += order.reserved_cash
        else:
            instrument.holdings[actor_id] = (
                instrument.holdings.get(actor_id, 0) + order.remaining_quantity
            )
        game.bank.market_orders.remove(order)
        self._append_event(
            game,
            "investment.limit_order_cancelled",
            {
                "order_id": str(order.id),
                "instrument_id": instrument.id,
                "player_id": str(actor_id),
                "side": order.side.value,
                "quantity": order.remaining_quantity,
            },
        )

    def _rebalance_buy_order_reserve(
        self,
        instrument: InvestmentInstrumentState,
        order: MarketOrderState,
        buyer: PlayerState,
    ) -> None:
        required = self._limit_buy_reserve(
            instrument,
            order.limit_price,
            order.remaining_quantity,
        )
        if order.reserved_cash < required:
            raise RuntimeError("market buy order reserve is inconsistent")
        refund = order.reserved_cash - required
        if refund:
            buyer.balance += refund
            order.reserved_cash = required

    def _match_limit_orders(
        self,
        game: GameState,
        instrument: InvestmentInstrumentState,
    ) -> None:
        total_fees = 0
        while True:
            buys = sorted(
                (
                    order
                    for order in game.bank.market_orders
                    if order.instrument_id == instrument.id and order.side is MarketOrderSide.BUY
                ),
                key=lambda order: (
                    -order.limit_price,
                    order.created_at_sequence,
                    str(order.id),
                ),
            )
            sells = sorted(
                (
                    order
                    for order in game.bank.market_orders
                    if order.instrument_id == instrument.id and order.side is MarketOrderSide.SELL
                ),
                key=lambda order: (
                    order.limit_price,
                    order.created_at_sequence,
                    str(order.id),
                ),
            )
            if not buys or not sells or buys[0].limit_price < sells[0].limit_price:
                break
            buy_order = buys[0]
            sell_order = sells[0]
            if buy_order.player_id == sell_order.player_id:
                raise RuntimeError("self-crossing market orders are inconsistent")
            maker = min(
                (buy_order, sell_order),
                key=lambda order: (order.created_at_sequence, str(order.id)),
            )
            price = maker.limit_price
            quantity = min(
                buy_order.remaining_quantity,
                sell_order.remaining_quantity,
            )
            gross = price * quantity
            buyer_fee = (gross * instrument.transaction_fee_percent + 99) // 100
            seller_fee = gross * instrument.transaction_fee_percent // 100
            buyer_cost = gross + buyer_fee
            if buyer_cost > buy_order.reserved_cash:
                raise RuntimeError("market buy order reserve is inconsistent")
            buyer = self._player(game, buy_order.player_id)
            seller = self._player(game, sell_order.player_id)
            buy_order.reserved_cash -= buyer_cost
            seller.balance += gross - seller_fee
            instrument.holdings[buyer.user_id] = (
                instrument.holdings.get(buyer.user_id, 0) + quantity
            )
            buy_order.remaining_quantity -= quantity
            sell_order.remaining_quantity -= quantity
            if buy_order.remaining_quantity:
                self._rebalance_buy_order_reserve(
                    instrument,
                    buy_order,
                    buyer,
                )
            else:
                buyer.balance += buy_order.reserved_cash
                game.bank.market_orders.remove(buy_order)
            if sell_order.remaining_quantity == 0:
                game.bank.market_orders.remove(sell_order)
            self._record_order_book_fill(
                game,
                instrument,
                buyer.user_id,
                seller.user_id,
                quantity,
                price,
                buy_order.id,
                sell_order.id,
                buyer_fee,
                seller_fee,
            )
            total_fees += buyer_fee + seller_fee
        if total_fees:
            self._distribute_institution_revenue(
                game,
                "bank",
                total_fees,
                "market_fee",
            )

    def _record_order_book_fill(
        self,
        game: GameState,
        instrument: InvestmentInstrumentState,
        buyer_id: UUID,
        seller_id: UUID,
        quantity: int,
        price: int,
        buy_order_id: UUID | None,
        sell_order_id: UUID | None,
        buyer_fee: int,
        seller_fee: int,
    ) -> None:
        instrument.current_price = (
            instrument.current_price if instrument.instrument_kind == "index" else price
        )
        instrument.buy_volume += quantity
        instrument.sell_volume += quantity
        instrument.trade_volume += quantity
        instrument.trade_count += 1
        instrument.last_trade_price = price
        instrument.session_high = max(instrument.session_high, price)
        instrument.session_low = min(instrument.session_low or price, price)
        refresh_market_index(game)
        self._append_event(
            game,
            "investment.order_filled",
            {
                "instrument_id": instrument.id,
                "buyer_id": str(buyer_id),
                "seller_id": str(seller_id),
                "quantity": quantity,
                "unit_price": price,
                "gross": price * quantity,
                "buyer_fee": buyer_fee,
                "seller_fee": seller_fee,
                "buy_order_id": str(buy_order_id) if buy_order_id else None,
                "sell_order_id": str(sell_order_id) if sell_order_id else None,
                "new_price": instrument.current_price,
            },
        )

    def _buy_shares(
        self,
        game: GameState,
        actor_id: UUID,
        command: BuySharesCommand,
    ) -> None:
        player = self._active_player(game, actor_id)
        if not game.settings.rules.stock_market_enabled:
            raise ConflictError("the investment market is disabled for this game")
        instrument = self._investment(game, command.instrument_id)
        current_holding = instrument.holdings.get(actor_id, 0)
        pending_buys = sum(
            order.remaining_quantity
            for order in game.bank.market_orders
            if order.player_id == actor_id
            and order.instrument_id == instrument.id
            and order.side is MarketOrderSide.BUY
        )
        reserved_sells = sum(
            order.remaining_quantity
            for order in game.bank.market_orders
            if order.player_id == actor_id
            and order.instrument_id == instrument.id
            and order.side is MarketOrderSide.SELL
        )
        maximum_holding = max(
            1,
            instrument.total_shares * instrument.max_ownership_percent // 100,
        )
        if current_holding + reserved_sells + pending_buys + command.quantity > maximum_holding:
            raise ConflictError("the investment ownership limit would be exceeded")
        sell_orders = sorted(
            (
                order
                for order in game.bank.market_orders
                if order.instrument_id == instrument.id
                and order.side is MarketOrderSide.SELL
                and order.player_id != actor_id
            ),
            key=lambda order: (
                order.limit_price,
                order.created_at_sequence,
                str(order.id),
            ),
        )
        sell_depth = sum(order.remaining_quantity for order in sell_orders)
        if instrument.available_shares + sell_depth < command.quantity:
            raise ConflictError("there are not enough shares available")
        remaining = command.quantity
        fills: list[tuple[MarketOrderState, int, int, int, int]] = []
        gross = 0
        fee = 0
        for order in sell_orders:
            if remaining == 0:
                break
            quantity = min(remaining, order.remaining_quantity)
            fill_gross = order.limit_price * quantity
            buyer_fee = (fill_gross * instrument.transaction_fee_percent + 99) // 100
            seller_fee = fill_gross * instrument.transaction_fee_percent // 100
            fills.append((order, quantity, fill_gross, buyer_fee, seller_fee))
            gross += fill_gross
            fee += buyer_fee
            remaining -= quantity
        bank_quote = (
            market_order_quote(
                instrument,
                remaining,
                buying=True,
                opposite_order_depth=sell_depth,
            )
            if remaining
            else None
        )
        if bank_quote is not None:
            bank_fee = (bank_quote.gross * instrument.transaction_fee_percent + 99) // 100
            gross += bank_quote.gross
            fee += bank_fee
        total = gross + fee
        if player.balance < total:
            raise ConflictError("insufficient balance")
        self._validate_leveraged_purchase(game, player, gross, total)
        player.balance -= total
        previous_price = instrument.current_price
        total_fees = 0
        acquired = 0
        for order, quantity, fill_gross, buyer_fee, seller_fee in fills:
            seller = self._player(game, order.player_id)
            seller.balance += fill_gross - seller_fee
            order.remaining_quantity -= quantity
            acquired += quantity
            total_fees += buyer_fee + seller_fee
            instrument.holdings[actor_id] = instrument.holdings.get(actor_id, 0) + quantity
            if order.remaining_quantity == 0:
                game.bank.market_orders.remove(order)
            self._record_order_book_fill(
                game,
                instrument,
                actor_id,
                seller.user_id,
                quantity,
                order.limit_price,
                None,
                order.id,
                buyer_fee,
                seller_fee,
            )
        if bank_quote is not None:
            instrument.available_shares -= remaining
            instrument.holdings[actor_id] = instrument.holdings.get(actor_id, 0) + remaining
            instrument.current_price = bank_quote.new_price
            instrument.buy_volume += remaining
            instrument.trade_volume += remaining
            instrument.trade_count += 1
            instrument.last_trade_price = bank_quote.average_price
            instrument.session_high = max(
                instrument.session_high,
                bank_quote.average_price,
                bank_quote.new_price,
            )
            instrument.session_low = min(
                instrument.session_low or bank_quote.average_price,
                bank_quote.average_price,
                bank_quote.new_price,
            )
            acquired += remaining
            total_fees += bank_fee
        if acquired != command.quantity:
            raise RuntimeError("market buy did not settle the requested quantity")
        refresh_market_index(game)
        self._append_event(
            game,
            "investment.shares_bought",
            {
                "instrument_id": instrument.id,
                "instrument_kind": instrument.instrument_kind,
                "tile_id": instrument.tile_id,
                "player_id": str(actor_id),
                "quantity": command.quantity,
                "unit_price": gross // command.quantity,
                "mid_price": previous_price,
                "gross": gross,
                "fee": fee,
                "new_price": instrument.current_price,
                "book_quantity": command.quantity - remaining,
                "bank_quantity": remaining,
            },
        )
        if total_fees:
            self._distribute_institution_revenue(
                game,
                "bank",
                total_fees,
                "market_fee",
            )

    def _sell_shares(
        self,
        game: GameState,
        actor_id: UUID,
        command: SellSharesCommand,
    ) -> None:
        player = self._active_player(game, actor_id)
        if not game.settings.rules.stock_market_enabled:
            raise ConflictError("the investment market is disabled for this game")
        instrument = self._investment(game, command.instrument_id)
        current_holding = instrument.holdings.get(actor_id, 0)
        if current_holding < command.quantity:
            raise ConflictError("the player does not own enough shares")
        buy_orders = sorted(
            (
                order
                for order in game.bank.market_orders
                if order.instrument_id == instrument.id
                and order.side is MarketOrderSide.BUY
                and order.player_id != actor_id
            ),
            key=lambda order: (
                -order.limit_price,
                order.created_at_sequence,
                str(order.id),
            ),
        )
        buy_depth = sum(order.remaining_quantity for order in buy_orders)
        remaining_to_sell = command.quantity
        fills: list[tuple[MarketOrderState, int, int, int, int]] = []
        gross = 0
        fee = 0
        for order in buy_orders:
            if remaining_to_sell == 0:
                break
            quantity = min(remaining_to_sell, order.remaining_quantity)
            fill_gross = order.limit_price * quantity
            buyer_fee = (fill_gross * instrument.transaction_fee_percent + 99) // 100
            seller_fee = fill_gross * instrument.transaction_fee_percent // 100
            fills.append((order, quantity, fill_gross, buyer_fee, seller_fee))
            gross += fill_gross
            fee += seller_fee
            remaining_to_sell -= quantity
        bank_quote = (
            market_order_quote(
                instrument,
                remaining_to_sell,
                buying=False,
                opposite_order_depth=buy_depth,
            )
            if remaining_to_sell
            else None
        )
        if bank_quote is not None:
            bank_fee = bank_quote.gross * instrument.transaction_fee_percent // 100
            bank_proceeds = bank_quote.gross - bank_fee
            if available_bank_cash(game) - bank_proceeds < minimum_reserve(game):
                raise ConflictError("the bank reserve is too low to repurchase shares")
            gross += bank_quote.gross
            fee += bank_fee
        owned_remaining = current_holding - command.quantity
        if owned_remaining:
            instrument.holdings[actor_id] = owned_remaining
        else:
            instrument.holdings.pop(actor_id, None)
        previous_price = instrument.current_price
        proceeds = 0
        total_fees = 0
        for order, quantity, fill_gross, buyer_fee, seller_fee in fills:
            buyer = self._player(game, order.player_id)
            buyer_cost = fill_gross + buyer_fee
            if buyer_cost > order.reserved_cash:
                raise RuntimeError("market buy order reserve is inconsistent")
            order.reserved_cash -= buyer_cost
            order.remaining_quantity -= quantity
            instrument.holdings[buyer.user_id] = (
                instrument.holdings.get(buyer.user_id, 0) + quantity
            )
            proceeds += fill_gross - seller_fee
            total_fees += buyer_fee + seller_fee
            if order.remaining_quantity:
                self._rebalance_buy_order_reserve(instrument, order, buyer)
            else:
                buyer.balance += order.reserved_cash
                game.bank.market_orders.remove(order)
            self._record_order_book_fill(
                game,
                instrument,
                buyer.user_id,
                actor_id,
                quantity,
                order.limit_price,
                order.id,
                None,
                buyer_fee,
                seller_fee,
            )
        if bank_quote is not None:
            instrument.available_shares += remaining_to_sell
            instrument.current_price = bank_quote.new_price
            instrument.sell_volume += remaining_to_sell
            instrument.trade_volume += remaining_to_sell
            instrument.trade_count += 1
            instrument.last_trade_price = bank_quote.average_price
            instrument.session_high = max(
                instrument.session_high,
                bank_quote.average_price,
                bank_quote.new_price,
            )
            instrument.session_low = min(
                instrument.session_low or bank_quote.average_price,
                bank_quote.average_price,
                bank_quote.new_price,
            )
            proceeds += bank_proceeds
            total_fees += bank_fee
        player.balance += proceeds
        refresh_market_index(game)
        self._append_event(
            game,
            "investment.shares_sold",
            {
                "instrument_id": instrument.id,
                "instrument_kind": instrument.instrument_kind,
                "tile_id": instrument.tile_id,
                "player_id": str(actor_id),
                "quantity": command.quantity,
                "unit_price": gross // command.quantity,
                "mid_price": previous_price,
                "gross": gross,
                "fee": fee,
                "proceeds": proceeds,
                "new_price": instrument.current_price,
                "book_quantity": command.quantity - remaining_to_sell,
                "bank_quantity": remaining_to_sell,
            },
        )
        if total_fees:
            self._distribute_institution_revenue(
                game,
                "bank",
                total_fees,
                "market_fee",
            )

    @staticmethod
    def _investment(
        game: GameState,
        instrument_id: str,
    ) -> InvestmentInstrumentState:
        instrument = next(
            (item for item in game.bank.investments if item.id == instrument_id),
            None,
        )
        if instrument is None:
            raise ConflictError("the investment instrument does not exist")
        return instrument

    @staticmethod
    def _rent_plan(game: GameState, plan_id: UUID) -> RentDebtPlanState:
        plan = next((item for item in game.rent_debt_plans if item.id == plan_id), None)
        if plan is None:
            raise ConflictError("the rent debt plan does not exist")
        return plan

    @staticmethod
    def _rent_installment_amount(plan: RentDebtPlanState) -> int:
        return (
            plan.remaining_amount + plan.installments_remaining - 1
        ) // plan.installments_remaining

    def _rent_debt_settlement_amount(
        self,
        game: GameState,
        debt: DebtState,
    ) -> int:
        if debt.installment_plan_id is None:
            return debt.amount
        return self._rent_plan(game, debt.installment_plan_id).remaining_amount

    def _require_custom_rent_debt(self, game: GameState) -> DebtState:
        debt = game.active_debt
        if not game.settings.rules.custom_rent_debts_enabled:
            raise ConflictError("custom rent debts are disabled for this game")
        if (
            debt is None
            or debt.creditor_id is None
            or debt.reason
            not in {
                DebtReason.RENT,
                DebtReason.RENT_INSTALLMENT,
            }
        ):
            raise ConflictError("the outstanding debt is not a player rent debt")
        return debt

    @staticmethod
    def _rent_debt_waits_for_creditor(game: GameState) -> bool:
        debt = game.active_debt
        return bool(
            game.settings.rules.custom_rent_debts_enabled
            and debt is not None
            and debt.creditor_id is not None
            and debt.reason in {DebtReason.RENT, DebtReason.RENT_INSTALLMENT}
            and not debt.collection_demanded
        )

    def _demand_rent_debt(self, game: GameState, actor_id: UUID) -> None:
        debt = self._require_custom_rent_debt(game)
        if debt.creditor_id != actor_id:
            raise ForbiddenError("only the rent creditor can demand payment")
        if debt.collection_demanded:
            raise ConflictError("the rent debt has already been demanded")
        debt.collection_demanded = True
        debt.plan_proposal = None
        self._append_event(
            game,
            "debt.collection_demanded",
            {
                "debtor_id": str(debt.debtor_id),
                "creditor_id": str(actor_id),
                "amount": debt.amount,
                "tile_id": debt.tile_id,
                "reason": debt.reason.value,
            },
        )

    def _forgive_rent_debt(self, game: GameState, actor_id: UUID) -> None:
        debt = self._require_custom_rent_debt(game)
        if debt.creditor_id != actor_id:
            raise ForbiddenError("only the rent creditor can forgive the debt")
        if debt.reason is DebtReason.RENT and debt.collection_demanded:
            raise ConflictError("payment has already been demanded")
        forgiven_amount = debt.amount
        plan_id = debt.installment_plan_id
        if plan_id is not None:
            plan = self._rent_plan(game, plan_id)
            forgiven_amount = plan.remaining_amount
            game.rent_debt_plans.remove(plan)
        game.active_debt = None
        self._append_event(
            game,
            "debt.forgiven",
            {
                "debtor_id": str(debt.debtor_id),
                "creditor_id": str(actor_id),
                "amount": forgiven_amount,
                "tile_id": debt.tile_id,
                "installment_plan_id": str(plan_id) if plan_id else None,
            },
        )
        self._process_card_payments(game)

    def _propose_rent_debt_plan(
        self,
        game: GameState,
        actor_id: UUID,
        command: ProposeRentDebtPlanCommand,
    ) -> None:
        debt = self._require_custom_rent_debt(game)
        if debt.creditor_id != actor_id:
            raise ForbiddenError("only the rent creditor can propose payment terms")
        if debt.reason is DebtReason.RENT and debt.collection_demanded:
            raise ConflictError("payment has already been demanded")
        settlement_amount = self._rent_debt_settlement_amount(game, debt)
        self._validate_trade_assets(
            game,
            proposer_id=actor_id,
            recipient_id=debt.debtor_id,
            offered_cash=0,
            requested_cash=0,
            offered_property_ids=[],
            requested_property_ids=command.requested_property_ids,
            require_trade_availability=False,
        )
        debt.plan_proposal = RentDebtPlanProposal(
            installments=command.installments,
            interest_percent=command.interest_percent,
            template=command.template,
            requested_property_ids=command.requested_property_ids,
        )
        debt.collection_demanded = False
        total_amount = (
            (settlement_amount * (100 + command.interest_percent) + 99) // 100
            if command.installments
            else 0
        )
        self._append_event(
            game,
            "debt.plan_proposed",
            {
                "debtor_id": str(debt.debtor_id),
                "creditor_id": str(actor_id),
                "original_amount": settlement_amount,
                "total_amount": total_amount,
                "installments": command.installments,
                "interest_percent": command.interest_percent,
                "template": command.template.value,
                "requested_property_ids": command.requested_property_ids,
                "tile_id": debt.tile_id,
            },
        )

    def _accept_rent_debt_plan(self, game: GameState, actor_id: UUID) -> None:
        debt = self._require_custom_rent_debt(game)
        if debt.debtor_id != actor_id:
            raise ForbiddenError("only the debtor can accept the payment plan")
        proposal = debt.plan_proposal
        if proposal is None:
            raise ConflictError("there is no payment plan to accept")
        assert debt.creditor_id is not None
        replaced_plan = (
            self._rent_plan(game, debt.installment_plan_id)
            if debt.installment_plan_id is not None
            else None
        )
        settlement_amount = (
            replaced_plan.remaining_amount if replaced_plan is not None else debt.amount
        )
        self._validate_trade_assets(
            game,
            proposer_id=debt.creditor_id,
            recipient_id=debt.debtor_id,
            offered_cash=0,
            requested_cash=0,
            offered_property_ids=[],
            requested_property_ids=proposal.requested_property_ids,
            require_trade_availability=False,
        )
        for property_id in proposal.requested_property_ids:
            game.owners[property_id] = debt.creditor_id
        self._protect_acquired_properties(game, proposal.requested_property_ids)
        if replaced_plan is not None:
            game.rent_debt_plans.remove(replaced_plan)
        total_amount = (
            (settlement_amount * (100 + proposal.interest_percent) + 99) // 100
            if proposal.installments
            else 0
        )
        plan = None
        if proposal.installments:
            plan = RentDebtPlanState(
                debtor_id=debt.debtor_id,
                creditor_id=debt.creditor_id,
                tile_id=debt.tile_id,
                original_amount=settlement_amount,
                interest_percent=proposal.interest_percent,
                total_amount=total_amount,
                remaining_amount=total_amount,
                installments_total=proposal.installments,
                installments_remaining=proposal.installments,
                template=proposal.template,
                created_at_sequence=game.event_sequence + 1,
            )
            game.rent_debt_plans.append(plan)
        game.active_debt = None
        self._append_event(
            game,
            "debt.plan_accepted",
            {
                "plan_id": str(plan.id) if plan else None,
                "replaced_plan_id": (str(replaced_plan.id) if replaced_plan is not None else None),
                "debtor_id": str(debt.debtor_id),
                "creditor_id": str(debt.creditor_id),
                "original_amount": settlement_amount,
                "total_amount": total_amount,
                "installments": proposal.installments,
                "interest_percent": proposal.interest_percent,
                "template": proposal.template.value,
                "requested_property_ids": proposal.requested_property_ids,
                "tile_id": debt.tile_id,
            },
        )
        self._process_card_payments(game)

    def _reject_rent_debt_plan(self, game: GameState, actor_id: UUID) -> None:
        debt = self._require_custom_rent_debt(game)
        if debt.debtor_id != actor_id:
            raise ForbiddenError("only the debtor can reject the payment plan")
        if debt.plan_proposal is None:
            raise ConflictError("there is no payment plan to reject")
        debt.plan_proposal = None
        self._append_event(
            game,
            "debt.plan_rejected",
            {
                "debtor_id": str(debt.debtor_id),
                "creditor_id": str(debt.creditor_id),
                "tile_id": debt.tile_id,
            },
        )

    def _record_rent_installment_payment(
        self,
        game: GameState,
        plan: RentDebtPlanState,
        amount: int,
    ) -> None:
        plan.remaining_amount -= amount
        plan.installments_remaining -= 1
        self._append_event(
            game,
            "debt.installment_paid",
            {
                "plan_id": str(plan.id),
                "debtor_id": str(plan.debtor_id),
                "creditor_id": str(plan.creditor_id),
                "amount": amount,
                "remaining_amount": plan.remaining_amount,
                "installments_remaining": plan.installments_remaining,
                "tile_id": plan.tile_id,
            },
        )
        if plan.remaining_amount == 0:
            game.rent_debt_plans.remove(plan)
            self._append_event(
                game,
                "debt.plan_completed",
                {
                    "plan_id": str(plan.id),
                    "debtor_id": str(plan.debtor_id),
                    "creditor_id": str(plan.creditor_id),
                    "total_amount": plan.total_amount,
                    "tile_id": plan.tile_id,
                },
            )

    def _collect_rent_installments(
        self,
        game: GameState,
        player: PlayerState,
    ) -> None:
        for plan in list(game.rent_debt_plans):
            if plan.debtor_id != player.user_id:
                continue
            amount = self._rent_installment_amount(plan)
            if player.balance < amount:
                game.active_debt = DebtState(
                    debtor_id=player.user_id,
                    creditor_id=plan.creditor_id,
                    amount=amount,
                    reason=plan.reason,
                    tile_id=plan.tile_id,
                    installment_plan_id=plan.id,
                    collection_demanded=plan.reason is DebtReason.PLAYER_LOAN,
                )
                self._append_event(
                    game,
                    "debt.created",
                    {
                        "debtor_id": str(player.user_id),
                        "creditor_id": str(plan.creditor_id),
                        "amount": amount,
                        "reason": plan.reason.value,
                        "tile_id": plan.tile_id,
                        "installment_plan_id": str(plan.id),
                    },
                )
                return
            player.balance -= amount
            self._pay_installment_creditor(game, plan, amount)
            self._record_rent_installment_payment(game, plan, amount)

    def _pay_rent_debt_plan(
        self,
        game: GameState,
        actor_id: UUID,
        command: PayRentDebtPlanCommand,
    ) -> None:
        plan = self._rent_plan(game, command.plan_id)
        if plan.debtor_id != actor_id:
            raise ForbiddenError("only the debtor can pay this rent debt plan")
        player = self._active_player(game, actor_id)
        amount = (
            plan.remaining_amount
            if command.payment_kind == "full"
            else self._rent_installment_amount(plan)
        )
        if player.balance < amount:
            raise ConflictError("insufficient balance")
        player.balance -= amount
        self._pay_installment_creditor(game, plan, amount)
        self._record_rent_installment_payment(game, plan, amount)

    def _pay_installment_creditor(
        self,
        game: GameState,
        plan: RentDebtPlanState,
        amount: int,
    ) -> None:
        if plan.reason is DebtReason.PLAYER_LOAN:
            self._player(game, plan.creditor_id).balance += amount
            return
        self._distribute_investment_rent(
            game,
            plan.creditor_id,
            amount,
            plan.tile_id,
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
            if debt.reason in {DebtReason.RENT, DebtReason.RENT_INSTALLMENT}:
                self._distribute_investment_rent(
                    game,
                    debt.creditor_id,
                    debt.amount,
                    debt.tile_id,
                )
            else:
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
                "tile_id": debt.tile_id,
            },
        )
        game.active_debt = None
        if debt.installment_plan_id is not None:
            plan = self._rent_plan(game, debt.installment_plan_id)
            self._record_rent_installment_payment(game, plan, debt.amount)
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
        board_order = {tile.id: index for index, tile in enumerate(pack.board.tiles)}
        owned_property_ids = sorted(
            (property_id for property_id, owner_id in game.owners.items() if owner_id == actor_id),
            key=lambda item: board_order[item],
        )
        building_liquidation = sum(
            indexed_amount(
                game,
                (self._tile(game, property_id).build_cost or 0)
                * game.building_levels.get(property_id, 0),
            )
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
        player.balance += building_liquidation
        player_order_ids = [
            order.id for order in game.bank.market_orders if order.player_id == actor_id
        ]
        for order_id in player_order_ids:
            self._cancel_market_order(game, actor_id, order_id)
        investment_liquidation = 0
        for instrument in game.bank.investments:
            shares = instrument.holdings.pop(actor_id, 0)
            if shares <= 0:
                continue
            instrument.available_shares += shares
            gross = instrument.current_price * shares
            fee = gross * instrument.transaction_fee_percent // 100
            investment_liquidation += gross - fee
        player.balance += investment_liquidation
        if investment_liquidation:
            self._append_event(
                game,
                "investment.position_liquidated",
                {
                    "player_id": str(actor_id),
                    "amount": investment_liquidation,
                },
            )
        property_liquidation = sum(
            indexed_amount(
                game,
                self._tile(game, property_id).mortgage_value or 0,
            )
            for property_id in owned_property_ids
            if property_id not in game.mortgaged_property_ids
        )
        player.balance += property_liquidation
        for property_id in owned_property_ids:
            game.owners.pop(property_id, None)
            if property_id in game.mortgaged_property_ids:
                game.mortgaged_property_ids.remove(property_id)
            game.bank_auction_queue.append(property_id)
            game.bank_auction_excluded_player_ids[property_id] = actor_id
            game.building_levels.pop(property_id, None)
        owned_property_id_set = set(owned_property_ids)
        game.trade_unavailable_property_ids = [
            property_id
            for property_id in game.trade_unavailable_property_ids
            if property_id not in owned_property_id_set
        ]

        transferred_amount = min(player.balance, debt.amount)
        player.balance -= transferred_amount
        if transferred_amount:
            if debt.creditor_id is None:
                self._deposit_bank_pot(game, transferred_amount, debt.reason)
            elif debt.reason in {DebtReason.RENT, DebtReason.RENT_INSTALLMENT}:
                self._distribute_investment_rent(
                    game,
                    debt.creditor_id,
                    transferred_amount,
                    debt.tile_id,
                )
            else:
                self._active_player(game, debt.creditor_id).balance += transferred_amount

        liquidation_data = {
            "liquidated_building_amount": building_liquidation,
            "liquidated_investment_amount": investment_liquidation,
            "liquidated_property_amount": property_liquidation,
            "property_ids": owned_property_ids,
        }
        debt_fully_paid = transferred_amount == debt.amount
        if debt_fully_paid and not forced:
            game.active_debt = None
            self._append_event(
                game,
                "debt.paid",
                {
                    "debtor_id": str(actor_id),
                    "creditor_id": str(debt.creditor_id) if debt.creditor_id else None,
                    "amount": transferred_amount,
                    "tile_id": debt.tile_id,
                    "reason": debt.reason.value,
                    "liquidation": True,
                    **liquidation_data,
                },
            )
            if debt.installment_plan_id is not None:
                plan = self._rent_plan(game, debt.installment_plan_id)
                self._record_rent_installment_payment(game, plan, debt.amount)
            self._start_next_bank_auction(game)
            if game.active_auction is None:
                self._process_card_payments(game)
            return

        for instrument in game.bank.investments:
            instrument.pending_dividend_units.pop(actor_id, None)
        player.pending_dividend_units = 0
        total_pending_dividend_units = sum(
            sum(instrument.pending_dividend_units.values()) for instrument in game.bank.investments
        )
        game.bank.dividend_cash_reserve = total_pending_dividend_units // DIVIDEND_SCALE
        game.bank.dividend_unfunded_units = total_pending_dividend_units % DIVIDEND_SCALE
        loan = next(
            (item for item in game.bank.loans if item.player_id == actor_id),
            None,
        )
        if loan is not None:
            game.bank.loans.remove(loan)
            profile = credit_profile(game, actor_id)
            profile.defaults += 1
            profile.score = max(300, profile.score - 150)
            self._append_event(
                game,
                "bank.loan_defaulted",
                {
                    "loan_id": str(loan.id),
                    "player_id": str(actor_id),
                    "remaining_balance": loan.remaining_balance,
                    "credit_score": profile.score,
                    "score_change": -150,
                },
            )
        player.balance = 0
        player.bankrupt = True
        operating_default = sum(
            item.remaining_amount
            for item in game.economy.operating_debts
            if item.player_id == actor_id
        )
        game.economy.operating_debts = [
            item for item in game.economy.operating_debts if item.player_id != actor_id
        ]
        game.pending_card_payments = [
            payment
            for payment in game.pending_card_payments
            if actor_id not in {payment.payer_id, payment.recipient_id}
        ]
        cancelled_trade_ids = []
        for trade in game.trades:
            if trade.status is TradeStatus.PENDING and actor_id in {
                trade.proposer_id,
                trade.recipient_id,
            }:
                trade.status = TradeStatus.CANCELLED
                trade.resolved_at = datetime.now(UTC)
                cancelled_trade_ids.append(str(trade.id))
        cancelled_plan_ids = []
        for plan in list(game.rent_debt_plans):
            if actor_id not in {plan.debtor_id, plan.creditor_id}:
                continue
            game.rent_debt_plans.remove(plan)
            cancelled_plan_ids.append(str(plan.id))
            self._append_event(
                game,
                "debt.plan_cancelled",
                {
                    "plan_id": str(plan.id),
                    "debtor_id": str(plan.debtor_id),
                    "creditor_id": str(plan.creditor_id),
                    "remaining_amount": plan.remaining_amount,
                    "reason": "bankruptcy",
                },
            )
        game.active_debt = None
        self._append_event(
            game,
            "player.bankrupt",
            {
                "player_id": str(actor_id),
                "creditor_id": str(debt.creditor_id) if debt.creditor_id else None,
                "transferred_amount": transferred_amount,
                "unpaid_amount": max(0, debt.amount - transferred_amount),
                **liquidation_data,
                "cancelled_trade_ids": cancelled_trade_ids,
                "cancelled_plan_ids": cancelled_plan_ids,
                "reason": debt.reason.value,
                "operating_debt_defaulted": operating_default,
            },
        )
        active_players = [candidate for candidate in game.players if not candidate.bankrupt]
        if len(active_players) == 1:
            game.status = GameStatus.FINISHED
            self._refund_all_auction_deposits(game, reason="game_finished")
            game.active_auction = None
            game.bank_auction_queue.clear()
            game.bank_auction_excluded_player_ids.clear()
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
        property_id = game.pending_tile_id
        game.pending_tile_id = None
        game.pending_purchase_discount_percent = 0
        game.phase = TurnPhase.WAITING_FOR_END
        self._start_auction_for_property(game, property_id, minimum_bid=1)

    def _request_auction_selection(
        self,
        game: GameState,
        player: PlayerState,
        *,
        minimum_bid: int,
    ) -> None:
        pack = self._pack(game)
        has_unowned_property = any(
            tile.is_purchasable and tile.id not in game.owners for tile in pack.board.tiles
        )
        if not has_unowned_property:
            return
        game.pending_auction_selector_id = player.user_id
        game.pending_auction_minimum_bid = minimum_bid
        game.phase = TurnPhase.WAITING_FOR_END

    def _select_auction_property(
        self,
        game: GameState,
        actor_id: UUID,
        property_id: str,
    ) -> None:
        if game.pending_auction_selector_id != actor_id:
            raise ConflictError("the player cannot select this auction property")
        tile = self._tile(game, property_id)
        if not tile.is_purchasable or property_id in game.owners:
            raise ConflictError("the selected property is unavailable for auction")
        minimum_bid = game.pending_auction_minimum_bid or 1
        game.pending_auction_selector_id = None
        game.pending_auction_minimum_bid = None
        self._start_auction_for_property(
            game,
            property_id,
            minimum_bid=minimum_bid,
            source="tile",
        )

    def _offer_property_auction(
        self,
        game: GameState,
        actor_id: UUID,
        command: OfferPropertyAuctionCommand,
    ) -> None:
        if game.active_auction is not None:
            raise ConflictError("another auction is already active")
        tile = self._owned_tile(game, actor_id, command.property_id)
        if tile.id in game.mortgaged_property_ids:
            raise ConflictError("mortgaged properties cannot be auctioned")
        if tile.id in game.trade_unavailable_property_ids:
            raise ConflictError("the property is temporarily unavailable")
        eligible_player_ids = [
            player.user_id
            for player in game.players
            if not player.bankrupt and player.user_id != actor_id
        ]
        if not eligible_player_ids:
            raise ConflictError("the auction requires at least one other active player")
        minimum_bid, deposit_amount = self._auction_terms(
            game,
            tile.id,
            requested_minimum_bid=command.minimum_bid,
        )
        game.trade_unavailable_property_ids.append(tile.id)
        game.active_auction = AuctionState(
            id=uuid4(),
            property_id=tile.id,
            bid_deadline=self._clock() + AUCTION_READY_WINDOW,
            minimum_bid=minimum_bid,
            deposit_amount=deposit_amount,
            eligible_player_ids=eligible_player_ids,
            seller_id=actor_id,
        )
        self._append_event(
            game,
            "auction.started",
            {
                "auction_id": str(game.active_auction.id),
                "property_id": tile.id,
                "readiness_deadline": game.active_auction.bid_deadline.isoformat(),
                "minimum_bid": minimum_bid,
                "deposit_amount": deposit_amount,
                "eligible_player_ids": [str(item) for item in eligible_player_ids],
                "source": "voluntary_sale",
                "seller_id": str(actor_id),
            },
        )

    def _start_auction_for_property(
        self,
        game: GameState,
        property_id: str,
        *,
        minimum_bid: int,
        source: str | None = None,
    ) -> None:
        minimum_bid, deposit_amount = self._auction_terms(
            game,
            property_id,
            requested_minimum_bid=minimum_bid,
        )
        eligible_player_ids = [player.user_id for player in game.players if not player.bankrupt]
        if len(eligible_player_ids) < 2:
            raise ConflictError("at least two active players are required for an auction")
        game.active_auction = AuctionState(
            id=uuid4(),
            property_id=property_id,
            bid_deadline=self._clock() + AUCTION_READY_WINDOW,
            minimum_bid=minimum_bid,
            deposit_amount=deposit_amount,
            eligible_player_ids=eligible_player_ids,
        )
        self._append_event(
            game,
            "auction.started",
            {
                "auction_id": str(game.active_auction.id),
                "property_id": property_id,
                "readiness_deadline": game.active_auction.bid_deadline.isoformat(),
                "minimum_bid": minimum_bid,
                "deposit_amount": deposit_amount,
                "eligible_player_ids": [str(player_id) for player_id in eligible_player_ids],
                **({"source": source} if source is not None else {}),
            },
        )

    def _start_next_bank_auction(self, game: GameState) -> None:
        if game.active_auction is not None or not game.bank_auction_queue:
            return
        property_id = game.bank_auction_queue.pop(0)
        excluded_player_id = self._bank_auction_excluded_player_id(
            game,
            property_id,
        )
        eligible_player_ids = [
            player.user_id
            for player in game.players
            if not player.bankrupt and player.user_id != excluded_player_id
        ]
        if not eligible_player_ids:
            self._start_next_bank_auction(game)
            return
        minimum_bid, deposit_amount = self._auction_terms(
            game,
            property_id,
            requested_minimum_bid=1,
        )
        game.active_auction = AuctionState(
            id=uuid4(),
            property_id=property_id,
            bid_deadline=self._clock() + AUCTION_READY_WINDOW,
            minimum_bid=minimum_bid,
            deposit_amount=deposit_amount,
            eligible_player_ids=eligible_player_ids,
        )
        self._append_event(
            game,
            "auction.started",
            {
                "auction_id": str(game.active_auction.id),
                "property_id": property_id,
                "readiness_deadline": game.active_auction.bid_deadline.isoformat(),
                "minimum_bid": minimum_bid,
                "deposit_amount": deposit_amount,
                "eligible_player_ids": [str(player_id) for player_id in eligible_player_ids],
                "source": "bankruptcy",
                "excluded_player_id": (
                    str(excluded_player_id) if excluded_player_id is not None else None
                ),
            },
        )

    @staticmethod
    def _bank_auction_excluded_player_id(
        game: GameState,
        property_id: str,
    ) -> UUID | None:
        excluded_player_id = game.bank_auction_excluded_player_ids.pop(
            property_id,
            None,
        )
        if excluded_player_id is not None:
            return excluded_player_id
        for event in reversed(game.events):
            property_ids = event.data.get("property_ids")
            if (
                event.type not in {"debt.paid", "player.bankrupt"}
                or not isinstance(property_ids, list)
                or property_id not in property_ids
            ):
                continue
            debtor_id = event.data.get("debtor_id") or event.data.get("player_id")
            if isinstance(debtor_id, str):
                return UUID(debtor_id)
        return None

    @staticmethod
    def _require_matching_auction(
        game: GameState,
        auction_id: UUID | None,
    ) -> AuctionState:
        auction = game.active_auction
        if auction is None:
            raise ConflictError("there is no active auction")
        if auction_id is not None and auction.id != auction_id:
            raise ConflictError("the auction changed before the command ran")
        return auction

    def _ready_auction(
        self,
        game: GameState,
        actor_id: UUID,
        command: ReadyAuctionCommand,
    ) -> None:
        auction = self._require_matching_auction(game, command.auction_id)
        if actor_id not in auction.eligible_player_ids:
            raise ConflictError("the player cannot participate in this auction")
        if actor_id in auction.ready_player_ids:
            return
        if auction.phase != "idle":
            raise ConflictError("the auction bidding has already started")
        if actor_id in auction.passed_player_ids:
            raise ConflictError("the player already declined this auction")
        auction.ready_player_ids.append(actor_id)
        self._append_event(
            game,
            "auction.player_ready",
            {
                "auction_id": str(auction.id),
                "property_id": auction.property_id,
                "player_id": str(actor_id),
            },
        )
        self._start_auction_bidding_if_ready(game)

    def _start_auction_bidding_if_ready(self, game: GameState) -> None:
        auction = game.active_auction
        if auction is None or auction.phase != "idle":
            return
        responded = set(auction.ready_player_ids) | set(auction.passed_player_ids)
        if any(player_id not in responded for player_id in auction.eligible_player_ids):
            return
        if not auction.ready_player_ids:
            self._complete_auction(game)
            return
        auction.phase = "bidding"
        auction.bid_deadline = self._clock() + AUCTION_BID_WINDOW
        self._append_event(
            game,
            "auction.bidding_started",
            {
                "auction_id": str(auction.id),
                "property_id": auction.property_id,
                "participant_ids": [str(player_id) for player_id in auction.ready_player_ids],
                "bid_deadline": auction.bid_deadline.isoformat(),
            },
        )

    def _bid(
        self,
        game: GameState,
        actor_id: UUID,
        command: BidCommand,
    ) -> None:
        auction = self._require_matching_auction(game, command.auction_id)
        amount = command.amount
        if actor_id not in auction.eligible_player_ids:
            raise ConflictError("the player cannot participate in this auction")
        if auction.phase != "bidding":
            raise ConflictError("the auction is waiting for player readiness")
        if auction.bid_deadline is not None and auction.bid_deadline <= self._clock():
            raise ConflictError("the auction bidding window has expired")
        if actor_id not in auction.ready_player_ids:
            raise ConflictError("the player did not join the bidding")
        if actor_id in auction.passed_player_ids:
            raise ConflictError("the player already passed")
        if actor_id == auction.current_bidder_id:
            if amount == auction.current_bid:
                return
            raise ConflictError("the highest bidder must wait for another offer")
        if amount <= auction.current_bid:
            raise ConflictError("the bid must be higher than the current bid")
        if amount < auction.minimum_bid:
            raise ConflictError("the bid is below the auction minimum")
        player = self._player(game, actor_id)
        held_deposit = auction.deposits.get(actor_id, 0)
        required_cash = (
            max(amount, auction.deposit_amount) if held_deposit == 0 else amount - held_deposit
        )
        if player.balance < required_cash:
            raise ConflictError("insufficient balance")
        if held_deposit == 0 and auction.deposit_amount > 0:
            player.balance -= auction.deposit_amount
            held_deposit = auction.deposit_amount
            auction.deposits[actor_id] = held_deposit
            self._append_event(
                game,
                "auction.deposit_placed",
                {
                    "property_id": auction.property_id,
                    "player_id": str(actor_id),
                    "amount": held_deposit,
                },
            )
        auction.current_bid = amount
        auction.current_bidder_id = actor_id
        auction.bid_deadline = self._clock() + AUCTION_BID_WINDOW
        self._append_event(
            game,
            "auction.bid_placed",
            {
                "auction_id": str(auction.id),
                "property_id": auction.property_id,
                "player_id": str(actor_id),
                "amount": amount,
                "bid_deadline": auction.bid_deadline.isoformat(),
            },
        )
        self._resolve_auction_if_finished(game)

    def _pass_auction(
        self,
        game: GameState,
        actor_id: UUID,
        command: PassAuctionCommand,
    ) -> None:
        auction = self._require_matching_auction(game, command.auction_id)
        if actor_id not in auction.eligible_player_ids:
            raise ConflictError("the player cannot participate in this auction")
        if actor_id in auction.passed_player_ids:
            return
        if auction.phase == "idle" and actor_id in auction.ready_player_ids:
            raise ConflictError("the player is already ready for this auction")
        if actor_id == auction.current_bidder_id:
            raise ConflictError("the highest bidder cannot pass")
        if auction.phase == "bidding" and actor_id not in auction.ready_player_ids:
            raise ConflictError("the player did not join the bidding")
        self._refund_auction_deposit(
            game,
            auction,
            actor_id,
            reason="player_passed",
        )
        auction.passed_player_ids.append(actor_id)
        self._append_event(
            game,
            "auction.player_passed",
            {
                "auction_id": str(auction.id),
                "property_id": auction.property_id,
                "player_id": str(actor_id),
                "before_bidding": auction.phase == "idle",
            },
        )
        if auction.phase == "idle":
            self._start_auction_bidding_if_ready(game)
        else:
            self._resolve_auction_if_finished(game)

    def _resolve_auction_if_finished(self, game: GameState) -> None:
        auction = game.active_auction
        if auction is None:
            return
        if auction.phase != "bidding":
            return
        remaining = [
            player_id
            for player_id in auction.ready_player_ids
            if player_id not in auction.passed_player_ids
        ]
        if not remaining and auction.current_bidder_id is None:
            self._complete_auction(game)

    def _complete_auction(self, game: GameState) -> None:
        auction = game.active_auction
        if auction is None:
            return
        winner_id: str | None = None
        amount = 0
        deposit_applied = 0
        seller_id = auction.seller_id
        if auction.current_bidder_id is not None:
            winner = self._player(game, auction.current_bidder_id)
            winner_deposit = auction.deposits.pop(winner.user_id, 0)
            deposit_applied = min(winner_deposit, auction.current_bid)
            remaining_payment = auction.current_bid - deposit_applied
            if winner.balance < remaining_payment:
                raise ConflictError("the highest bidder no longer has sufficient balance")
            winner.balance -= remaining_payment
            if winner_deposit > deposit_applied:
                winner.balance += winner_deposit - deposit_applied
            game.owners[auction.property_id] = winner.user_id
            if seller_id is not None:
                seller = self._player(game, seller_id)
                if not seller.bankrupt:
                    seller.balance += auction.current_bid
            self._protect_acquired_properties(game, [auction.property_id])
            winner_id = str(winner.user_id)
            amount = auction.current_bid
        elif seller_id is not None:
            game.trade_unavailable_property_ids = [
                property_id
                for property_id in game.trade_unavailable_property_ids
                if property_id != auction.property_id
            ]
        self._refund_all_auction_deposits(game, reason="auction_completed")
        self._append_event(
            game,
            "auction.completed",
            {
                "auction_id": str(auction.id),
                "property_id": auction.property_id,
                "winner_id": winner_id,
                "amount": amount,
                "deposit_applied": deposit_applied,
                "seller_id": str(seller_id) if seller_id is not None else None,
            },
        )
        game.active_auction = None
        self._start_next_bank_auction(game)

    def _auction_terms(
        self,
        game: GameState,
        property_id: str,
        *,
        requested_minimum_bid: int,
    ) -> tuple[int, int]:
        price = indexed_amount(game, self._tile(game, property_id).price or 0)
        configured_minimum = (price * game.settings.auction_minimum_bid_percent + 99) // 100
        deposit_amount = (price * game.settings.auction_deposit_percent + 99) // 100
        return max(1, requested_minimum_bid, configured_minimum), deposit_amount

    def _refund_auction_deposit(
        self,
        game: GameState,
        auction: AuctionState,
        player_id: UUID,
        *,
        reason: str,
    ) -> None:
        amount = auction.deposits.pop(player_id, 0)
        if amount <= 0:
            return
        self._player(game, player_id).balance += amount
        self._append_event(
            game,
            "auction.deposit_refunded",
            {
                "property_id": auction.property_id,
                "player_id": str(player_id),
                "amount": amount,
                "reason": reason,
            },
        )

    def _refund_all_auction_deposits(
        self,
        game: GameState,
        *,
        reason: str,
    ) -> None:
        auction = game.active_auction
        if auction is None:
            return
        for player_id in list(auction.deposits):
            self._refund_auction_deposit(
                game,
                auction,
                player_id,
                reason=reason,
            )

    @staticmethod
    def _protect_acquired_properties(
        game: GameState,
        property_ids: list[str],
    ) -> None:
        unavailable = game.trade_unavailable_property_ids
        for property_id in property_ids:
            if property_id not in unavailable:
                unavailable.append(property_id)

    def _set_property_trade_availability(
        self,
        game: GameState,
        actor_id: UUID,
        command: SetPropertyTradeAvailabilityCommand,
    ) -> None:
        if game.owners.get(command.property_id) != actor_id:
            raise ForbiddenError("only the property owner can change its trade availability")
        unavailable = game.trade_unavailable_property_ids
        if command.available:
            if command.property_id in unavailable:
                unavailable.remove(command.property_id)
        elif command.property_id not in unavailable:
            unavailable.append(command.property_id)
        self._append_event(
            game,
            "property.trade_availability_changed",
            {
                "player_id": str(actor_id),
                "property_id": command.property_id,
                "available": command.available,
            },
        )

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
            pending = [trade for trade in game.trades if trade.status is TradeStatus.PENDING]
            resolved = [trade for trade in game.trades if trade.status is not TradeStatus.PENDING]
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

    def _counter_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: CounterTradeCommand,
    ) -> None:
        if game.active_auction is not None:
            raise ConflictError("trades are unavailable during an auction")
        original = next(
            (trade for trade in game.trades if trade.id == command.trade_id),
            None,
        )
        if original is None:
            raise ConflictError("the trade does not exist")
        if original.recipient_id != actor_id:
            raise ForbiddenError("only the recipient can counter this trade")
        if original.status not in {TradeStatus.PENDING, TradeStatus.REJECTED}:
            raise ConflictError("the trade can no longer be countered")
        if any(trade.parent_trade_id == original.id for trade in game.trades):
            raise ConflictError("the trade already has a counter-offer")
        pending_without_original = sum(
            trade.status is TradeStatus.PENDING and trade.id != original.id for trade in game.trades
        )
        if pending_without_original >= 20:
            raise ConflictError("the game has too many pending trades")
        self._validate_trade_assets(
            game,
            proposer_id=actor_id,
            recipient_id=original.proposer_id,
            offered_cash=command.offered_cash,
            requested_cash=command.requested_cash,
            offered_property_ids=command.offered_property_ids,
            requested_property_ids=command.requested_property_ids,
        )
        if len(game.trades) >= 100:
            removable = next(
                (
                    trade
                    for trade in game.trades
                    if trade.status is not TradeStatus.PENDING and trade.id != original.id
                ),
                None,
            )
            if removable is None:
                raise ConflictError("the trade history is full")
            game.trades.remove(removable)
        original.status = TradeStatus.REJECTED
        original.resolved_at = datetime.now(UTC)
        counter = TradeOffer(
            proposer_id=actor_id,
            recipient_id=original.proposer_id,
            offered_cash=command.offered_cash,
            requested_cash=command.requested_cash,
            offered_property_ids=command.offered_property_ids,
            requested_property_ids=command.requested_property_ids,
            parent_trade_id=original.id,
        )
        game.trades.append(counter)
        self._append_event(
            game,
            "trade.countered",
            {
                "trade_id": str(original.id),
                "counter_trade_id": str(counter.id),
                "actor_id": str(actor_id),
                "proposer_id": str(actor_id),
                "recipient_id": str(original.proposer_id),
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
        self._protect_acquired_properties(
            game,
            [
                *trade.offered_property_ids,
                *trade.requested_property_ids,
            ],
        )
        self._resolve_trade(game, trade, TradeStatus.ACCEPTED, actor_id)

    def _accept_financed_trade(
        self,
        game: GameState,
        actor_id: UUID,
        command: AcceptFinancedTradeCommand,
    ) -> None:
        if game.active_auction is not None:
            raise ConflictError("trades are unavailable during an auction")
        trade = self._pending_trade(game, command.trade_id)
        if trade.recipient_id != actor_id:
            raise ForbiddenError("only the recipient can finance this trade")
        principal = trade.requested_cash - trade.offered_cash
        if principal <= 0:
            raise ConflictError("this trade does not request net money")
        if len(game.rent_debt_plans) >= 100:
            raise ConflictError("the game has too many payment plans")
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
        self._protect_acquired_properties(
            game,
            [*trade.offered_property_ids, *trade.requested_property_ids],
        )
        total_amount = (principal * (100 + command.interest_percent) + 99) // 100
        plan = RentDebtPlanState(
            debtor_id=trade.proposer_id,
            creditor_id=trade.recipient_id,
            tile_id=(
                trade.offered_property_ids[0] if trade.offered_property_ids else "player_loan"
            ),
            original_amount=principal,
            interest_percent=command.interest_percent,
            total_amount=total_amount,
            remaining_amount=total_amount,
            installments_total=command.installments,
            installments_remaining=command.installments,
            template=RentDebtPlanTemplate.CUSTOM,
            created_at_sequence=game.event_sequence + 1,
            reason=DebtReason.PLAYER_LOAN,
            source_trade_id=trade.id,
        )
        game.rent_debt_plans.append(plan)
        self._append_event(
            game,
            "debt.player_loan_created",
            {
                "plan_id": str(plan.id),
                "trade_id": str(trade.id),
                "debtor_id": str(plan.debtor_id),
                "creditor_id": str(plan.creditor_id),
                "principal": plan.original_amount,
                "total_amount": plan.total_amount,
                "installments": plan.installments_total,
                "interest_percent": plan.interest_percent,
            },
        )
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
        require_trade_availability: bool = True,
    ) -> None:
        proposer = self._player(game, proposer_id)
        recipient = self._player(game, recipient_id)
        if proposer.bankrupt or recipient.bankrupt:
            raise ConflictError("bankrupt players cannot trade")
        if proposer.balance < offered_cash or recipient.balance < requested_cash:
            raise ConflictError("insufficient balance for this trade")
        pack = self._pack(game)
        purchasable_ids = {tile.id for tile in pack.board.tiles if tile.is_purchasable}
        unavailable_property_ids = set(game.trade_unavailable_property_ids)
        for property_id in offered_property_ids:
            if property_id not in purchasable_ids:
                raise ConflictError("the trade contains an unknown property")
            if game.owners.get(property_id) != proposer_id:
                raise ConflictError("the proposer no longer owns an offered property")
            if game.building_levels.get(property_id, 0) > 0:
                raise ConflictError("properties with buildings cannot be traded")
            if require_trade_availability and property_id in unavailable_property_ids:
                raise ConflictError("the offered property is unavailable for trades")
        for property_id in requested_property_ids:
            if property_id not in purchasable_ids:
                raise ConflictError("the trade contains an unknown property")
            if game.owners.get(property_id) != recipient_id:
                raise ConflictError("the recipient no longer owns a requested property")
            if game.building_levels.get(property_id, 0) > 0:
                raise ConflictError("properties with buildings cannot be traded")
            if require_trade_availability and property_id in unavailable_property_ids:
                raise ConflictError("the requested property is unavailable for trades")

    @staticmethod
    def _is_pure_money_request_command(command: ProposeTradeCommand) -> bool:
        return bool(
            command.requested_cash > 0
            and command.offered_cash == 0
            and not command.offered_property_ids
            and not command.requested_property_ids
        )

    @staticmethod
    def _is_pure_money_request_trade(game: GameState, trade_id: UUID) -> bool:
        trade = next((item for item in game.trades if item.id == trade_id), None)
        return bool(
            trade is not None
            and trade.requested_cash > 0
            and trade.offered_cash == 0
            and not trade.offered_property_ids
            and not trade.requested_property_ids
        )

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

    def _apply_relationship_effects(
        self,
        game: GameState,
        previous_sequence: int,
    ) -> None:
        source_events = list(game.events[previous_sequence:])
        if not source_events:
            return
        for change in relationship_changes_for_events(
            game,
            self._pack(game),
            source_events,
        ):
            relationship = next(
                (
                    item
                    for item in game.bot_relationships
                    if item.bot_id == change.bot_id and item.player_id == change.player_id
                ),
                None,
            )
            if relationship is None:
                relationship = BotRelationshipState(
                    bot_id=change.bot_id,
                    player_id=change.player_id,
                )
                game.bot_relationships.append(relationship)
            previous_score = relationship.score
            relationship.score = clamp_score(previous_score + change.delta)
            applied_delta = relationship.score - previous_score
            relationship.interaction_count += 1
            relationship.last_reason = change.reason
            relationship.last_event_sequence = game.event_sequence + 1
            self._append_event(
                game,
                "relationship.changed",
                {
                    "bot_id": str(change.bot_id),
                    "player_id": str(change.player_id),
                    "delta": applied_delta,
                    "score": relationship.score,
                    "interaction_count": relationship.interaction_count,
                    "reason": change.reason,
                },
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
        if game.pack_snapshot is not None:
            return game.pack_snapshot
        return self._packs.load(game.pack_id, version=game.pack_version)

    def _owned_tile(
        self,
        game: GameState,
        actor_id: UUID,
        tile_id: str,
    ) -> TileDefinition:
        tile = self._tile(game, tile_id)
        if not tile.is_purchasable:
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

    def _owned_property_group(
        self,
        game: GameState,
        actor_id: UUID,
        group_id: str,
    ) -> list[TileDefinition]:
        group_tiles = [
            item
            for item in self._pack(game).board.tiles
            if item.kind is TileKind.PROPERTY and item.group == group_id
        ]
        if not group_tiles:
            raise ConflictError("the property group was not found")
        if not all(game.owners.get(item.id) == actor_id for item in group_tiles):
            raise ConflictError("the complete property group is required")
        return group_tiles

    def _active_player(self, game: GameState, player_id: UUID) -> PlayerState:
        player = self._player(game, player_id)
        if player.bankrupt:
            raise ConflictError("bankrupt players cannot perform this action")
        return player

    def _advance_to_next_active_player(self, game: GameState) -> None:
        previous_index = game.current_player_index
        for _ in game.players:
            game.current_player_index = (game.current_player_index + 1) % len(game.players)
            if not game.players[game.current_player_index].bankrupt:
                if game.current_player_index <= previous_index:
                    week_event = advance_economic_week(game, self._pack(game))
                    refresh_market_index(game)
                    self._append_event(game, "economy.week_advanced", week_event)
                    self._settle_market_dividends(game)
                    self._process_advanced_week(game)
                    if game.status is GameStatus.FINISHED:
                        return
                game.phase = TurnPhase.WAITING_FOR_ROLL
                game.consecutive_doubles = 0
                game.extra_roll_pending = False
                current_player = game.current_player
                amount_due = self._operating_cost_due_for(
                    game,
                    current_player.user_id,
                )
                if current_player.is_bot and amount_due > 0:
                    reserve = indexed_amount(
                        game,
                        self._pack(game).manifest.pass_start_salary,
                        80,
                    )
                    if current_player.balance >= amount_due + reserve:
                        self._pay_operating_costs(game, current_player.user_id)
                    else:
                        self._defer_operating_costs(game, current_player.user_id)
                self._append_event(
                    game,
                    "turn.started",
                    {"player_id": str(game.current_player.user_id)},
                )
                self._collect_rent_installments(game, game.current_player)
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
        game.event_sequence = (
            max(
                game.event_sequence,
                game.events[-1].sequence if game.events else 0,
            )
            + 1
        )
        game.events.append(
            GameEvent(
                sequence=game.event_sequence,
                type=event_type,
                data=data or {},
            )
        )
