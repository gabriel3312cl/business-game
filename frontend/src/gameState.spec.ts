import { describe, expect, it } from 'vitest'
import { mergeGameState } from './gameState'
import type { GameEvent, GameState } from './types'

function gameState(
  sequence: number,
  events: GameEvent[],
  eventsComplete: boolean,
): GameState {
  return {
    id: 'game-1',
    event_sequence: sequence,
    events,
    events_complete: eventsComplete,
  } as GameState
}

function event(sequence: number): GameEvent {
  return {
    sequence,
    type: 'game.created',
    occurred_at: '2026-08-06T00:00:00Z',
    data: {},
  }
}

describe('mergeGameState', () => {
  it('preserves complete history when a bounded delta arrives', () => {
    const current = gameState(2, [event(1), event(2)], true)
    const next = gameState(3, [event(2), event(3)], false)

    const merged = mergeGameState(current, next)

    expect(merged.events.map((item) => item.sequence)).toEqual([1, 2, 3])
    expect(merged.events_complete).toBe(true)
  })

  it('ignores a stale snapshot', () => {
    const current = gameState(3, [event(1), event(2), event(3)], true)
    const stale = gameState(2, [event(2)], false)

    expect(mergeGameState(current, stale)).toBe(current)
  })
})
