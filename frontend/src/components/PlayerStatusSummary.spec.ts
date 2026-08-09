import { describe, expect, it } from 'vitest'
import type {
  ContentPack,
  GameEvent,
  GameState,
  InvestmentInstrumentState,
} from '../types'
import { buildPlayerStatusSnapshot } from './playerStatusSnapshot'

const playerId = '00000000-0000-4000-8000-000000000001'

function investment(): InvestmentInstrumentState {
  return {
    id: 'market:alpha',
    tile_id: 'alpha',
    name_key: 'alpha',
    instrument_kind: 'asset',
    total_shares: 20,
    available_shares: 18,
    base_price: 20,
    current_price: 30,
    dividend_percent: 0,
    transaction_fee_percent: 0,
    revenue_fee_percent: 0,
    max_ownership_percent: 30,
    spread_percent: 1,
    holdings: { [playerId]: 2 },
    gross_revenue: 0,
    period_revenue: 0,
    dividends_paid: 0,
    dividends_accrued_units: 0,
    pending_dividend_units: {},
    last_settlement_sequence: 1,
    buy_volume: 2,
    sell_volume: 0,
    trade_count: 1,
    last_trade_price: 20,
    session_high: 30,
    session_low: 20,
  }
}

function fixture(): { game: GameState; pack: ContentPack } {
  const investmentPurchase: GameEvent = {
    sequence: 1,
    type: 'investment.shares_bought',
    occurred_at: '2026-08-08T12:00:00Z',
    data: {
      player_id: playerId,
      instrument_id: 'market:alpha',
      quantity: 2,
      gross: 40,
      fee: 0,
      new_price: 20,
    },
  }
  const game = {
    id: 'game',
    players: [
      { user_id: playerId, display_name: 'Ada', balance: 900, bankrupt: false },
    ],
    owners: { alpha: playerId },
    mortgaged_property_ids: [],
    building_levels: { alpha: 2 },
    active_debt: {
      debtor_id: playerId,
      amount: 60,
      installment_plan_id: null,
    },
    rent_debt_plans: [{ debtor_id: playerId, remaining_amount: 40 }],
    bank: {
      loans: [{ player_id: playerId, remaining_balance: 100 }],
      investments: [investment()],
      market_orders: [],
    },
    events: [investmentPurchase],
  } as unknown as GameState
  const pack = {
    board: {
      tiles: [
        {
          id: 'alpha',
          kind: 'property',
          name_key: 'alpha',
          price: 200,
          build_cost: 50,
        },
      ],
      decks: [],
    },
  } as unknown as ContentPack
  return { game, pack }
}

describe('buildPlayerStatusSnapshot', () => {
  it('summarizes cash, net worth, all debt, and portfolio return', () => {
    const { game, pack } = fixture()

    expect(buildPlayerStatusSnapshot(game, pack, playerId)).toEqual({
      cash: 900,
      netWorth: 1060,
      totalDebt: 200,
      portfolioReturnPercent: 50,
      hasPortfolioActivity: true,
    })
  })

  it('does not expose another summary to a spectator', () => {
    const { game, pack } = fixture()

    expect(buildPlayerStatusSnapshot(game, pack, 'spectator')).toBeNull()
  })
})
