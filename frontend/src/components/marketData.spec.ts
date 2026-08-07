import { describe, expect, it } from 'vitest'
import type { GameEvent, InvestmentInstrumentState } from '../types'
import {
  buildInstrumentHistory,
  buildMarketIndexHistory,
  marketOrderQuote,
} from './marketData'

const instrument = (
  id: string,
  basePrice: number,
  currentPrice: number,
): InvestmentInstrumentState => ({
  id,
  tile_id: id,
  name_key: id,
  instrument_kind: 'asset',
  total_shares: 10,
  available_shares: 8,
  base_price: basePrice,
  current_price: currentPrice,
  dividend_percent: 20,
  transaction_fee_percent: 2,
  revenue_fee_percent: 0,
  max_ownership_percent: 30,
  spread_percent: 2,
  holdings: {},
  gross_revenue: 0,
  period_revenue: 0,
  dividends_paid: 0,
  dividends_accrued_units: 0,
  pending_dividend_units: {},
  last_settlement_sequence: 0,
  buy_volume: 0,
  sell_volume: 0,
  trade_count: 0,
  last_trade_price: null,
  session_high: currentPrice,
  session_low: basePrice,
})

const priceEvent = (
  sequence: number,
  instrumentId: string,
  newPrice: number,
): GameEvent => ({
  sequence,
  type: 'investment.shares_bought',
  occurred_at: '2026-08-06T12:00:00Z',
  data: { instrument_id: instrumentId, new_price: newPrice },
})

describe('market data', () => {
  it('reconstructs an instrument price series in sequence order', () => {
    expect(
      buildInstrumentHistory(instrument('metro', 100, 120), [
        priceEvent(4, 'metro', 120),
        priceEvent(2, 'metro', 110),
        priceEvent(3, 'other', 999),
      ]),
    ).toEqual([
      { sequence: 0, value: 100 },
      { sequence: 2, value: 110 },
      { sequence: 4, value: 120 },
    ])
  })

  it('builds an equal-weight market index', () => {
    expect(
      buildMarketIndexHistory(
        [instrument('metro', 100, 120), instrument('bank', 200, 180)],
        [priceEvent(2, 'metro', 120), priceEvent(3, 'bank', 180)],
      ),
    ).toEqual([
      { sequence: 0, value: 100 },
      { sequence: 2, value: 110 },
      { sequence: 3, value: 105 },
    ])
  })

  it('matches the dynamic-spread server quote for buys and sells', () => {
    const item = instrument('metro', 100, 100)
    expect(marketOrderQuote(item, 2, true)).toEqual({
      gross: 204,
      averagePrice: 102,
      newPrice: 103,
      fee: 5,
      settlement: 209,
      spreadPercent: 2,
      priceImpactPercent: 2.5,
    })
    expect(marketOrderQuote(item, 2, false)).toEqual({
      gross: 196,
      averagePrice: 98,
      newPrice: 96,
      fee: 3,
      settlement: 193,
      spreadPercent: 2,
      priceImpactPercent: 4,
    })
  })
})
