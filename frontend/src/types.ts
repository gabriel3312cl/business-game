export type BoardMode = 'classic' | 'extended' | 'custom'

export type TileKind =
  | 'start'
  | 'property'
  | 'tax'
  | 'card'
  | 'jail'
  | 'go_to_jail'
  | 'free'
  | 'transport'
  | 'utility'

export type TileIcon =
  | 'flag'
  | 'bank'
  | 'gavel'
  | 'question'
  | 'police'
  | 'weekend'
  | 'train'
  | 'bolt'
  | 'ticket'
  | 'star'
  | 'money'
  | 'home'
  | 'store'
  | 'gift'
  | 'car'
  | 'plane'

export type TileIconBackground = 'circle' | 'rounded' | 'square' | 'none'

export interface PackManifest {
  schema_version: 4 | 5
  id: string
  version: string
  name_key: string
  board_mode: BoardMode
  side_length: number
  tile_count: number
  default_locale: string
  locales: string[]
  min_players: number
  max_players: number
  starting_balance: number
  pass_start_salary: number
  mortgage_interest_percent: number
  building_sell_percent: number
  monopoly_rent_multiplier: number
  jail_fine: number
  jail_max_failed_rolls: number
  max_consecutive_doubles: number
  house_supply: number
  hotel_supply: number
  bank_money_supply: number | null
  bank_minimum_reserve_percent: number
  loan_interest_percent: number
  loan_term_laps: number
  loan_max_term_laps: number
  loan_salary_payment_percent: number
  investment_share_count: number
  investment_dividend_percent: number
  investment_transaction_fee_percent: number
  investment_revenue_fee_percent: number
  investment_max_ownership_percent: number
  investment_spread_percent: number
  loan_investment_max_net_worth_percent: number
  loan_investment_reserve_salary_percent: number
  loan_investment_installment_reserve: number
  default_rules: OptionalRules
  configurable_rules: RuleOptionName[]
}

export type ImmediateCardEffect =
  | { type: 'cash'; amount: number }
  | {
      type: 'move_to'
      tile_id?: string | null
      tile_tag?: string | null
      collect_start: boolean
    }
  | {
      type: 'move_relative'
      steps: number
      collect_start: boolean
      purchase_discount_percent?: number | null
    }
  | {
      type: 'move_to_nearest'
      tile_kind: 'transport' | 'utility'
      collect_start: boolean
      rent_multiplier: number
      dice_multiplier: number | null
    }
  | { type: 'repairs'; house_amount: number; hotel_amount: number }
  | { type: 'cash_each'; amount: number }
  | { type: 'go_to_jail' }
  | { type: 'get_out_of_jail' }
  | { type: 'move_to_nearest_auction' }
  | {
      type: 'complete_groups_cash'
      threshold: number
      amount_if_at_least: number
      amount_otherwise: number
    }
  | { type: 'owned_properties_cash'; amount_per_property: number }
  | { type: 'mortgaged_properties_cash'; amount_per_property: number }
  | { type: 'refinance_mortgage' }
  | { type: 'salary_cash'; salary_percent: number }
  | { type: 'equalize_cash'; target: 'wealthiest' | 'poorest' }
  | { type: 'swap_position'; target: 'wealthiest' | 'poorest' }
  | {
      type: 'all_players_move_relative'
      steps: number
      collect_start: boolean
    }

export interface CardChoiceOutcomeDefinition {
  weight: number
  result_key: string
  effects: ImmediateCardEffect[]
}

export interface CardChoiceOptionDefinition {
  id: string
  label_key: string
  outcomes: CardChoiceOutcomeDefinition[]
}

export type CardChoiceCategory =
  | 'scam'
  | 'lottery'
  | 'employment'
  | 'contest'
  | 'social'
  | 'mystery'

export interface InteractiveChoiceCardEffect {
  type: 'interactive_choice'
  prompt_key: string
  category: CardChoiceCategory
  choices: CardChoiceOptionDefinition[]
}

export type CardEffect = ImmediateCardEffect | InteractiveChoiceCardEffect

export interface CardDefinition {
  id: string
  message_key: string
  title_key?: string
  effect?: CardEffect
  effects?: CardEffect[]
}

export interface CardDeckDefinition {
  id: string
  name_key?: string
  cards: CardDefinition[]
  collections: CardCollectionDefinition[]
  default_collection_ids: string[]
}

export interface CardCollectionDefinition {
  id: string
  name_key: string
  card_ids: string[]
}

export interface TileDefinition {
  id: string
  kind: TileKind
  name_key: string
  card_tags?: string[]
  deck_id?: string
  group?: string
  color?: string
  icon?: TileIcon
  icon_background?: TileIconBackground
  asset_path?: string
  purchasable?: boolean
  price?: number
  base_rent?: number
  mortgage_value?: number
  build_cost?: number
  hotel_cost?: number
  rent_levels?: number[]
  rent_multipliers?: number[]
  amount?: number
  net_worth_percent?: number
  complete_group_amount?: number
  house_amount?: number
  hotel_amount?: number
  auction_minimum_bid?: number
  landing_effects?: CardEffect[]
}

export interface ContentPack {
  manifest: PackManifest
  board: {
    tiles: TileDefinition[]
    decks: CardDeckDefinition[]
    groups?: Array<{ id: string; name_key: string; color: string }>
  }
  messages: Record<string, string>
}

export interface User {
  id: string
  email: string
  display_name: string
  locale: string
  is_active: boolean
  created_at: string
}

export type PanelId = 'room' | 'heatmap' | 'players' | 'management' | 'chat'
export type PanelZone = 'left' | 'right'
export type ManagementPanelId =
  | 'properties'
  | 'trades'
  | 'debts'
  | 'bank'
  | 'market'
export type WorkspacePanelId =
  | 'room'
  | 'heatmap'
  | 'players'
  | ManagementPanelId
  | 'chat'
export type WorkspacePanelPlacement = 'left' | 'right' | 'floating'

export interface WorkspacePanelWindowGeometry {
  x: number
  y: number
  width: number
  height: number
}

export interface ManagementPanelLayoutPreferences {
  order: ManagementPanelId[]
  visible: ManagementPanelId[]
  heights: Partial<Record<ManagementPanelId, number>>
}

export interface WorkspacePanelLayoutPreferences {
  compact: boolean
  order: WorkspacePanelId[]
  visible: WorkspacePanelId[]
  heights: Partial<Record<WorkspacePanelId, number>>
  placements: Record<WorkspacePanelId, WorkspacePanelPlacement>
  windows: Partial<Record<WorkspacePanelId, WorkspacePanelWindowGeometry>>
}

export interface PanelLayoutPreferences {
  order: PanelId[]
  zones: Record<PanelId, PanelZone>
  heights: Partial<Record<PanelId, number>>
  management: ManagementPanelLayoutPreferences
  rail?: WorkspacePanelLayoutPreferences | null
}

export interface AudioPreferenceSettings {
  muted: boolean
  volume: number
  disabled_sounds: string[]
}

export type TokenShape =
  | 'circle'
  | 'rounded'
  | 'diamond'
  | 'hexagon'
  | 'shield'
  | 'star'
export type TokenFillMode = 'solid' | 'gradient' | 'pattern'
export type TokenPattern = 'dots' | 'stripes' | 'checker' | 'waves'
export type TokenIcon =
  | 'number'
  | 'micro'
  | 'bus'
  | 'completo'
  | 'terremoto'
  | 'cerro'
  | 'cat'
  | 'emoji'

export interface TokenAppearanceSettings {
  color: string
  secondary_color: string
  fill: TokenFillMode
  gradient_angle: number
  pattern: TokenPattern
  shape: TokenShape
  icon: TokenIcon
  emoji: string | null
}

export interface AutomationPreferenceSettings {
  auto_reject_trades: boolean
  auto_roll_dice: boolean
  auto_end_turns: boolean
}

export type VisualEffectsIntensity = 'full' | 'soft' | 'off'

export interface VisualEffectsPreferenceSettings {
  intensity: VisualEffectsIntensity
}

export type PlayerSortOption = 'turnOrder' | 'netWorth' | 'cash' | 'name'

export interface UserPreferences {
  panel_layout: PanelLayoutPreferences | null
  audio_settings: AudioPreferenceSettings | null
  token_appearance: TokenAppearanceSettings | null
  automation_settings: AutomationPreferenceSettings | null
  visual_effects: VisualEffectsPreferenceSettings | null
  player_sort: PlayerSortOption | null
}

export interface TokenResponse {
  access_token: string
  user_id: string
  token_type: 'bearer'
}

export type BotPersonality =
  | 'conservative'
  | 'balanced'
  | 'aggressive'
  | 'negotiator'

export type BotController = 'standard' | 'ai'

export interface PlayerState {
  user_id: string
  display_name: string
  appearance_slot?: number | null
  is_bot: boolean
  bot_personality: BotPersonality | null
  bot_controller: BotController | null
  position: number
  balance: number
  pending_dividend_units: number
  bankrupt: boolean
  in_jail: boolean
  jail_failed_rolls: number
  jail_card_ids: string[]
}

export interface SpectatorState {
  user_id: string
  display_name: string
}

export interface OptionalRules {
  auction_unpurchased_properties: boolean
  free_parking_jackpot: boolean
  double_salary_on_start: boolean
  loans_enabled: boolean
  stock_market_enabled: boolean
  custom_rent_debts_enabled: boolean
}

export type RuleOptionName = keyof OptionalRules

export type EconomicDifficulty =
  | 'novice'
  | 'easy'
  | 'standard'
  | 'pro'
  | 'realistic'

export type EconomicSeason = 'summer' | 'autumn' | 'winter' | 'spring'
export type WeatherCondition =
  | 'clear'
  | 'rain'
  | 'storm'
  | 'heatwave'
  | 'cold_wave'
  | 'drought'
export type EconomicCycle = 'expansion' | 'slowdown' | 'recession' | 'recovery'

export interface EconomicEventState {
  kind:
    | 'innovation_boom'
    | 'supply_shock'
    | 'credit_tightening'
    | 'consumer_boom'
    | 'labor_dispute'
    | 'fiscal_stimulus'
  remaining_weeks: number
  intensity: number
}

export interface MarketMovementState {
  instrument_id: string
  previous_price: number
  current_price: number
  change_basis_points: number
  primary_cause: string
}

export interface EconomicSimulationState {
  current_date: string
  elapsed_weeks: number
  season: EconomicSeason
  weather: WeatherCondition
  weather_intensity: number
  cycle: EconomicCycle
  annual_growth_basis_points: number
  annual_inflation_basis_points: number
  policy_rate_basis_points: number
  unemployment_basis_points: number
  consumer_confidence: number
  market_sentiment: number
  active_events: EconomicEventState[]
  last_market_movements: MarketMovementState[]
  last_company_action: string | null
  last_company_instrument_id: string | null
}

export interface GameSettings {
  max_players: number | null
  allow_spectators: boolean
  auction_deposit_percent: number
  auction_minimum_bid_percent: number
  economic_difficulty: EconomicDifficulty
  rules: OptionalRules
}

export interface CardPaymentState {
  payer_id: string
  recipient_id: string
  amount: number
  card_id: string
}

export interface PendingCardChoiceState {
  player_id: string
  card_id: string
  effect: InteractiveChoiceCardEffect
}

export interface PendingCardChoiceResultState extends PendingCardChoiceState {
  choice_id: string
  choice_label_key: string
  result_key: string
  resolved_sequence: number
}

export interface PendingCardDrawState {
  player_id: string
  deck_id: string
  card_id: string | null
  selected_index: number | null
  offer_count: number
  draw_sequence: number
  reveal_sequence: number | null
}

export interface AuctionState {
  property_id: string
  minimum_bid: number
  current_bid: number
  current_bidder_id: string | null
  bid_deadline: string | null
  deposit_amount: number
  deposits: Record<string, number>
  eligible_player_ids: string[]
  passed_player_ids: string[]
}

export interface DebtState {
  debtor_id: string
  creditor_id: string | null
  amount: number
  reason:
    | 'rent'
    | 'rent_installment'
    | 'tax'
    | 'card'
    | 'jail_fine'
    | 'bank_loan'
    | 'resignation'
  tile_id: string
  installment_plan_id: string | null
  plan_proposal: RentDebtPlanProposal | null
  collection_demanded: boolean
}

export type RentDebtPlanTemplate =
  | 'friendly'
  | 'standard'
  | 'flexible'
  | 'custom'

export interface RentDebtPlanProposal {
  installments: number
  interest_percent: number
  template: RentDebtPlanTemplate
  requested_property_ids: string[]
}

export interface RentDebtPlanState {
  id: string
  debtor_id: string
  creditor_id: string
  tile_id: string
  original_amount: number
  interest_percent: number
  total_amount: number
  remaining_amount: number
  installments_total: number
  installments_remaining: number
  template: RentDebtPlanTemplate
  created_at_sequence: number
}

export interface BankLoanState {
  id: string
  player_id: string
  principal: number
  interest_amount: number
  interest_paid: number
  interest_percent: number
  remaining_balance: number
  installment_amount: number
  installments_remaining: number
  scheduled_payments_made: number
  issued_at_sequence: number
}

export interface BankCreditProfileState {
  score: number
  successful_loans: number
  on_time_payments: number
  late_payments: number
  defaults: number
  total_borrowed: number
  current_interest_percent: number
  current_limit: number
  maximum_term_laps: number
}

export interface InvestmentInstrumentState {
  id: string
  tile_id: string
  name_key: string
  instrument_kind: 'asset' | 'bank' | 'jail' | 'tax' | 'index'
  total_shares: number
  available_shares: number
  base_price: number
  current_price: number
  dividend_percent: number
  transaction_fee_percent: number
  revenue_fee_percent: number
  max_ownership_percent: number
  spread_percent: number
  holdings: Record<string, number>
  gross_revenue: number
  period_revenue: number
  dividends_paid: number
  dividends_accrued_units: number
  pending_dividend_units: Record<string, number>
  last_settlement_sequence: number
  buy_volume: number
  sell_volume: number
  trade_volume: number
  trade_count: number
  last_trade_price: number | null
  session_high: number
  session_low: number
}

export interface MarketOrderState {
  id: string
  instrument_id: string
  player_id: string
  side: 'buy' | 'sell'
  limit_price: number
  original_quantity: number
  remaining_quantity: number
  reserved_cash: number
  created_at_sequence: number
}

export interface BankState {
  initialized: boolean
  monetary_base: number
  cash: number
  emergency_issuance: number
  dividend_cash_reserve: number
  dividend_unfunded_units: number
  market_round: number
  minimum_reserve_percent: number
  loans: BankLoanState[]
  credit_profiles: Record<string, BankCreditProfileState>
  investments: InvestmentInstrumentState[]
  market_orders: MarketOrderState[]
}

export interface TradeOffer {
  id: string
  proposer_id: string
  recipient_id: string
  offered_cash: number
  requested_cash: number
  offered_property_ids: string[]
  requested_property_ids: string[]
  parent_trade_id: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  created_at: string
  resolved_at: string | null
}

export interface BotRelationshipState {
  bot_id: string
  player_id: string
  score: number
  interaction_count: number
  last_reason: string | null
  last_event_sequence: number | null
}

export type TradeConvenienceLevel =
  | 'very_favorable'
  | 'favorable'
  | 'balanced'
  | 'unfavorable'
  | 'very_unfavorable'

export interface TradeSideAnalysis {
  player_id: string
  role: 'proposer' | 'recipient'
  verdict: 'accept' | 'counter' | 'reject'
  convenience_level: TradeConvenienceLevel
  reason_code: string
  estimated_gain: number
  estimated_cost: number
  estimated_surplus: number
  risk_adjusted_surplus: number
  cash_before: number
  cash_after: number
  liquidity_floor: number
  payment_probability_before: number
  payment_probability_after: number
  expected_payments_before: number
  expected_payments_after: number
  expected_rent_income_before: number
  expected_rent_income_after: number
  highest_payment_before: number
  highest_payment_after: number
}

export interface TradeAnalysis {
  trade_id: string
  perspective: 'proposer' | 'recipient'
  verdict: 'accept' | 'counter' | 'reject'
  convenience_level: TradeConvenienceLevel
  reason_code: string
  estimated_gain: number
  estimated_cost: number
  estimated_surplus: number
  risk_adjusted_surplus: number
  cash_after: number
  liquidity_floor: number
  proposer_analysis: TradeSideAnalysis
  recipient_analysis: TradeSideAnalysis
  snapshot_sequence: number
}

export interface PropertyHistoricalStats {
  tile_id: string
  landings: number
  landing_percent: number
  rent_payments: number
  total_rent: number
  average_rent: number
  purchases: number
  average_purchase_price: number
  auction_sales: number
  average_auction_price: number
}

export interface BoardHistoricalStats {
  pack_id: string
  game_count: number
  movement_count: number
  position_landings: number[]
  properties: PropertyHistoricalStats[]
}

export type GameEventType =
  | 'auction.bid_placed'
  | 'auction.completed'
  | 'auction.deposit_placed'
  | 'auction.deposit_refunded'
  | 'auction.player_passed'
  | 'auction.started'
  | 'bank_pot.increased'
  | 'bank.emergency_issued'
  | 'bank.loan_defaulted'
  | 'bank.loan_issued'
  | 'bank.loan_payment'
  | 'bank.loan_payment_missed'
  | 'building.purchased'
  | 'building.sold'
  | 'card.cash_applied'
  | 'card.cash_equalized'
  | 'card.cash_each_applied'
  | 'card.choice_presented'
  | 'card.choice_resolved'
  | 'card.choice_result_acknowledged'
  | 'card.continued'
  | 'card.deck_empty'
  | 'card.drawn'
  | 'card.player_moved'
  | 'card.repairs_assessed'
  | 'card.selection_started'
  | 'card.utility_dice_rolled'
  | 'debt.created'
  | 'debt.collection_demanded'
  | 'debt.forgiven'
  | 'debt.installment_paid'
  | 'debt.paid'
  | 'debt.plan_accepted'
  | 'debt.plan_cancelled'
  | 'debt.plan_completed'
  | 'debt.plan_proposed'
  | 'debt.plan_rejected'
  | 'dice.rolled'
  | 'economy.week_advanced'
  | 'game.cancelled'
  | 'game.created'
  | 'game.finished'
  | 'game.settings_updated'
  | 'game.started'
  | 'free_parking.collected'
  | 'host.transferred'
  | 'jail.entered'
  | 'jail.released'
  | 'jail.roll_failed'
  | 'investment.dividend_paid'
  | 'investment.dividends_settled'
  | 'investment.institution_revenue'
  | 'investment.limit_order_cancelled'
  | 'investment.limit_order_placed'
  | 'investment.order_filled'
  | 'investment.margin_call'
  | 'investment.market_expanded'
  | 'investment.position_liquidated'
  | 'investment.shares_bought'
  | 'investment.shares_sold'
  | 'payment.completed'
  | 'player.bankrupt'
  | 'player.joined'
  | 'player.left'
  | 'player.resigned'
  | 'property.declined'
  | 'property.mortgaged'
  | 'property.purchased'
  | 'property.trade_availability_changed'
  | 'property.unmortgaged'
  | 'spectator.joined'
  | 'spectator.left'
  | 'salary.collected'
  | 'trade.accepted'
  | 'trade.cancelled'
  | 'trade.countered'
  | 'trade.proposed'
  | 'trade.rejected'
  | 'relationship.changed'
  | 'turn.extra_roll'
  | 'turn.started'

export interface GameEvent {
  sequence: number
  type: GameEventType
  occurred_at: string
  data: Record<string, unknown>
}

export type GameCommand =
  | { action: 'roll' }
  | { action: 'buy_property' }
  | { action: 'decline_property' }
  | { action: 'end_turn' }
  | { action: 'bid'; amount: number }
  | { action: 'pass_auction' }
  | { action: 'select_auction_property'; property_id: string }
  | { action: 'pay_jail_fine' }
  | { action: 'use_jail_card' }
  | { action: 'mortgage_property'; property_id: string }
  | { action: 'unmortgage_property'; property_id: string }
  | { action: 'build_property'; property_id: string }
  | { action: 'build_group_round'; group_id: string }
  | { action: 'sell_building'; property_id: string }
  | { action: 'sell_group_round'; group_id: string }
  | { action: 'request_loan'; amount: number }
  | { action: 'repay_loan'; amount?: number | null }
  | { action: 'buy_shares'; instrument_id: string; quantity: number }
  | { action: 'sell_shares'; instrument_id: string; quantity: number }
  | {
      action: 'place_limit_order'
      instrument_id: string
      side: 'buy' | 'sell'
      quantity: number
      limit_price: number
    }
  | { action: 'cancel_market_order'; order_id: string }
  | { action: 'pay_debt' }
  | {
      action: 'pay_rent_debt_plan'
      plan_id: string
      payment_kind: 'installment' | 'full'
    }
  | { action: 'demand_rent_debt' }
  | { action: 'forgive_rent_debt' }
  | {
      action: 'propose_rent_debt_plan'
      installments: number
      interest_percent: number
      template: RentDebtPlanTemplate
      requested_property_ids: string[]
    }
  | { action: 'accept_rent_debt_plan' }
  | { action: 'reject_rent_debt_plan' }
  | { action: 'declare_bankruptcy' }
  | {
      action: 'set_property_trade_availability'
      property_id: string
      available: boolean
    }
  | { action: 'resolve_card_choice'; choice_id: string }
  | { action: 'continue_card_choice_result' }
  | { action: 'continue_card' }
  | { action: 'choose_card'; card_index: number }
  | {
      action: 'propose_trade'
      recipient_id: string
      offered_cash: number
      requested_cash: number
      offered_property_ids: string[]
      requested_property_ids: string[]
    }
  | {
      action: 'counter_trade'
      trade_id: string
      offered_cash: number
      requested_cash: number
      offered_property_ids: string[]
      requested_property_ids: string[]
    }
  | { action: 'accept_trade'; trade_id: string }
  | { action: 'reject_trade'; trade_id: string }
  | { action: 'cancel_trade'; trade_id: string }

export interface GameState {
  id: string
  host_user_id: string
  pack_id: string
  pack_version: string
  deck_collection_ids: Record<string, string[]>
  status: 'lobby' | 'playing' | 'finished' | 'cancelled'
  players: PlayerState[]
  spectators: SpectatorState[]
  settings: GameSettings
  economy: EconomicSimulationState
  current_player_index: number
  phase: 'waiting_for_roll' | 'buy_decision' | 'waiting_for_end'
  owners: Record<string, string>
  pending_tile_id: string | null
  pending_purchase_discount_percent: number
  pending_auction_selector_id: string | null
  pending_auction_minimum_bid: number | null
  active_auction: AuctionState | null
  active_debt: DebtState | null
  rent_debt_plans: RentDebtPlanState[]
  pending_card_payments: CardPaymentState[]
  pending_card_draw: PendingCardDrawState | null
  pending_card_choice: PendingCardChoiceState | null
  pending_card_choice_result: PendingCardChoiceResultState | null
  bank: BankState
  bank_pot: number
  mortgaged_property_ids: string[]
  trade_unavailable_property_ids: string[]
  building_levels: Record<string, number>
  houses_remaining: number
  hotels_remaining: number
  consecutive_doubles: number
  extra_roll_pending: boolean
  bank_auction_queue: string[]
  last_card_id: string | null
  trades: TradeOffer[]
  bot_relationships: BotRelationshipState[]
  last_roll: [number, number] | null
  events: GameEvent[]
  event_sequence: number
  events_complete: boolean
}
