import { describe, expect, it } from 'vitest'
import type { BoardHistoricalStats } from '../types'
import {
  boardHeatmapColor,
  buildBoardHistoricalHeatmap,
  buildHistoryHeatmap,
} from './boardHeatmap'

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
    expect(heatmap.cells.get(0)).toEqual({ value: 1, intensity: 0 })
    expect(heatmap.cells.has(1)).toBe(false)
    expect(heatmap.cells.get(3)).toEqual({ value: 5, intensity: 1 })
  })

  it('spreads non-zero values across the full visual range', () => {
    const heatmap = buildHistoryHeatmap(
      [
        movementEvent(1, 0),
        movementEvent(2, 1),
        movementEvent(3, 1),
        movementEvent(4, 2),
        movementEvent(5, 2),
        movementEvent(6, 2),
        movementEvent(7, 2),
        movementEvent(8, 2),
      ],
      3,
      null,
      1,
      8,
    )

    expect(heatmap.cells.get(0)?.intensity).toBe(0)
    expect(heatmap.cells.get(1)?.intensity).toBeCloseTo(0.5)
    expect(heatmap.cells.get(2)?.intensity).toBe(1)
  })

  it('uses visibly different palette endpoints', () => {
    expect(boardHeatmapColor(0)).toBe('rgb(72, 40, 120)')
    expect(boardHeatmapColor(0.5)).toBe('rgb(31, 158, 137)')
    expect(boardHeatmapColor(1)).toBe('rgb(253, 231, 37)')
  })
})

function movementEvent(sequence: number, position: number) {
  return {
    sequence,
    occurred_at: '2026-08-10T12:00:00Z',
    type: 'dice.rolled' as const,
    data: {
      player_id: 'player-1',
      to_position: position,
    },
  }
}
