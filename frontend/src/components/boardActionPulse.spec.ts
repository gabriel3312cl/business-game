import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../types'
import { affectedTileIds, type BoardActionContext } from './boardActionPulse'

const context: BoardActionContext = {
  tileIds: new Set(['start', 'station', 'property-a', 'property-b']),
  startTileId: 'start',
  tradePropertyIds: new Map([
    ['trade-1', ['property-a', 'property-b', 'missing', 'property-a']],
  ]),
}

function event(type: GameEvent['type'], data: Record<string, unknown>): GameEvent {
  return {
    sequence: 1,
    type,
    occurred_at: '2026-08-06T12:00:00Z',
    data,
  }
}

describe('affectedTileIds', () => {
  it.each([
    ['property.purchased', { tile_id: 'property-a' }],
    ['property.mortgaged', { property_id: 'property-a' }],
    ['building.purchased', { property_id: 'property-a' }],
    ['building.sold', { property_id: 'property-a' }],
    ['auction.completed', { property_id: 'property-a' }],
    ['payment.completed', { tile_id: 'property-a' }],
    ['debt.paid', { tile_id: 'property-a' }],
    ['investment.shares_bought', { tile_id: 'property-a' }],
  ] satisfies [GameEvent['type'], Record<string, unknown>][]) (
    'resolves %s to its board tile',
    (type, data) => {
      expect(affectedTileIds(event(type, data), context)).toEqual(['property-a'])
    },
  )

  it('resolves salary collection to the start tile', () => {
    expect(affectedTileIds(event('salary.collected', {}), context)).toEqual([
      'start',
    ])
  })

  it('resolves every property transferred by an accepted trade', () => {
    expect(
      affectedTileIds(event('trade.accepted', { trade_id: 'trade-1' }), context),
    ).toEqual(['property-a', 'property-b'])
  })

  it('ignores identifiers that are not board tiles', () => {
    expect(
      affectedTileIds(event('payment.completed', { tile_id: 'card-7' }), context),
    ).toEqual([])
    expect(
      affectedTileIds(event('card.cash_applied', { card_id: 'card-7' }), context),
    ).toEqual([])
  })
})
