import type { GameEvent } from '../types'

export interface BoardActionContext {
  tileIds: ReadonlySet<string>
  startTileId?: string
  tradePropertyIds: ReadonlyMap<string, readonly string[]>
}

const TILE_ID_EVENTS = new Set<GameEvent['type']>([
  'property.purchased',
  'payment.completed',
  'debt.created',
  'debt.collection_demanded',
  'debt.forgiven',
  'debt.installment_paid',
  'debt.paid',
  'debt.plan_accepted',
  'debt.plan_completed',
  'debt.plan_proposed',
  'free_parking.collected',
  'investment.dividend_paid',
  'investment.institution_revenue',
  'investment.shares_bought',
  'investment.shares_sold',
])

const PROPERTY_ID_EVENTS = new Set<GameEvent['type']>([
  'property.declined',
  'property.mortgaged',
  'property.unmortgaged',
  'building.purchased',
  'building.sold',
  'auction.started',
  'auction.bid_placed',
  'auction.player_passed',
  'auction.completed',
])

export function affectedTileIds(
  event: GameEvent,
  context: BoardActionContext,
): string[] {
  if (event.type === 'salary.collected') {
    return context.startTileId ? [context.startTileId] : []
  }

  if (event.type === 'trade.accepted') {
    const tradeId = textValue(event, 'trade_id')
    return tradeId
      ? validTileIds(context.tradePropertyIds.get(tradeId) ?? [], context.tileIds)
      : []
  }

  if (TILE_ID_EVENTS.has(event.type)) {
    const tileId = textValue(event, 'tile_id')
    return tileId && context.tileIds.has(tileId) ? [tileId] : []
  }

  if (PROPERTY_ID_EVENTS.has(event.type)) {
    const propertyId = textValue(event, 'property_id')
    return propertyId && context.tileIds.has(propertyId) ? [propertyId] : []
  }

  return []
}

function validTileIds(
  candidates: readonly string[],
  tileIds: ReadonlySet<string>,
): string[] {
  return [...new Set(candidates.filter((tileId) => tileIds.has(tileId)))]
}

function textValue(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' && value ? value : null
}
