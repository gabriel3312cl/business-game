from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from business_game.application.negotiation import (
    MAX_COUNTER_LOOKBACK,
    NegotiationEngine,
    PersonalityProfile,
    TradeVerdict,
    profile_for,
)
from business_game.domain.models import (
    AcceptTradeCommand,
    BidCommand,
    BotPersonality,
    BuildPropertyCommand,
    BuyPropertyCommand,
    CancelTradeCommand,
    ContentPack,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    EndTurnCommand,
    GameCommand,
    GameState,
    GameStatus,
    MortgagePropertyCommand,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    PlayerState,
    RejectTradeCommand,
    RollCommand,
    SelectAuctionPropertyCommand,
    SellBuildingCommand,
    TileDefinition,
    TradeStatus,
    TurnPhase,
    UnmortgagePropertyCommand,
    UseJailCardCommand,
)


@dataclass(frozen=True)
class BotAction:
    actor_id: UUID
    command: GameCommand
    reason: str
    note: str | None = None


class BotPolicy:
    """Pure, deterministic bot decisions over the authoritative game snapshot."""

    def choose_action(self, game: GameState, pack: ContentPack) -> BotAction | None:
        if game.status is not GameStatus.PLAYING:
            return None
        engine = NegotiationEngine(game, pack)
        if game.active_auction is not None:
            return self._auction_action(game, pack, engine)
        if game.pending_auction_selector_id is not None:
            selector = self._bot(game, game.pending_auction_selector_id)
            if selector is None:
                return None
            property_id = self._auction_selection(game, pack, engine, selector)
            if property_id is None:
                return None
            return BotAction(
                selector.user_id,
                SelectAuctionPropertyCommand(
                    action="select_auction_property",
                    property_id=property_id,
                ),
                "select_property_worth_winning",
            )
        if game.active_debt is not None:
            debtor = self._bot(game, game.active_debt.debtor_id)
            if debtor is None:
                return None
            return self._debt_action(game, pack, engine, debtor)

        incoming = self._incoming_trade_action(game, engine)
        if incoming is not None:
            return incoming
        counter = self._counter_offer_action(game, engine)
        if counter is not None:
            return counter
        stale_trade = self._stale_outgoing_trade_action(game)
        if stale_trade is not None:
            return stale_trade

        player = game.current_player
        if player is None or not player.is_bot or player.bankrupt:
            return None
        profile = self._profile(player)

        if game.phase is TurnPhase.BUY_DECISION:
            return self._purchase_action(game, pack, engine, player, profile)
        if game.phase is TurnPhase.WAITING_FOR_ROLL:
            return self._before_roll_action(game, pack, engine, player, profile)
        if game.phase is TurnPhase.WAITING_FOR_END:
            trade = self._propose_trade_action(game, engine, player)
            if trade is not None:
                return trade
            build = self._build_action(game, pack, engine, player, profile)
            if build is not None:
                return build
            return BotAction(
                player.user_id,
                EndTurnCommand(action="end_turn"),
                "finish_turn",
            )
        return None

    def safe_fallback(
        self,
        game: GameState,
        pack: ContentPack | None = None,
    ) -> BotAction | None:
        """Prefer progress over strategy after repeated invalid/stale decisions."""
        if game.status is not GameStatus.PLAYING:
            return None
        if game.active_auction is not None:
            for player_id in game.active_auction.eligible_player_ids:
                bot = self._bot(game, player_id)
                if (
                    bot is not None
                    and player_id != game.active_auction.current_bidder_id
                    and player_id not in game.active_auction.passed_player_ids
                ):
                    return BotAction(
                        player_id,
                        PassAuctionCommand(action="pass_auction"),
                        "safeguard_pass_auction",
                    )
            return None
        if game.pending_auction_selector_id is not None:
            selector = self._bot(game, game.pending_auction_selector_id)
            property_id = self._cheapest_unowned(game, pack) if pack is not None else None
            if selector is not None and property_id is not None:
                return BotAction(
                    selector.user_id,
                    SelectAuctionPropertyCommand(
                        action="select_auction_property",
                        property_id=property_id,
                    ),
                    "safeguard_select_auction_property",
                )
        if game.active_debt is not None:
            bot = self._bot(game, game.active_debt.debtor_id)
            if bot is not None:
                command: GameCommand
                if bot.balance >= game.active_debt.amount:
                    command = PayDebtCommand(action="pay_debt")
                else:
                    command = DeclareBankruptcyCommand(action="declare_bankruptcy")
                return BotAction(bot.user_id, command, "safeguard_resolve_debt")
        for trade in game.trades:
            if trade.status is not TradeStatus.PENDING:
                continue
            bot = self._bot(game, trade.recipient_id)
            if bot is not None:
                return BotAction(
                    bot.user_id,
                    RejectTradeCommand(action="reject_trade", trade_id=trade.id),
                    "safeguard_reject_trade",
                )
        player = game.current_player
        if player is None or not player.is_bot or player.bankrupt:
            return None
        if game.phase is TurnPhase.BUY_DECISION:
            command = DeclinePropertyCommand(action="decline_property")
        elif game.phase is TurnPhase.WAITING_FOR_END:
            command = EndTurnCommand(action="end_turn")
        elif player.in_jail and player.jail_card_ids:
            command = UseJailCardCommand(action="use_jail_card")
        else:
            command = RollCommand(action="roll")
        return BotAction(player.user_id, command, "safeguard_advance_turn")

    # ---------------------------------------------------------------- auctions

    def _auction_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
    ) -> BotAction | None:
        auction = game.active_auction
        if auction is None:
            return None
        tile = self._tile(pack, auction.property_id)
        for player_id in auction.eligible_player_ids:
            bot = self._bot(game, player_id)
            if (
                bot is None
                or bot.bankrupt
                or player_id == auction.current_bidder_id
                or player_id in auction.passed_player_ids
            ):
                continue
            profile = self._profile(bot)
            reserve = engine.liquidity_floor(bot)
            if bot.bot_personality is BotPersonality.AGGRESSIVE:
                reserve //= 2
            strategic_value = engine.marginal_value(bot.user_id, [tile.id])
            max_bid = min(
                max(bot.balance - reserve, 0),
                strategic_value * profile.auction_value_percent // 100,
            )
            increment = max(1, (tile.price or strategic_value or 20) // 20)
            amount = max(
                auction.minimum_bid,
                auction.current_bid + 1,
                auction.current_bid + increment,
            )
            if amount <= max_bid:
                return BotAction(
                    bot.user_id,
                    BidCommand(action="bid", amount=amount),
                    "bid_completes_group"
                    if engine.completes_group(bot.user_id, tile)
                    else "bid_within_valuation",
                )
            return BotAction(
                bot.user_id,
                PassAuctionCommand(action="pass_auction"),
                "auction_exceeds_valuation",
            )
        return None

    @staticmethod
    def _auction_selection(
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> str | None:
        """Send to auction what the bot itself can win cheaply and wants."""
        candidates = [
            tile
            for tile in pack.board.tiles
            if tile.is_purchasable and tile.id not in game.owners
        ]
        if not candidates:
            return None
        spendable = max(bot.balance - engine.liquidity_floor(bot) // 2, 0)
        affordable = [tile for tile in candidates if (tile.price or 0) <= spendable]
        pool = affordable or candidates
        return max(
            pool,
            key=lambda tile: (
                engine.marginal_value(bot.user_id, [tile.id]) - (tile.price or 0),
                -(tile.price or 0),
                tile.id,
            ),
        ).id

    @staticmethod
    def _cheapest_unowned(game: GameState, pack: ContentPack) -> str | None:
        candidates = [
            tile
            for tile in pack.board.tiles
            if tile.is_purchasable and tile.id not in game.owners
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda tile: (tile.price or 0, tile.id)).id

    # -------------------------------------------------------------------- debt

    def _debt_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction:
        debt = game.active_debt
        assert debt is not None
        if bot.balance >= debt.amount:
            return BotAction(bot.user_id, PayDebtCommand(action="pay_debt"), "pay_debt")

        # Mortgaging comes first: it is reversible and keeps the rent flowing,
        # while selling a building gives back only part of what it cost.
        mortgageable = [
            tile
            for tile in pack.board.tiles
            if game.owners.get(tile.id) == bot.user_id
            and tile.id not in game.mortgaged_property_ids
            and self._can_mortgage(game, pack, tile)
        ]
        if mortgageable:
            tile = min(
                mortgageable,
                key=lambda item: (
                    engine.strategic_value(bot.user_id, item, game.owners),
                    item.id,
                ),
            )
            return BotAction(
                bot.user_id,
                MortgagePropertyCommand(action="mortgage_property", property_id=tile.id),
                "mortgage_least_valuable_for_debt",
            )

        sellable = [
            tile
            for tile in pack.board.tiles
            if game.owners.get(tile.id) == bot.user_id
            and game.building_levels.get(tile.id, 0) > 0
            and self._can_sell_building(game, pack, tile)
        ]
        if sellable:
            tile = max(
                sellable,
                key=lambda item: (
                    game.building_levels.get(item.id, 0),
                    item.build_cost or 0,
                    item.id,
                ),
            )
            return BotAction(
                bot.user_id,
                SellBuildingCommand(action="sell_building", property_id=tile.id),
                "liquidate_building_for_debt",
            )

        return BotAction(
            bot.user_id,
            DeclareBankruptcyCommand(action="declare_bankruptcy"),
            "no_assets_left_for_debt",
        )

    # ------------------------------------------------------------------ trades

    def _incoming_trade_action(
        self,
        game: GameState,
        engine: NegotiationEngine,
    ) -> BotAction | None:
        for trade in game.trades:
            if trade.status is not TradeStatus.PENDING:
                continue
            bot = self._bot(game, trade.recipient_id)
            if bot is None or bot.bankrupt:
                continue
            assessment = engine.assess_incoming(bot, trade)
            if assessment.verdict is TradeVerdict.ACCEPT:
                return BotAction(
                    bot.user_id,
                    AcceptTradeCommand(action="accept_trade", trade_id=trade.id),
                    assessment.reason,
                )
            # A counter-offer still starts by refusing: the deal on the table is
            # not the one the bot wants. The rebalanced offer follows next tick.
            return BotAction(
                bot.user_id,
                RejectTradeCommand(action="reject_trade", trade_id=trade.id),
                assessment.reason,
            )
        return None

    def _counter_offer_action(
        self,
        game: GameState,
        engine: NegotiationEngine,
    ) -> BotAction | None:
        """Re-open a deal the bot just refused, priced where it would say yes."""
        for trade in list(reversed(game.trades))[:MAX_COUNTER_LOOKBACK]:
            if trade.status is not TradeStatus.REJECTED:
                continue
            bot = self._bot(game, trade.recipient_id)
            if bot is None or bot.bankrupt:
                continue
            assessment = engine.assess_incoming(bot, trade)
            if assessment.verdict is not TradeVerdict.COUNTER:
                continue
            if assessment.counter is None:
                continue
            return BotAction(bot.user_id, assessment.counter, assessment.reason)
        return None

    def _stale_outgoing_trade_action(self, game: GameState) -> BotAction | None:
        for trade in game.trades:
            if trade.status is not TradeStatus.PENDING:
                continue
            bot = self._bot(game, trade.proposer_id)
            if bot is None:
                continue
            proposal_sequence = next(
                (
                    event.sequence
                    for event in reversed(game.events)
                    if event.type == "trade.proposed"
                    and event.data.get("trade_id") == str(trade.id)
                ),
                None,
            )
            if proposal_sequence is None:
                continue
            later_turns = sum(
                event.sequence > proposal_sequence
                and event.type == "turn.started"
                and event.data.get("player_id") == str(bot.user_id)
                for event in game.events
            )
            if later_turns >= 2:
                return BotAction(
                    bot.user_id,
                    CancelTradeCommand(action="cancel_trade", trade_id=trade.id),
                    "cancel_stale_trade",
                )
        return None

    def _propose_trade_action(
        self,
        game: GameState,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction | None:
        if any(
            trade.status is TradeStatus.PENDING and trade.proposer_id == bot.user_id
            for trade in game.trades
        ) or self._proposed_during_current_turn(game, bot.user_id):
            return None
        candidates = engine.candidate_trades(bot)
        if not candidates:
            return None
        best = candidates[0]
        return BotAction(bot.user_id, best.command, best.reason)

    # ------------------------------------------------------------------- turns

    def _purchase_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
        profile: PersonalityProfile,
    ) -> BotAction:
        tile = self._tile(pack, game.pending_tile_id or "")
        price = self._purchase_price(game, tile)
        value = engine.marginal_value(bot.user_id, [tile.id])
        completes = engine.completes_group(bot.user_id, tile)
        floor = engine.liquidity_floor(bot)
        # Closing a group is the single biggest jump in rent the board offers, so
        # the bot is allowed to dig into half of its reserve to get there.
        affordable = bot.balance - price >= (floor // 2 if completes else floor)
        worthwhile = completes or value * 100 >= price * profile.buy_required_percent
        if affordable and worthwhile:
            return BotAction(
                bot.user_id,
                BuyPropertyCommand(action="buy_property"),
                "buy_completes_group" if completes else "buy_within_strategy",
            )
        return BotAction(
            bot.user_id,
            DeclinePropertyCommand(action="decline_property"),
            "decline_to_keep_cash" if not affordable else "decline_low_value",
        )

    def _before_roll_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
        profile: PersonalityProfile,
    ) -> BotAction:
        if bot.in_jail:
            if bot.jail_card_ids:
                return BotAction(
                    bot.user_id,
                    UseJailCardCommand(action="use_jail_card"),
                    "use_jail_card",
                )
            fine = pack.manifest.jail_fine
            floor = engine.liquidity_floor(bot)
            should_pay = bot.bot_personality in {
                BotPersonality.CONSERVATIVE,
                BotPersonality.NEGOTIATOR,
            } or (
                bot.bot_personality is BotPersonality.BALANCED
                and bot.jail_failed_rolls > 0
            )
            # While broke, jail is shelter: no rent can be charged from inside.
            if should_pay and not engine.is_distressed(bot) and bot.balance - fine >= floor:
                return BotAction(
                    bot.user_id,
                    PayJailFineCommand(action="pay_jail_fine"),
                    "pay_jail_fine",
                )

        unmortgage = self._unmortgage_action(game, pack, engine, bot)
        if unmortgage is not None:
            return unmortgage
        return BotAction(bot.user_id, RollCommand(action="roll"), "roll_dice")

    def _unmortgage_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction | None:
        if engine.is_distressed(bot):
            return None
        floor = engine.liquidity_floor(bot)
        candidates = []
        for property_id in game.mortgaged_property_ids:
            if game.owners.get(property_id) != bot.user_id:
                continue
            tile = self._tile(pack, property_id)
            mortgage = tile.mortgage_value or 0
            interest = (mortgage * pack.manifest.mortgage_interest_percent + 99) // 100
            cost = mortgage + interest
            if bot.balance - cost >= floor:
                candidates.append(
                    (engine.strategic_value(bot.user_id, tile, game.owners), tile)
                )
        if not candidates:
            return None
        tile = max(candidates, key=lambda item: (item[0], item[1].id))[1]
        return BotAction(
            bot.user_id,
            UnmortgagePropertyCommand(action="unmortgage_property", property_id=tile.id),
            "restore_valuable_property",
        )

    def _build_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
        profile: PersonalityProfile,
    ) -> BotAction | None:
        # Cash promised in an open offer is not available to spend here.
        if any(
            trade.status is TradeStatus.PENDING and trade.proposer_id == bot.user_id
            for trade in game.trades
        ) or engine.is_distressed(bot):
            return None
        reserve = max(
            pack.manifest.starting_balance * profile.build_reserve_percent // 100,
            1,
        )
        candidates = []
        for tile in pack.board.tiles:
            if tile.group is None or game.owners.get(tile.id) != bot.user_id:
                continue
            group = self._group_tiles(pack, tile)
            if not all(game.owners.get(item.id) == bot.user_id for item in group):
                continue
            if any(item.id in game.mortgaged_property_ids for item in group):
                continue
            levels = {item.id: game.building_levels.get(item.id, 0) for item in group}
            level = levels[tile.id]
            if level >= 5 or level != min(levels.values()):
                continue
            cost = (
                tile.hotel_cost
                if level == 4 and tile.hotel_cost is not None
                else tile.build_cost or 0
            )
            supply_available = (
                game.hotels_remaining > 0 if level == 4 else game.houses_remaining > 0
            )
            if supply_available and cost > 0 and bot.balance - cost >= reserve:
                candidates.append((engine.expected_rent(tile, bot.user_id), tile))
        if not candidates:
            return None
        tile = max(candidates, key=lambda item: (item[0], item[1].id))[1]
        return BotAction(
            bot.user_id,
            BuildPropertyCommand(action="build_property", property_id=tile.id),
            "develop_complete_group",
        )

    # --------------------------------------------------------------- utilities

    @staticmethod
    def _purchase_price(game: GameState, tile: TileDefinition) -> int:
        price = tile.price or 0
        discount = game.pending_purchase_discount_percent
        if discount:
            price -= price * discount // 100
        return price

    def _can_sell_building(
        self,
        game: GameState,
        pack: ContentPack,
        tile: TileDefinition,
    ) -> bool:
        group = self._group_tiles(pack, tile)
        level = game.building_levels.get(tile.id, 0)
        if level != max(game.building_levels.get(item.id, 0) for item in group):
            return False
        return level != 5 or game.houses_remaining >= 4

    def _can_mortgage(
        self,
        game: GameState,
        pack: ContentPack,
        tile: TileDefinition,
    ) -> bool:
        if tile.group is None:
            return True
        return not any(
            game.building_levels.get(item.id, 0) > 0
            for item in self._group_tiles(pack, tile)
        )

    @staticmethod
    def _proposed_during_current_turn(game: GameState, player_id: UUID) -> bool:
        marker = 0
        player_text = str(player_id)
        for event in game.events:
            if event.type == "turn.started" and event.data.get("player_id") == player_text:
                marker = event.sequence
        return any(
            event.sequence > marker
            and event.type == "trade.proposed"
            and event.data.get("proposer_id") == player_text
            for event in game.events
        )

    @staticmethod
    def _group_tiles(pack: ContentPack, tile: TileDefinition) -> list[TileDefinition]:
        if tile.group is None:
            return [tile]
        return [item for item in pack.board.tiles if item.group == tile.group]

    @staticmethod
    def _tile(pack: ContentPack, tile_id: str) -> TileDefinition:
        return next(item for item in pack.board.tiles if item.id == tile_id)

    @staticmethod
    def _bot(game: GameState, player_id: UUID) -> PlayerState | None:
        return next(
            (
                player
                for player in game.players
                if player.user_id == player_id and player.is_bot
            ),
            None,
        )

    @staticmethod
    def _profile(bot: PlayerState) -> PersonalityProfile:
        return profile_for(bot)
