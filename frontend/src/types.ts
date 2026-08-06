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
  default_rules: OptionalRules
  configurable_rules: RuleOptionName[]
}

export type CardEffect =
  | { type: 'cash'; amount: number }
  | { type: 'move_to'; tile_id: string; collect_start: boolean }
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
}

export interface TileDefinition {
  id: string
  kind: TileKind
  name_key: string
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

export interface PanelLayoutPreferences {
  order: PanelId[]
  zones: Record<PanelId, PanelZone>
  heights: Partial<Record<PanelId, number>>
}

export interface AudioPreferenceSettings {
  muted: boolean
  volume: number
  disabled_sounds: string[]
}

export type TokenShape = 'circle' | 'rounded' | 'diamond'
export type TokenIcon =
  | 'number'
  | 'micro'
  | 'bus'
  | 'completo'
  | 'terremoto'
  | 'cerro'
  | 'cat'

export interface TokenAppearanceSettings {
  color: string
  shape: TokenShape
  icon: TokenIcon
}

export interface UserPreferences {
  panel_layout: PanelLayoutPreferences | null
  audio_settings: AudioPreferenceSettings | null
  token_appearance: TokenAppearanceSettings | null
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
  is_bot: boolean
  bot_personality: BotPersonality | null
  bot_controller: BotController | null
  position: number
  balance: number
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
}

export type RuleOptionName = keyof OptionalRules

export interface GameSettings {
  max_players: number | null
  allow_spectators: boolean
  rules: OptionalRules
}

export interface CardPaymentState {
  payer_id: string
  recipient_id: string
  amount: number
  card_id: string
}

export interface AuctionState {
  property_id: string
  minimum_bid: number
  current_bid: number
  current_bidder_id: string | null
  bid_deadline: string | null
  eligible_player_ids: string[]
  passed_player_ids: string[]
}

export interface DebtState {
  debtor_id: string
  creditor_id: string | null
  amount: number
  reason: 'rent' | 'tax' | 'card' | 'jail_fine' | 'resignation'
  tile_id: string
}

export interface TradeOffer {
  id: string
  proposer_id: string
  recipient_id: string
  offered_cash: number
  requested_cash: number
  offered_property_ids: string[]
  requested_property_ids: string[]
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  created_at: string
  resolved_at: string | null
}

export interface TradeAnalysis {
  trade_id: string
  perspective: 'proposer' | 'recipient'
  verdict: 'accept' | 'counter' | 'reject'
  reason_code: string
  estimated_gain: number
  estimated_cost: number
  estimated_surplus: number
  cash_after: number
  liquidity_floor: number
  snapshot_sequence: number
}

export type GameEventType =
  | 'auction.bid_placed'
  | 'auction.completed'
  | 'auction.player_passed'
  | 'auction.started'
  | 'bank_pot.increased'
  | 'building.purchased'
  | 'building.sold'
  | 'card.cash_applied'
  | 'card.cash_each_applied'
  | 'card.deck_empty'
  | 'card.drawn'
  | 'card.player_moved'
  | 'card.repairs_assessed'
  | 'card.utility_dice_rolled'
  | 'debt.created'
  | 'debt.paid'
  | 'dice.rolled'
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
  | 'payment.completed'
  | 'player.bankrupt'
  | 'player.joined'
  | 'player.left'
  | 'player.resigned'
  | 'property.declined'
  | 'property.mortgaged'
  | 'property.purchased'
  | 'property.unmortgaged'
  | 'spectator.joined'
  | 'spectator.left'
  | 'salary.collected'
  | 'trade.accepted'
  | 'trade.cancelled'
  | 'trade.proposed'
  | 'trade.rejected'
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
  | { action: 'sell_building'; property_id: string }
  | { action: 'pay_debt' }
  | { action: 'declare_bankruptcy' }
  | {
      action: 'propose_trade'
      recipient_id: string
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
  status: 'lobby' | 'playing' | 'finished' | 'cancelled'
  players: PlayerState[]
  spectators: SpectatorState[]
  settings: GameSettings
  current_player_index: number
  phase: 'waiting_for_roll' | 'buy_decision' | 'waiting_for_end'
  owners: Record<string, string>
  pending_tile_id: string | null
  pending_purchase_discount_percent: number
  pending_auction_selector_id: string | null
  pending_auction_minimum_bid: number | null
  active_auction: AuctionState | null
  active_debt: DebtState | null
  pending_card_payments: CardPaymentState[]
  bank_pot: number
  mortgaged_property_ids: string[]
  building_levels: Record<string, number>
  houses_remaining: number
  hotels_remaining: number
  consecutive_doubles: number
  extra_roll_pending: boolean
  deck_orders: Record<string, string[]>
  deck_cursors: Record<string, number>
  bank_auction_queue: string[]
  last_card_id: string | null
  trades: TradeOffer[]
  last_roll: [number, number] | null
  events: GameEvent[]
}
