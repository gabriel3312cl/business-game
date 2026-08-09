import type {
  BoardHistoricalStats,
  PropertyHistoricalStats,
  TileDefinition,
} from '../types'

export type HistoricalAssessmentLevel =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'insufficient'

export interface HistoricalPropertyAssessment {
  level: HistoricalAssessmentLevel
  reason: 'frequent_and_fair' | 'expensive' | 'infrequent' | 'mixed' | 'insufficient'
}

export interface HistoricalPropertySummary {
  landings: number
  landingPercent: number
  rentPayments: number
  totalRent: number
  averageRent: number
}

export function historicalProperty(
  history: BoardHistoricalStats | null,
  tileId: string,
): PropertyHistoricalStats | null {
  return history?.properties.find((item) => item.tile_id === tileId) ?? null
}

export function assessHistoricalProperty(
  tile: TileDefinition,
  stats: PropertyHistoricalStats | null,
  history: BoardHistoricalStats | null,
  tileCount: number,
  consideredPrice: number,
): HistoricalPropertyAssessment {
  if (!history || history.game_count < 3 || !stats || stats.landings < 5) {
    return { level: 'insufficient', reason: 'insufficient' }
  }
  const averageTileShare = 100 / Math.max(1, tileCount)
  const relativeFrequency = stats.landing_percent / averageTileShare
  const priceReference =
    stats.auction_sales > 0
      ? stats.average_auction_price
      : stats.average_purchase_price > 0
        ? stats.average_purchase_price
        : (tile.price ?? consideredPrice)
  if (priceReference > 0 && consideredPrice > priceReference * 1.1) {
    return { level: 'negative', reason: 'expensive' }
  }
  if (relativeFrequency >= 1.1 && consideredPrice <= priceReference) {
    return { level: 'positive', reason: 'frequent_and_fair' }
  }
  if (relativeFrequency < 0.8) {
    return { level: 'negative', reason: 'infrequent' }
  }
  return { level: 'neutral', reason: 'mixed' }
}

export function summarizeHistoricalProperties(
  history: BoardHistoricalStats | null,
  propertyIds: string[],
): HistoricalPropertySummary {
  const items = propertyIds.flatMap((propertyId) => {
    const item = historicalProperty(history, propertyId)
    return item ? [item] : []
  })
  const rentPayments = items.reduce((sum, item) => sum + item.rent_payments, 0)
  const totalRent = items.reduce((sum, item) => sum + item.total_rent, 0)
  return {
    landings: items.reduce((sum, item) => sum + item.landings, 0),
    landingPercent: Number(
      items.reduce((sum, item) => sum + item.landing_percent, 0).toFixed(2),
    ),
    rentPayments,
    totalRent,
    averageRent: rentPayments > 0 ? Math.round(totalRent / rentPayments) : 0,
  }
}
