import { describe, expect, it } from 'vitest'
import type { BoardHistoricalStats } from '../types'
import { buildBoardHistoricalHeatmap } from './boardHeatmap'

describe('buildBoardHistoricalHeatmap', () => {
  it('normalizes aggregated landings from all previous board games', () => {
    const history: BoardHistoricalStats = {
      pack_id: 'classic-demo',
      game_count: 3,
      movement_count: 8,
      position_landings: [1, 0, 2, 5],
      properties: [],
    }

    const heatmap = buildBoardHistoricalHeatmap(history, 4)

    expect(heatmap.total).toBe(8)
    expect(heatmap.cells.get(0)).toEqual({ value: 1, intensity: 0.2 })
    expect(heatmap.cells.has(1)).toBe(false)
    expect(heatmap.cells.get(3)).toEqual({ value: 5, intensity: 1 })
  })
})
