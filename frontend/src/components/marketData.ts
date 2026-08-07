import type { GameEvent, InvestmentInstrumentState } from '../types'

export interface MarketPoint {
  sequence: number
  value: number
}

export interface MarketOrderQuote {
  gross: number
  averagePrice: number
  newPrice: number
  fee: number
  settlement: number
  spreadPercent: number
  priceImpactPercent: number
}

const PRICE_EVENT_TYPES = new Set<GameEvent['type']>([
  'investment.dividend_paid',
  'investment.institution_revenue',
  'investment.shares_bought',
  'investment.shares_sold',
  'investment.order_filled',
])

export function buildInstrumentHistory(
  instrument: InvestmentInstrumentState,
  events: GameEvent[],
): MarketPoint[] {
  const points: MarketPoint[] = [
    { sequence: 0, value: instrument.base_price },
  ]
  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (
      !PRICE_EVENT_TYPES.has(event.type) ||
      event.data.instrument_id !== instrument.id ||
      typeof event.data.new_price !== 'number'
    ) {
      continue
    }
    points.push({ sequence: event.sequence, value: event.data.new_price })
  }
  return points.slice(-60)
}

export function buildMarketIndexHistory(
  instruments: InvestmentInstrumentState[],
  events: GameEvent[],
): MarketPoint[] {
  if (instruments.length === 0) return []
  const components = instruments.filter(
    (instrument) => instrument.instrument_kind !== 'index',
  )
  if (components.length === 0) return []
  const prices = new Map(
    components.map((instrument) => [instrument.id, instrument.base_price]),
  )
  const instrumentsById = new Map(
    components.map((instrument) => [instrument.id, instrument]),
  )
  const indexValue = () =>
    components.reduce(
      (total, instrument) =>
        total +
        ((prices.get(instrument.id) ?? instrument.base_price) * 100) /
          Math.max(1, instrument.base_price),
      0,
    ) / components.length
  const points: MarketPoint[] = [{ sequence: 0, value: indexValue() }]

  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const instrumentId = event.data.instrument_id
    const newPrice = event.data.new_price
    if (
      !PRICE_EVENT_TYPES.has(event.type) ||
      typeof instrumentId !== 'string' ||
      !instrumentsById.has(instrumentId) ||
      typeof newPrice !== 'number'
    ) {
      continue
    }
    prices.set(instrumentId, newPrice)
    points.push({ sequence: event.sequence, value: indexValue() })
  }
  return points.slice(-60)
}

export function marketOrderQuote(
  instrument: InvestmentInstrumentState,
  quantity: number,
  buying: boolean,
  oppositeOrderDepth = 0,
): MarketOrderQuote {
  const midPrice = instrument.current_price
  const volume = instrument.buy_volume + instrument.sell_volume
  const imbalance = Math.abs(instrument.buy_volume - instrument.sell_volume)
  const imbalanceBonus = Math.min(
    3,
    Math.floor((imbalance * 3) / Math.max(1, volume)),
  )
  const priceRange = Math.max(0, instrument.session_high - instrument.session_low)
  const volatilityBonus = Math.min(
    3,
    Math.floor((priceRange * 10) / Math.max(1, midPrice)),
  )
  const liquidDepth = instrument.available_shares + oppositeOrderDepth
  const liquidityBonus =
    liquidDepth * 4 < instrument.total_shares
      ? 2
      : liquidDepth * 2 < instrument.total_shares
        ? 1
        : 0
  const spreadPercent = Math.min(
    8,
    Math.max(
      0,
      instrument.spread_percent +
        imbalanceBonus +
        volatilityBonus +
        liquidityBonus,
    ),
  )
  const spread = Math.round((midPrice * spreadPercent) / 100)
  const executionPrice = buying
    ? midPrice + spread
    : Math.max(1, midPrice - spread)
  const gross = executionPrice * quantity
  const marketDepth = buying
    ? instrument.available_shares + oppositeOrderDepth
    : Math.max(
        Math.floor(instrument.total_shares / 2),
        instrument.total_shares - instrument.available_shares,
      ) + oppositeOrderDepth
  const impactBasisPoints = Math.min(
    500,
    Math.floor((quantity * 1000) / Math.max(1, marketDepth)),
  )
  const movement =
    instrument.instrument_kind === 'index'
      ? 0
      : Math.floor((midPrice * impactBasisPoints + 5000) / 10_000)
  const newPrice = buying
    ? midPrice + movement
    : Math.max(1, midPrice - movement)
  const fee = buying
    ? Math.ceil((gross * instrument.transaction_fee_percent) / 100)
    : Math.floor((gross * instrument.transaction_fee_percent) / 100)
  return {
    gross,
    averagePrice: executionPrice,
    newPrice,
    fee,
    settlement: buying ? gross + fee : gross - fee,
    spreadPercent,
    priceImpactPercent: impactBasisPoints / 100,
  }
}
