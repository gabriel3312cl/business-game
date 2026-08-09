from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from business_game.application.economy import (
    credit_offer,
    market_order_quote,
    minimum_reserve,
)
from business_game.application.negotiation import (
    MAX_COUNTER_LOOKBACK,
    NegotiationEngine,
    PersonalityProfile,
    TradeVerdict,
    profile_for,
)
from business_game.application.relationships import relationship_score
from business_game.domain.models import (
    AcceptRentDebtPlanCommand,
    AcceptTradeCommand,
    BidCommand,
    BotPersonality,
    BuildGroupRoundCommand,
    BuyPropertyCommand,
    BuySharesCommand,
    CancelTradeCommand,
    ChooseCardCommand,
    ContentPack,
    ContinueCardChoiceResultCommand,
    ContinueCardCommand,
    CounterTradeCommand,
    DebtReason,
    DeclareBankruptcyCommand,
    DeclinePropertyCommand,
    DemandRentDebtCommand,
    EndTurnCommand,
    ForgiveRentDebtCommand,
    GameCommand,
    GameState,
    GameStatus,
    MortgagePropertyCommand,
    PassAuctionCommand,
    PayDebtCommand,
    PayJailFineCommand,
    PlayerState,
    ProposeRentDebtPlanCommand,
    RejectRentDebtPlanCommand,
    RejectTradeCommand,
    RentDebtPlanTemplate,
    RepayLoanCommand,
    RequestLoanCommand,
    ResolveCardChoiceCommand,
    RollCommand,
    SelectAuctionPropertyCommand,
    SellGroupRoundCommand,
    SellSharesCommand,
    SetPropertyTradeAvailabilityCommand,
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


def build_rent_debt_creditor_choices(
    game: GameState,
    pack: ContentPack,
    engine: NegotiationEngine,
    creditor: PlayerState,
) -> list[GameCommand]:
    """Build legal settlement choices without letting a bot invent terms."""
    debt = game.active_debt
    if (
        debt is None
        or debt.creditor_id != creditor.user_id
        or debt.plan_proposal is not None
        or debt.collection_demanded
    ):
        return []

    profile = profile_for(creditor)
    rejection_count = _rent_debt_rejection_count(game)
    demand = DemandRentDebtCommand(action="demand_rent_debt")
    if rejection_count > profile.patience:
        return [demand]

    base_installments, base_interest = {
        BotPersonality.CONSERVATIVE: (3, 5),
        BotPersonality.BALANCED: (3, 5),
        BotPersonality.AGGRESSIVE: (2, 15),
        BotPersonality.NEGOTIATOR: (4, 0),
    }[creditor.bot_personality or BotPersonality.BALANCED]
    relationship = relationship_score(game, creditor.user_id, debt.debtor_id)
    if relationship >= 30:
        base_installments += 1
        base_interest = max(0, base_interest - 5)
    elif relationship <= -30:
        base_installments = max(2, base_installments - 1)
        base_interest = min(25, base_interest + 5)

    installments = min(6, base_installments + rejection_count)
    interest = max(0, base_interest - rejection_count * 5)
    terms = ProposeRentDebtPlanCommand(
        action="propose_rent_debt_plan",
        installments=installments,
        interest_percent=interest,
        template=_rent_debt_template(installments, interest),
    )
    choices: list[GameCommand] = [terms]
    settlement_amount = _rent_debt_settlement_amount(game)
    choices.extend(
        _rent_debt_property_choices(
            game,
            pack,
            engine,
            creditor,
            settlement_amount,
        )
    )
    choices.append(demand)
    if relationship >= 75 and settlement_amount <= pack.manifest.starting_balance // 20:
        choices.append(ForgiveRentDebtCommand(action="forgive_rent_debt"))
    return choices


def _rent_debt_template(
    installments: int,
    interest_percent: int,
) -> RentDebtPlanTemplate:
    return {
        (2, 0): RentDebtPlanTemplate.FRIENDLY,
        (3, 5): RentDebtPlanTemplate.STANDARD,
        (4, 10): RentDebtPlanTemplate.FLEXIBLE,
    }.get((installments, interest_percent), RentDebtPlanTemplate.CUSTOM)


def _rent_debt_settlement_amount(game: GameState) -> int:
    debt = game.active_debt
    assert debt is not None
    if debt.installment_plan_id is None:
        return debt.amount
    plan = next(
        (item for item in game.rent_debt_plans if item.id == debt.installment_plan_id),
        None,
    )
    return plan.remaining_amount if plan is not None else debt.amount


def _rent_debt_rejection_count(game: GameState) -> int:
    debt = game.active_debt
    assert debt is not None
    debtor_id = str(debt.debtor_id)
    creditor_id = str(debt.creditor_id)
    marker = 0
    for event in reversed(game.events):
        if (
            event.type == "debt.created"
            and event.data.get("debtor_id") == debtor_id
            and event.data.get("creditor_id") == creditor_id
            and event.data.get("tile_id") == debt.tile_id
        ):
            marker = event.sequence
            break
    return sum(
        event.sequence > marker
        and event.type == "debt.plan_rejected"
        and event.data.get("debtor_id") == debtor_id
        and event.data.get("creditor_id") == creditor_id
        and event.data.get("tile_id") == debt.tile_id
        for event in game.events
    )


def _rent_debt_property_choices(
    game: GameState,
    pack: ContentPack,
    engine: NegotiationEngine,
    creditor: PlayerState,
    settlement_amount: int,
) -> list[GameCommand]:
    debt = game.active_debt
    assert debt is not None
    candidates: list[tuple[int, str]] = []
    for tile in pack.board.tiles:
        if (
            not tile.is_purchasable
            or game.owners.get(tile.id) != debt.debtor_id
            or game.building_levels.get(tile.id, 0) > 0
        ):
            continue
        valuation = engine.evaluate(
            creditor.user_id,
            debt.debtor_id,
            offered_cash=0,
            requested_cash=0,
            offered_property_ids=[],
            requested_property_ids=[tile.id],
        )
        creditor_gain = valuation.proposer_property_gain
        debtor_cost = valuation.recipient_property_loss
        if (
            creditor_gain * 100 < settlement_amount * 70
            or debtor_cost * 100 > settlement_amount * 125
        ):
            continue
        fairness_gap = abs(debtor_cost - settlement_amount)
        candidates.append((creditor_gain * 2 - fairness_gap, tile.id))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return [
        ProposeRentDebtPlanCommand(
            action="propose_rent_debt_plan",
            installments=0,
            interest_percent=0,
            template=RentDebtPlanTemplate.CUSTOM,
            requested_property_ids=[property_id],
        )
        for _, property_id in candidates[:3]
    ]


class BotPolicy:
    """Pure, deterministic bot decisions over the authoritative game snapshot."""

    def choose_action(self, game: GameState, pack: ContentPack) -> BotAction | None:
        if game.status is not GameStatus.PLAYING:
            return None
        engine = NegotiationEngine(game, pack)
        if game.pending_card_choice_result is not None:
            chooser = self._bot(game, game.pending_card_choice_result.player_id)
            if chooser is None:
                return None
            return BotAction(
                chooser.user_id,
                ContinueCardChoiceResultCommand(
                    action="continue_card_choice_result",
                ),
                "continue_interactive_card_result",
            )
        if game.pending_card_draw is not None:
            drawer = self._bot(game, game.pending_card_draw.player_id)
            if drawer is None:
                return None
            if game.pending_card_draw.card_id is None:
                return BotAction(
                    drawer.user_id,
                    ChooseCardCommand(
                        action="choose_card",
                        card_index=(
                            game.pending_card_draw.draw_sequence
                            % game.pending_card_draw.offer_count
                        ),
                    ),
                    "choose_facedown_card",
                )
            return BotAction(
                drawer.user_id,
                ContinueCardCommand(action="continue_card"),
                "continue_drawn_card",
            )
        if game.pending_card_choice is not None:
            chooser = self._bot(game, game.pending_card_choice.player_id)
            if chooser is None:
                return None
            choice = game.pending_card_choice.effect.choices[0]
            return BotAction(
                chooser.user_id,
                ResolveCardChoiceCommand(
                    action="resolve_card_choice",
                    choice_id=choice.id,
                ),
                "resolve_interactive_card",
            )
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
            if self._rent_debt_waits_for_creditor(game):
                creditor = self._bot(game, game.active_debt.creditor_id)
                if creditor is None:
                    return None
                choices = build_rent_debt_creditor_choices(
                    game,
                    pack,
                    engine,
                    creditor,
                )
                command = choices[0] if choices else DemandRentDebtCommand(
                    action="demand_rent_debt"
                )
                return BotAction(
                    creditor.user_id,
                    command,
                    (
                        "demand_after_failed_debt_negotiation"
                        if isinstance(command, DemandRentDebtCommand)
                        else "counter_rent_debt_terms"
                        if _rent_debt_rejection_count(game) > 0
                        else "offer_rent_debt_terms"
                    ),
                )
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
            finance = self._financial_action(game, pack, engine, player)
            if finance is not None:
                return finance
            availability = self._trade_availability_action(
                game,
                pack,
                engine,
                player,
            )
            if availability is not None:
                return availability
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
        if game.pending_card_choice_result is not None:
            chooser = self._bot(game, game.pending_card_choice_result.player_id)
            if chooser is not None:
                return BotAction(
                    chooser.user_id,
                    ContinueCardChoiceResultCommand(
                        action="continue_card_choice_result",
                    ),
                    "safeguard_continue_interactive_card_result",
                )
            return None
        if game.pending_card_draw is not None:
            drawer = self._bot(game, game.pending_card_draw.player_id)
            if drawer is not None:
                if game.pending_card_draw.card_id is None:
                    return BotAction(
                        drawer.user_id,
                        ChooseCardCommand(
                            action="choose_card",
                            card_index=0,
                        ),
                        "safeguard_choose_facedown_card",
                    )
                return BotAction(
                    drawer.user_id,
                    ContinueCardCommand(action="continue_card"),
                    "safeguard_continue_drawn_card",
                )
            return None
        if game.pending_card_choice is not None:
            chooser = self._bot(game, game.pending_card_choice.player_id)
            if chooser is not None:
                return BotAction(
                    chooser.user_id,
                    ResolveCardChoiceCommand(
                        action="resolve_card_choice",
                        choice_id=game.pending_card_choice.effect.choices[0].id,
                    ),
                    "safeguard_resolve_interactive_card",
                )
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
            if self._rent_debt_waits_for_creditor(game):
                creditor = self._bot(game, game.active_debt.creditor_id)
                if creditor is not None:
                    return BotAction(
                        creditor.user_id,
                        DemandRentDebtCommand(action="demand_rent_debt"),
                        "safeguard_demand_rent_payment",
                    )
                return None
            bot = self._bot(game, game.active_debt.debtor_id)
            if bot is not None:
                command: GameCommand
                proposal = game.active_debt.plan_proposal
                if proposal is not None:
                    command = (
                        RejectRentDebtPlanCommand(action="reject_rent_debt_plan")
                        if proposal.requested_property_ids
                        else AcceptRentDebtPlanCommand(
                            action="accept_rent_debt_plan"
                        )
                    )
                elif bot.balance >= game.active_debt.amount:
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
            held_deposit = auction.deposits.get(bot.user_id, 0)
            available_cash = bot.balance + held_deposit
            max_bid = min(
                max(available_cash - reserve, 0),
                strategic_value * profile.auction_value_percent // 100,
            )
            increment = max(1, (tile.price or strategic_value or 20) // 20)
            amount = max(
                auction.minimum_bid,
                auction.current_bid + 1,
                auction.current_bid + increment,
            )
            can_place_deposit = (
                held_deposit > 0 or bot.balance >= auction.deposit_amount
            )
            if can_place_deposit and amount <= max_bid:
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

    @staticmethod
    def _rent_debt_waits_for_creditor(game: GameState) -> bool:
        debt = game.active_debt
        return bool(
            game.settings.rules.custom_rent_debts_enabled
            and debt is not None
            and debt.creditor_id is not None
            and debt.reason in {DebtReason.RENT, DebtReason.RENT_INSTALLMENT}
            and not debt.collection_demanded
            and debt.plan_proposal is None
        )

    def _debt_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction:
        debt = game.active_debt
        assert debt is not None
        if debt.plan_proposal is not None:
            proposal = debt.plan_proposal
            settlement_amount = _rent_debt_settlement_amount(game)
            cash_cost = (
                (settlement_amount * (100 + proposal.interest_percent) + 99) // 100
                if proposal.installments
                else 0
            )
            property_cost = engine.separation_cost(
                bot.user_id,
                proposal.requested_property_ids,
            )
            reasonable_cost = (
                cash_cost + property_cost <= settlement_amount * 125 // 100
            )
            if (
                proposal.interest_percent <= 25
                and proposal.installments <= 6
                and reasonable_cost
            ):
                return BotAction(
                    bot.user_id,
                    AcceptRentDebtPlanCommand(action="accept_rent_debt_plan"),
                    "accept_reasonable_rent_plan",
                )
            return BotAction(
                bot.user_id,
                RejectRentDebtPlanCommand(action="reject_rent_debt_plan"),
                "reject_expensive_rent_plan",
            )
        if bot.balance >= debt.amount:
            return BotAction(bot.user_id, PayDebtCommand(action="pay_debt"), "pay_debt")

        shortfall = debt.amount - bot.balance
        if game.settings.rules.stock_market_enabled:
            bank_capacity = max(0, game.bank.cash - minimum_reserve(game))
            sellable = []
            for instrument in game.bank.investments:
                held = instrument.holdings.get(bot.user_id, 0)
                maximum_quantity = 0
                for quantity in range(1, held + 1):
                    gross = instrument.current_price * quantity
                    proceeds = (
                        gross
                        - gross * instrument.transaction_fee_percent // 100
                    )
                    if proceeds <= bank_capacity:
                        maximum_quantity = quantity
                if maximum_quantity:
                    sellable.append((instrument, maximum_quantity))
            if sellable:
                instrument, maximum_quantity = max(
                    sellable,
                    key=lambda item: (
                        item[0].current_price * 100 // item[0].base_price,
                        item[0].current_price,
                        item[0].id,
                    ),
                )
                per_share = max(
                    1,
                    instrument.current_price
                    * (100 - instrument.transaction_fee_percent)
                    // 100,
                )
                quantity = min(
                    maximum_quantity,
                    max(1, (shortfall + per_share - 1) // per_share),
                )
                return BotAction(
                    bot.user_id,
                    SellSharesCommand(
                        action="sell_shares",
                        instrument_id=instrument.id,
                        quantity=quantity,
                    ),
                    "sell_liquid_investment_for_debt",
                )

        if game.settings.rules.loans_enabled:
            offer = credit_offer(game, pack, bot)
            if shortfall <= offer.maximum_amount and offer.interest_percent <= 25:
                return BotAction(
                    bot.user_id,
                    RequestLoanCommand(action="request_loan", amount=shortfall),
                    "borrow_to_preserve_productive_assets",
                )

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

        sellable_groups = []
        seen_groups: set[str] = set()
        for tile in pack.board.tiles:
            if tile.group is None or tile.group in seen_groups:
                continue
            seen_groups.add(tile.group)
            group = self._group_tiles(pack, tile)
            if not all(game.owners.get(item.id) == bot.user_id for item in group):
                continue
            levels = {item.id: game.building_levels.get(item.id, 0) for item in group}
            minimum_level = min(levels.values())
            maximum_level = max(levels.values())
            if maximum_level <= 0 or maximum_level - minimum_level > 1:
                continue
            targets = [item for item in group if levels[item.id] == maximum_level]
            if any(levels[item.id] == 5 for item in targets):
                houses_required = 4 * sum(levels[item.id] == 5 for item in targets)
                if game.houses_remaining < houses_required:
                    continue
            refund = sum(
                (
                    item.hotel_cost
                    if levels[item.id] == 5 and item.hotel_cost is not None
                    else item.build_cost or 0
                )
                * pack.manifest.building_sell_percent
                // 100
                for item in targets
            )
            sellable_groups.append((refund, maximum_level, tile.group))
        if sellable_groups:
            _, _, group_id = max(sellable_groups)
            return BotAction(
                bot.user_id,
                SellGroupRoundCommand(
                    action="sell_group_round",
                    group_id=group_id,
                ),
                "liquidate_group_round_for_debt",
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
            return BotAction(
                bot.user_id,
                CounterTradeCommand(
                    action="counter_trade",
                    trade_id=trade.id,
                    offered_cash=assessment.counter.offered_cash,
                    requested_cash=assessment.counter.requested_cash,
                    offered_property_ids=assessment.counter.offered_property_ids,
                    requested_property_ids=assessment.counter.requested_property_ids,
                ),
                assessment.reason,
            )
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

    @staticmethod
    def _trade_availability_action(
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction | None:
        unavailable = set(game.trade_unavailable_property_ids)
        for tile in pack.board.tiles:
            if game.owners.get(tile.id) != bot.user_id:
                continue
            available = engine.should_offer_property_for_trade(bot.user_id, tile)
            if available == (tile.id not in unavailable):
                continue
            return BotAction(
                bot.user_id,
                SetPropertyTradeAvailabilityCommand(
                    action="set_property_trade_availability",
                    property_id=tile.id,
                    available=available,
                ),
                (
                    "enable_spare_for_trade"
                    if available
                    else "protect_strategic_property"
                ),
            )
        return None

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
        if worthwhile and game.settings.rules.loans_enabled:
            target_reserve = floor // 2 if completes else floor
            required_credit = max(1, price + target_reserve - bot.balance)
            offer = credit_offer(game, pack, bot)
            financed_cost = price + (
                required_credit * offer.interest_percent + 99
            ) // 100
            if (
                required_credit <= offer.maximum_amount
                and (
                    completes
                    or value * 100
                    >= financed_cost * profile.buy_required_percent
                )
            ):
                return BotAction(
                    bot.user_id,
                    RequestLoanCommand(
                        action="request_loan",
                        amount=required_credit,
                    ),
                    "finance_strategic_property",
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
        seen_groups: set[str] = set()
        for tile in pack.board.tiles:
            if tile.group is None or tile.group in seen_groups:
                continue
            seen_groups.add(tile.group)
            group = self._group_tiles(pack, tile)
            if not all(game.owners.get(item.id) == bot.user_id for item in group):
                continue
            if any(item.id in game.mortgaged_property_ids for item in group):
                continue
            levels = {item.id: game.building_levels.get(item.id, 0) for item in group}
            minimum_level = min(levels.values())
            maximum_level = max(levels.values())
            if minimum_level >= 5 or maximum_level - minimum_level > 1:
                continue
            targets = [item for item in group if levels[item.id] == minimum_level]
            total_cost = sum(
                (
                    item.hotel_cost
                    if minimum_level == 4 and item.hotel_cost is not None
                    else item.build_cost or 0
                )
                for item in targets
            )
            supply_available = (
                game.hotels_remaining >= len(targets)
                if minimum_level == 4
                else game.houses_remaining >= len(targets)
            )
            if supply_available and total_cost > 0 and bot.balance - total_cost >= reserve:
                rent_score = sum(
                    item.rent_levels[min(minimum_level + 1, len(item.rent_levels) - 1)]
                    if item.rent_levels
                    else engine.expected_rent(item, bot.user_id)
                    for item in targets
                )
                candidates.append((rent_score, -total_cost, tile.group))
        if not candidates:
            return None
        group_id = max(candidates)[2]
        return BotAction(
            bot.user_id,
            BuildGroupRoundCommand(
                action="build_group_round",
                group_id=group_id,
            ),
            "develop_complete_group_round",
        )

    def _financial_action(
        self,
        game: GameState,
        pack: ContentPack,
        engine: NegotiationEngine,
        bot: PlayerState,
    ) -> BotAction | None:
        if self._financial_action_during_current_turn(game, bot.user_id):
            return None
        floor = engine.liquidity_floor(bot)
        loan = next(
            (item for item in game.bank.loans if item.player_id == bot.user_id),
            None,
        )
        repayment_action = None
        if loan is not None:
            amount = min(loan.installment_amount, loan.remaining_balance)
            if bot.balance - amount >= floor:
                repayment_action = BotAction(
                    bot.user_id,
                    RepayLoanCommand(action="repay_loan", amount=amount),
                    "repay_credit_while_liquid",
                )
        if not game.settings.rules.stock_market_enabled:
            return repayment_action
        personality = bot.bot_personality or BotPersonality.BALANCED
        reserve_percent = {
            BotPersonality.CONSERVATIVE: 100,
            BotPersonality.BALANCED: 75,
            BotPersonality.AGGRESSIVE: 50,
            BotPersonality.NEGOTIATOR: 75,
        }[personality]
        required_reserve = floor * reserve_percent // 100
        candidates = []
        for instrument in game.bank.investments:
            held = instrument.holdings.get(bot.user_id, 0)
            maximum = max(
                1,
                instrument.total_shares
                * instrument.max_ownership_percent
                // 100,
            )
            quote = market_order_quote(instrument, 1, buying=True)
            fee = (
                quote.gross * instrument.transaction_fee_percent + 99
            ) // 100
            cost = quote.gross + fee
            historic_dividend = instrument.dividends_paid // instrument.total_shares
            attractively_priced = (
                instrument.current_price * 100 <= instrument.base_price * 120
                or historic_dividend * 100 >= instrument.current_price * 5
            )
            if loan is not None:
                credit = game.bank.credit_profiles.get(bot.user_id)
                required_reserve = (
                    loan.installment_amount
                    * pack.manifest.loan_investment_installment_reserve
                    + pack.manifest.pass_start_salary
                    * pack.manifest.loan_investment_reserve_salary_percent
                    // 100
                )
                exposure = sum(
                    item.current_price * item.holdings.get(bot.user_id, 0)
                    for item in game.bank.investments
                )
                exposure_limit = max(
                    0,
                    (
                        engine.net_worth(bot)
                        + exposure
                        - loan.remaining_balance
                    )
                    * pack.manifest.loan_investment_max_net_worth_percent
                    // 100,
                )
                attractively_priced = (
                    attractively_priced
                    and credit is not None
                    and credit.score >= 600
                    and bot.bot_personality is BotPersonality.AGGRESSIVE
                    and instrument.current_price <= instrument.base_price
                    and bot.balance - cost >= required_reserve
                    and exposure + quote.gross <= exposure_limit
                )
            if (
                instrument.available_shares > 0
                and held < maximum
                and bot.balance - cost >= required_reserve
                and attractively_priced
            ):
                candidates.append(
                    (
                        historic_dividend * 100
                        + instrument.base_price * 100 // instrument.current_price,
                        -instrument.current_price,
                        instrument,
                    )
                )
        if not candidates:
            return repayment_action
        instrument = max(
            candidates,
            key=lambda item: (item[0], item[1], item[2].id),
        )[2]
        return BotAction(
            bot.user_id,
            BuySharesCommand(
                action="buy_shares",
                instrument_id=instrument.id,
                quantity=1,
            ),
            "invest_surplus_cash_at_fair_value",
        )

    # --------------------------------------------------------------- utilities

    @staticmethod
    def _purchase_price(game: GameState, tile: TileDefinition) -> int:
        price = tile.price or 0
        discount = game.pending_purchase_discount_percent
        if discount:
            price -= price * discount // 100
        return price

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
    def _financial_action_during_current_turn(
        game: GameState,
        player_id: UUID,
    ) -> bool:
        marker = 0
        player_text = str(player_id)
        for event in game.events:
            if event.type == "turn.started" and event.data.get("player_id") == player_text:
                marker = event.sequence
        return any(
            event.sequence > marker
            and event.type
            in {
                "bank.loan_issued",
                "bank.loan_payment",
                "investment.shares_bought",
                "investment.shares_sold",
            }
            and event.data.get("player_id") == player_text
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
