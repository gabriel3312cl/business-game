import type {
  GameEvent,
  GameState,
  InvestmentInstrumentState,
} from '../types'
import type { MarketPoint } from './marketData'

interface TrackedPosition {
  quantity: number
  costBasis: number
  capitalDeployed: number
  realizedProfit: number
  dividends: number
}

export interface InstrumentPerformance {
  instrument: InvestmentInstrumentState
  shares: number
  averageCost: number
  costBasis: number
  currentValue: number
  unrealizedProfit: number
  realizedProfit: number
  dividends: number
  totalProfit: number
  returnPercent: number
  estimatedCostBasis: boolean
}

export interface PortfolioPerformance {
  positions: InstrumentPerformance[]
  currentValue: number
  costBasis: number
  unrealizedProfit: number
  realizedProfit: number
  dividends: number
  pendingDividendUnits: number
  totalProfit: number
  returnPercent: number
  concentrationPercent: number
  history: MarketPoint[]
}

function numberData(event: GameEvent, key: string): number {
  const value = event.data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function textData(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}

function positionFor(
  positions: Map<string, TrackedPosition>,
  instrumentId: string,
): TrackedPosition {
  const current = positions.get(instrumentId)
  if (current) return current
  const created: TrackedPosition = {
    quantity: 0,
    costBasis: 0,
    capitalDeployed: 0,
    realizedProfit: 0,
    dividends: 0,
  }
  positions.set(instrumentId, created)
  return created
}

function recordPurchase(
  position: TrackedPosition,
  quantity: number,
  cost: number,
): void {
  if (quantity <= 0 || cost < 0) return
  position.quantity += quantity
  position.costBasis += cost
  position.capitalDeployed += cost
}

function recordSale(
  position: TrackedPosition,
  quantity: number,
  proceeds: number,
): void {
  if (quantity <= 0 || proceeds < 0 || position.quantity <= 0) return
  const sold = Math.min(quantity, position.quantity)
  const removedCost = (position.costBasis * sold) / position.quantity
  position.quantity -= sold
  position.costBasis -= removedCost
  position.realizedProfit += proceeds - removedCost
}

function applyTradeEvent(
  event: GameEvent,
  playerId: string,
  positions: Map<string, TrackedPosition>,
): boolean {
  const instrumentId = textData(event, 'instrument_id')
  if (!instrumentId) return false
  const position = positionFor(positions, instrumentId)
  const quantity = numberData(event, 'quantity')
  if (
    event.type === 'investment.shares_bought' &&
    textData(event, 'player_id') === playerId
  ) {
    recordPurchase(
      position,
      quantity,
      numberData(event, 'gross') + numberData(event, 'fee'),
    )
    return true
  }
  if (
    event.type === 'investment.shares_sold' &&
    textData(event, 'player_id') === playerId
  ) {
    recordSale(position, quantity, numberData(event, 'proceeds'))
    return true
  }
  if (event.type !== 'investment.order_filled') return false
  if (
    textData(event, 'buyer_id') === playerId &&
    event.data.buy_order_id !== null &&
    event.data.buy_order_id !== undefined
  ) {
    recordPurchase(
      position,
      quantity,
      numberData(event, 'gross') + numberData(event, 'buyer_fee'),
    )
    return true
  }
  if (
    textData(event, 'seller_id') === playerId &&
    event.data.sell_order_id !== null &&
    event.data.sell_order_id !== undefined
  ) {
    recordSale(
      position,
      quantity,
      numberData(event, 'gross') - numberData(event, 'seller_fee'),
    )
    return true
  }
  return false
}

function applyDividendEvent(
  event: GameEvent,
  playerId: string,
  positions: Map<string, TrackedPosition>,
): boolean {
  let changed = false
  const instrumentPayouts = event.data.instrument_payouts
  if (instrumentPayouts && typeof instrumentPayouts === 'object') {
    for (const [instrumentId, rawPayouts] of Object.entries(instrumentPayouts)) {
      if (!rawPayouts || typeof rawPayouts !== 'object') continue
      const payout = (rawPayouts as Record<string, unknown>)[playerId]
      if (typeof payout !== 'number' || !Number.isFinite(payout)) continue
      positionFor(positions, instrumentId).dividends += payout
      changed = true
    }
  }
  const instrumentId = textData(event, 'instrument_id')
  const payouts = event.data.payouts
  if (instrumentId && payouts && typeof payouts === 'object') {
    const payout = (payouts as Record<string, unknown>)[playerId]
    if (typeof payout === 'number' && Number.isFinite(payout)) {
      positionFor(positions, instrumentId).dividends += payout
      changed = true
    }
  }
  return changed
}

function reservedSellShares(
  game: GameState,
  playerId: string,
  instrumentId: string,
): number {
  return game.bank.market_orders
    .filter(
      (order) =>
        order.player_id === playerId &&
        order.instrument_id === instrumentId &&
        order.side === 'sell',
    )
    .reduce((total, order) => total + order.remaining_quantity, 0)
}

export function buildPortfolioPerformance(
  game: GameState,
  playerId: string,
): PortfolioPerformance {
  const tracked = new Map<string, TrackedPosition>()
  const prices = new Map(
    game.bank.investments.map((instrument) => [
      instrument.id,
      instrument.base_price,
    ]),
  )
  const indexInstrument = game.bank.investments.find(
    (instrument) => instrument.instrument_kind === 'index',
  )
  const indexComponents = game.bank.investments.filter(
    (instrument) => instrument.instrument_kind !== 'index',
  )
  const history: MarketPoint[] = [{ sequence: 0, value: 0 }]
  for (const event of [...game.events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const instrumentId = textData(event, 'instrument_id')
    const newPrice = numberData(event, 'new_price')
    let priceChanged = false
    if (instrumentId && newPrice > 0 && prices.has(instrumentId)) {
      prices.set(instrumentId, newPrice)
      priceChanged = true
      if (indexInstrument && indexComponents.length > 0) {
        prices.set(
          indexInstrument.id,
          Math.max(
            1,
            Math.round(
              indexComponents.reduce(
                (total, component) =>
                  total +
                  ((prices.get(component.id) ?? component.base_price) * 100) /
                    Math.max(1, component.base_price),
                0,
              ) / indexComponents.length,
            ),
          ),
        )
      }
    }
    const tradeChanged = applyTradeEvent(event, playerId, tracked)
    const dividendChanged = applyDividendEvent(event, playerId, tracked)
    if (!priceChanged && !tradeChanged && !dividendChanged) continue
    const value = [...tracked.entries()].reduce(
      (total, [id, position]) =>
        total +
        position.quantity * (prices.get(id) ?? 0) -
        position.costBasis +
        position.realizedProfit +
        position.dividends,
      0,
    )
    history.push({ sequence: event.sequence, value })
  }

  const positions = game.bank.investments
    .map((instrument): InstrumentPerformance | null => {
      const shares =
        (instrument.holdings[playerId] ?? 0) +
        reservedSellShares(game, playerId, instrument.id)
      const position = positionFor(tracked, instrument.id)
      if (shares <= 0 && position.realizedProfit === 0 && position.dividends === 0) {
        return null
      }
      let costBasis = position.costBasis
      let capitalDeployed = position.capitalDeployed
      let estimatedCostBasis = false
      if (position.quantity !== shares) {
        if (position.quantity > shares && position.quantity > 0) {
          costBasis *= shares / position.quantity
        } else {
          const missingShares = Math.max(0, shares - position.quantity)
          const fallbackCost = missingShares * instrument.current_price
          costBasis += fallbackCost
          capitalDeployed += fallbackCost
        }
        estimatedCostBasis = true
      }
      const currentValue = shares * instrument.current_price
      const unrealizedProfit = currentValue - costBasis
      const totalProfit =
        unrealizedProfit + position.realizedProfit + position.dividends
      return {
        instrument,
        shares,
        averageCost: shares > 0 ? costBasis / shares : 0,
        costBasis,
        currentValue,
        unrealizedProfit,
        realizedProfit: position.realizedProfit,
        dividends: position.dividends,
        totalProfit,
        returnPercent:
          capitalDeployed > 0 ? (totalProfit * 100) / capitalDeployed : 0,
        estimatedCostBasis,
      }
    })
    .filter((position): position is InstrumentPerformance => position !== null)
    .sort((left, right) => right.currentValue - left.currentValue)

  const currentValue = positions.reduce(
    (total, position) => total + position.currentValue,
    0,
  )
  const costBasis = positions.reduce(
    (total, position) => total + position.costBasis,
    0,
  )
  const unrealizedProfit = positions.reduce(
    (total, position) => total + position.unrealizedProfit,
    0,
  )
  const realizedProfit = positions.reduce(
    (total, position) => total + position.realizedProfit,
    0,
  )
  const dividends = positions.reduce(
    (total, position) => total + position.dividends,
    0,
  )
  const capitalDeployed = Math.max(
    costBasis,
    [...tracked.values()].reduce(
      (total, position) => total + position.capitalDeployed,
      0,
    ),
  )
  const totalProfit = unrealizedProfit + realizedProfit + dividends
  return {
    positions,
    currentValue,
    costBasis,
    unrealizedProfit,
    realizedProfit,
    dividends,
    pendingDividendUnits: game.bank.investments.reduce(
      (total, instrument) =>
        total + (instrument.pending_dividend_units[playerId] ?? 0),
      0,
    ),
    totalProfit,
    returnPercent:
      capitalDeployed > 0 ? (totalProfit * 100) / capitalDeployed : 0,
    concentrationPercent:
      currentValue > 0
        ? (Math.max(0, ...positions.map((position) => position.currentValue)) *
            100) /
          currentValue
        : 0,
    history: history.slice(-60),
  }
}
