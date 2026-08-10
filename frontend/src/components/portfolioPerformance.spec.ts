import { describe, expect, it } from 'vitest'
import type { GameEvent, GameState, InvestmentInstrumentState } from '../types'
import { buildPortfolioPerformance } from './portfolioPerformance'

const playerId = '00000000-0000-4000-8000-000000000001'

function instrument(): InvestmentInstrumentState {
  return {
    id: 'market:metro',
    tile_id: 'metro',
    name_key: 'metro',
    instrument_kind: 'asset',
    total_shares: 20,
    available_shares: 15,
    base_price: 20,
    current_price: 30,
    dividend_percent: 30,
    transaction_fee_percent: 1,
    revenue_fee_percent: 0,
    max_ownership_percent: 30,
    spread_percent: 1,
    holdings: { [playerId]: 3 },
    gross_revenue: 50,
    period_revenue: 0,
    dividends_paid: 4,
    dividends_accrued_units: 45_000,
    pending_dividend_units: { [playerId]: 2_500 },
    last_settlement_sequence: 4,
    buy_volume: 5,
    sell_volume: 2,
    trade_volume: 7,
    trade_count: 3,
    last_trade_price: 30,
    session_high: 32,
    session_low: 20,
  }
}

function event(
  sequence: number,
  type: GameEvent['type'],
  data: Record<string, unknown>,
): GameEvent {
  return { sequence, type, occurred_at: new Date().toISOString(), data }
}

function game(events: GameEvent[]): GameState {
  return {
    id: 'game',
    events,
    bank: {
      initialized: true,
      monetary_base: 10_000,
      cash: 8_000,
      emergency_issuance: 0,
      dividend_cash_reserve: 0,
      dividend_unfunded_units: 2_500,
      minimum_reserve_percent: 10,
      market_round: 1,
      loans: [],
      credit_profiles: {},
      investments: [instrument()],
      market_orders: [],
    },
  } as unknown as GameState
}

describe('buildPortfolioPerformance', () => {
  it('separates realized, unrealized, and dividend returns', () => {
    const result = buildPortfolioPerformance(
      game([
        event(1, 'investment.shares_bought', {
          player_id: playerId,
          instrument_id: 'market:metro',
          quantity: 5,
          gross: 100,
          fee: 1,
          new_price: 24,
        }),
        event(2, 'investment.shares_sold', {
          player_id: playerId,
          instrument_id: 'market:metro',
          quantity: 2,
          gross: 60,
          fee: 0,
          proceeds: 60,
          new_price: 30,
        }),
        event(3, 'investment.dividends_settled', {
          instrument_payouts: { 'market:metro': { [playerId]: 4 } },
        }),
      ]),
      playerId,
    )

    expect(result.currentValue).toBe(90)
    expect(result.costBasis).toBeCloseTo(60.6)
    expect(result.unrealizedProfit).toBeCloseTo(29.4)
    expect(result.realizedProfit).toBeCloseTo(19.6)
    expect(result.dividends).toBe(4)
    expect(result.totalProfit).toBeCloseTo(53)
    expect(result.pendingDividendUnits).toBe(2_500)
  })

  it('counts a filled limit order once and includes reserved sell shares', () => {
    const current = game([
      event(1, 'investment.order_filled', {
        instrument_id: 'market:metro',
        buyer_id: playerId,
        seller_id: 'other',
        quantity: 2,
        gross: 50,
        buyer_fee: 1,
        seller_fee: 0,
        buy_order_id: 'buy-order',
        sell_order_id: 'sell-order',
        new_price: 25,
      }),
    ])
    current.bank.investments[0].holdings[playerId] = 1
    current.bank.market_orders = [
      {
        id: 'open-sell',
        instrument_id: 'market:metro',
        player_id: playerId,
        side: 'sell',
        limit_price: 35,
        original_quantity: 1,
        remaining_quantity: 1,
        reserved_cash: 0,
        created_at_sequence: 2,
      },
    ]

    const result = buildPortfolioPerformance(current, playerId)

    expect(result.positions[0].shares).toBe(2)
    expect(result.positions[0].costBasis).toBe(51)
    expect(result.positions[0].estimatedCostBasis).toBe(false)
  })
})
