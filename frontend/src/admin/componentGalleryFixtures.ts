import board from './fixtures/extended-demo/board.json'
import messages from './fixtures/extended-demo/locales/es.json'
import manifest from './fixtures/extended-demo/manifest.json'
import type {
  ContentPack,
  GameState,
  InteractiveChoiceCardEffect,
  TokenAppearanceSettings,
  User,
} from '../types'

export const SHOWCASE_USER = {
  id: 'showcase-user',
  email: 'batman@example.com',
  display_name: 'Batman',
  locale: 'es',
  role: 'admin',
  is_active: true,
  created_at: '2026-08-01T12:00:00Z',
} satisfies User

export const SHOWCASE_PACK = {
  manifest,
  board,
  messages,
} as unknown as ContentPack

export const SHOWCASE_TOKEN: TokenAppearanceSettings = {
  color: '#70e1ff',
  secondary_color: '#ff8ad8',
  fill: 'gradient',
  gradient_angle: 135,
  pattern: 'dots',
  shape: 'hexagon',
  icon: 'emoji',
  emoji: '🦇',
}

const players: GameState['players'] = [
  player(SHOWCASE_USER.id, SHOWCASE_USER.display_name, 24_500, false, null),
  player('showcase-bot-1', 'Bot Equilibrado 1', 18_200, true, 'balanced'),
  player('showcase-bot-2', 'Bot Negociador 2', 13_900, true, 'negotiator'),
  player('showcase-player-2', 'Camila', 9_800, false, null),
]

export const SHOWCASE_GAME: GameState = {
  id: 'showcase-game',
  host_user_id: SHOWCASE_USER.id,
  pack_id: SHOWCASE_PACK.manifest.id,
  pack_version: SHOWCASE_PACK.manifest.version,
  deck_collection_ids: Object.fromEntries(
    SHOWCASE_PACK.board.decks.map((deck) => [deck.id, deck.default_collection_ids]),
  ),
  status: 'playing',
  players,
  spectators: [{ user_id: 'showcase-spectator', display_name: 'Observador' }],
  settings: {
    max_players: 20,
    allow_spectators: true,
    auction_deposit_percent: 10,
    auction_minimum_bid_percent: 70,
    economic_difficulty: 'standard',
    advanced_economy_enabled: true,
    operating_cost_percent: 4,
    finale_trigger_week: 140,
    finale_duration_weeks: 12,
    finale_vote_interval_weeks: 8,
    rules: {
      auction_unpurchased_properties: true,
      free_parking_jackpot: true,
      double_salary_on_start: false,
      loans_enabled: true,
      stock_market_enabled: true,
      custom_rent_debts_enabled: true,
    },
  },
  economy: {
    current_date: '2026-08-13',
    elapsed_weeks: 37,
    season: 'winter',
    weather: 'rain',
    weather_intensity: 2,
    cycle: 'expansion',
    annual_growth_basis_points: 280,
    annual_inflation_basis_points: 410,
    policy_rate_basis_points: 525,
    unemployment_basis_points: 780,
    consumer_confidence: 68,
    market_sentiment: 74,
    active_events: [{ kind: 'innovation_boom', remaining_weeks: 2, intensity: 2 }],
    forecast_events: [{ kind: 'credit_tightening', starts_in_weeks: 2, duration_weeks: 3, intensity: 1 }],
    price_index_basis_points: 10_410,
    inflation_base_week: 0,
    next_operating_cost_week: 40,
    operating_cost_assessment: {
      due_week: 40,
      announced_week: 37,
      amounts: { [SHOWCASE_USER.id]: 620 },
      resolved_player_ids: [],
    },
    operating_debts: [],
    next_public_project_week: 42,
    public_projects: [],
    next_finale_vote_week: 140,
    finale_vote: null,
    finale: null,
    last_market_movements: [],
    last_company_action: 'expansion',
    last_company_instrument_id: 'instrument-reading',
  },
  current_player_index: 0,
  phase: 'waiting_for_roll',
  owners: {
    property_01: SHOWCASE_USER.id,
    property_03: SHOWCASE_USER.id,
    property_33: 'showcase-bot-2',
    transport_06: 'showcase-bot-1',
    property_35: 'showcase-player-2',
  },
  pending_tile_id: null,
  pending_purchase_discount_percent: 0,
  pending_auction_selector_id: null,
  pending_auction_minimum_bid: null,
  active_auction: null,
  active_debt: {
    debtor_id: SHOWCASE_USER.id,
    creditor_id: 'showcase-bot-2',
    amount: 1_200,
    reason: 'rent',
    tile_id: 'property_33',
    installment_plan_id: 'showcase-plan',
    plan_proposal: null,
    collection_demanded: false,
  },
  rent_debt_plans: [
    {
      id: 'showcase-plan',
      debtor_id: SHOWCASE_USER.id,
      creditor_id: 'showcase-bot-2',
      tile_id: 'property_33',
      original_amount: 1_200,
      interest_percent: 10,
      total_amount: 1_320,
      remaining_amount: 880,
      installments_total: 3,
      installments_remaining: 2,
      template: 'standard',
      created_at_sequence: 8,
      reason: 'rent',
      source_trade_id: null,
    },
  ],
  pending_card_payments: [],
  pending_card_draw: null,
  pending_card_choice: null,
  pending_card_choice_result: null,
  bank: {
    initialized: true,
    monetary_base: 41_160,
    cash: 29_600,
    emergency_issuance: 0,
    dividend_cash_reserve: 1_400,
    dividend_unfunded_units: 0,
    market_round: 12,
    minimum_reserve_percent: 20,
    loans: [
      {
        id: 'showcase-loan',
        player_id: 'showcase-player-2',
        principal: 5_000,
        interest_amount: 750,
        interest_paid: 150,
        interest_percent: 15,
        remaining_balance: 4_600,
        installment_amount: 575,
        installments_remaining: 8,
        scheduled_payments_made: 2,
        issued_at_sequence: 4,
      },
    ],
    credit_profiles: Object.fromEntries(
      players.map((item, index) => [
        item.user_id,
        {
          score: 720 - index * 35,
          successful_loans: index,
          on_time_payments: index * 2,
          late_payments: 0,
          defaults: 0,
          total_borrowed: index * 2_500,
          current_interest_percent: 15 + index,
          current_limit: 8_000 - index * 500,
          maximum_term_laps: 10,
        },
      ]),
    ),
    investments: [
      investment('instrument-index', 'start_00', 'Índice general', 'index', 125, 116),
      investment('instrument-reading', 'transport_06', 'Reading Railroad', 'asset', 320, 285),
      investment('instrument-marvin', 'property_33', 'Marvin Gardens', 'asset', 410, 392),
    ],
    market_orders: [],
  },
  bank_pot: 1_250,
  mortgaged_property_ids: ['property_35'],
  trade_unavailable_property_ids: [],
  building_levels: { property_01: 3, property_03: 3, property_33: 5 },
  houses_remaining: 42,
  hotels_remaining: 16,
  consecutive_doubles: 0,
  extra_roll_pending: false,
  bank_auction_queue: [],
  last_card_id: null,
  trades: [
    {
      id: 'showcase-trade',
      proposer_id: 'showcase-bot-1',
      recipient_id: SHOWCASE_USER.id,
      offered_cash: 2_000,
      requested_cash: 500,
      offered_property_ids: ['transport_06'],
      requested_property_ids: ['property_01'],
      parent_trade_id: null,
      status: 'pending',
      created_at: '2026-08-13T21:45:00Z',
      resolved_at: null,
    },
  ],
  bot_relationships: [
    {
      bot_id: 'showcase-bot-1',
      player_id: SHOWCASE_USER.id,
      score: 18,
      interaction_count: 4,
      last_reason: 'trade.accepted',
      last_event_sequence: 11,
    },
  ],
  last_roll: [3, 5],
  events: [
    event(1, 'game.started', {}, '2026-08-13T20:00:00Z'),
    event(2, 'turn.started', { player_id: SHOWCASE_USER.id }),
    event(3, 'dice.rolled', {
      player_id: SHOWCASE_USER.id,
      dice: [3, 5],
      tile_id: 'property_03',
    }),
    event(4, 'property.purchased', { player_id: SHOWCASE_USER.id, property_id: 'property_01', price: 60 }),
    event(5, 'trade.proposed', { proposer_id: 'showcase-bot-1', recipient_id: SHOWCASE_USER.id }),
    event(6, 'investment.shares_bought', { player_id: SHOWCASE_USER.id, instrument_id: 'instrument-reading', quantity: 2 }),
  ],
  event_sequence: 6,
  events_complete: true,
}

export function auctionGame(phase: 'idle' | 'bidding'): GameState {
  return {
    ...SHOWCASE_GAME,
    active_debt: null,
    active_auction: {
      id: `showcase-auction-${phase}`,
      property_id: 'property_33',
      phase,
      minimum_bid: 196,
      current_bid: phase === 'bidding' ? 420 : 0,
      current_bidder_id: phase === 'bidding' ? 'showcase-bot-2' : null,
      bid_deadline: new Date(Date.now() + (phase === 'bidding' ? 14_000 : 28_000)).toISOString(),
      deposit_amount: 28,
      deposits: { [SHOWCASE_USER.id]: 28, 'showcase-bot-2': 28 },
      eligible_player_ids: players.map((item) => item.user_id),
      ready_player_ids: phase === 'bidding' ? players.map((item) => item.user_id) : [SHOWCASE_USER.id],
      passed_player_ids: [],
      seller_id: null,
    },
    events: [
      ...SHOWCASE_GAME.events,
      event(7, 'auction.started', { property_id: 'property_33' }),
      ...(phase === 'bidding'
        ? [event(8, 'auction.bid_placed', { property_id: 'property_33', player_id: 'showcase-bot-2', amount: 420 })]
        : []),
    ],
  }
}

export function cardDrawGame(revealed: boolean): GameState {
  const deck = SHOWCASE_PACK.board.decks[0]
  const card = deck.cards[0]
  return {
    ...SHOWCASE_GAME,
    active_debt: null,
    pending_card_draw: {
      player_id: SHOWCASE_USER.id,
      deck_id: deck.id,
      card_id: revealed ? card.id : null,
      selected_index: revealed ? 1 : null,
      offer_count: 3,
      draw_sequence: 18,
      reveal_sequence: revealed ? 19 : null,
    },
  }
}

export function cardChoiceGame(showResult: boolean): GameState {
  const card = SHOWCASE_PACK.board.decks
    .flatMap((deck) => deck.cards)
    .find((candidate) => {
      const effect = candidate.effect ?? candidate.effects?.[0]
      return effect?.type === 'interactive_choice'
    })!
  const effect = (card.effect ?? card.effects?.find((item) => item.type === 'interactive_choice')) as InteractiveChoiceCardEffect
  const pending = {
    player_id: SHOWCASE_USER.id,
    card_id: card.id,
    effect,
  }
  return {
    ...SHOWCASE_GAME,
    active_debt: null,
    pending_card_choice: showResult ? null : pending,
    pending_card_choice_result: showResult
      ? {
          ...pending,
          choice_id: effect.choices[0].id,
          choice_label_key: effect.choices[0].label_key,
          result_key: effect.choices[0].outcomes[0].result_key,
          resolved_sequence: 22,
        }
      : null,
  }
}

export function finishedGame(): GameState {
  return {
    ...SHOWCASE_GAME,
    status: 'finished',
    active_debt: null,
    events: [
      ...SHOWCASE_GAME.events,
      event(
        20,
        'game.finished',
        {
          winner_id: SHOWCASE_USER.id,
          scores: {
            [SHOWCASE_USER.id]: 81_200,
            'showcase-bot-1': 64_900,
            'showcase-bot-2': 53_500,
            'showcase-player-2': 42_300,
          },
        },
        '2026-08-13T22:11:00Z',
      ),
    ],
  }
}

function player(
  userId: string,
  displayName: string,
  balance: number,
  isBot: boolean,
  personality: GameState['players'][number]['bot_personality'],
): GameState['players'][number] {
  return {
    user_id: userId,
    display_name: displayName,
    appearance_slot: null,
    is_bot: isBot,
    bot_personality: personality,
    bot_controller: isBot ? 'standard' : null,
    position: 0,
    balance,
    pending_dividend_units: 0,
    bankrupt: false,
    in_jail: false,
    jail_failed_rolls: 0,
    jail_card_ids: [],
  }
}

function investment(
  id: string,
  tileId: string,
  name: string,
  kind: GameState['bank']['investments'][number]['instrument_kind'],
  currentPrice: number,
  basePrice: number,
): GameState['bank']['investments'][number] {
  return {
    id,
    tile_id: tileId,
    name_key: name,
    instrument_kind: kind,
    total_shares: 20,
    available_shares: 14,
    base_price: basePrice,
    current_price: currentPrice,
    dividend_percent: 30,
    transaction_fee_percent: 1,
    revenue_fee_percent: 5,
    max_ownership_percent: 30,
    spread_percent: 1,
    holdings: { [SHOWCASE_USER.id]: 2, 'showcase-bot-1': 4 },
    gross_revenue: 3_200,
    period_revenue: 760,
    dividends_paid: 420,
    dividends_accrued_units: 0,
    pending_dividend_units: {},
    last_settlement_sequence: 5,
    buy_volume: 9,
    sell_volume: 3,
    trade_volume: 12,
    trade_count: 5,
    last_trade_price: currentPrice - 2,
    session_high: currentPrice + 18,
    session_low: currentPrice - 22,
  }
}

function event(
  sequence: number,
  type: GameState['events'][number]['type'],
  data: Record<string, unknown>,
  occurredAt = `2026-08-13T21:${String(sequence).padStart(2, '0')}:00Z`,
): GameState['events'][number] {
  return { sequence, type, data, occurred_at: occurredAt }
}
