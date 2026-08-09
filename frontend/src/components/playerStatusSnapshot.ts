import type { ContentPack, GameState } from '../types'
import { buildGameAnalytics } from './gameAnalytics'
import { buildPortfolioPerformance } from './portfolioPerformance'

export interface PlayerStatusSnapshot {
  cash: number
  netWorth: number
  totalDebt: number
  portfolioReturnPercent: number
  hasPortfolioActivity: boolean
}

export function buildPlayerStatusSnapshot(
  game: GameState,
  pack: ContentPack,
  playerId: string,
): PlayerStatusSnapshot | null {
  const player = buildGameAnalytics(game, pack).players.find(
    (entry) => entry.player.user_id === playerId,
  )
  if (!player) return null

  const portfolio = buildPortfolioPerformance(game, playerId)
  return {
    cash: player.cash,
    netWorth: player.estimatedNetWorth,
    totalDebt: player.totalDebt,
    portfolioReturnPercent: portfolio.returnPercent,
    hasPortfolioActivity: portfolio.positions.length > 0,
  }
}
