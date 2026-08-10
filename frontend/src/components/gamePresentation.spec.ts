import { describe, expect, it } from 'vitest'
import type { GameState } from '../types'
import { presentedGameSnapshot } from './gamePresentation'

function game(id: string, sequence: number): GameState {
  return { id, event_sequence: sequence } as GameState
}

describe('presentedGameSnapshot', () => {
  it('keeps the last settled snapshot while token motion is pending', () => {
    const settled = game('game-1', 10)
    const authoritative = game('game-1', 13)

    expect(presentedGameSnapshot(settled, authoritative, true)).toBe(settled)
  })

  it('releases the newest authoritative snapshot after motion settles', () => {
    const settled = game('game-1', 10)
    const authoritative = game('game-1', 13)

    expect(presentedGameSnapshot(settled, authoritative, false)).toBe(
      authoritative,
    )
  })

  it('never carries a settled snapshot into another game', () => {
    const settled = game('game-1', 10)
    const authoritative = game('game-2', 1)

    expect(presentedGameSnapshot(settled, authoritative, true)).toBe(
      authoritative,
    )
  })
})
