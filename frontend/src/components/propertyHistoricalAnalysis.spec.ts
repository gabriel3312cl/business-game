import { describe, expect, it } from 'vitest'
import type { BoardHistoricalStats, TileDefinition } from '../types'
import {
  assessHistoricalProperty,
  summarizeHistoricalProperties,
} from './propertyHistoricalAnalysis'

const tile: TileDefinition = {
  id: 'property_03',
  kind: 'property',
  name_key: 'tile.property_03',
  price: 100,
}

const history: BoardHistoricalStats = {
  pack_id: 'classic-demo',
  game_count: 5,
  movement_count: 100,
  position_landings: [],
  properties: [
    {
      tile_id: tile.id,
      landings: 10,
      landing_percent: 10,
      rent_payments: 4,
      total_rent: 80,
      average_rent: 20,
      purchases: 2,
      average_purchase_price: 100,
      auction_sales: 2,
      average_auction_price: 90,
    },
  ],
}

describe('property historical analysis', () => {
  it('recommends caution when the bid exceeds the historical reference', () => {
    expect(
      assessHistoricalProperty(tile, history.properties[0], history, 20, 100),
    ).toEqual({ level: 'negative', reason: 'expensive' })
  })

  it('summarizes only the properties included in a trade side', () => {
    expect(summarizeHistoricalProperties(history, [tile.id])).toEqual({
      landings: 10,
      landingPercent: 10,
      rentPayments: 4,
      totalRent: 80,
      averageRent: 20,
    })
  })
})
