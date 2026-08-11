import { describe, expect, it } from 'vitest'
import type { GameState, TileDefinition } from '../types'
import { indexedAmount, indexedRent } from './economicValues'

const tile = {
  id: 'property-1',
  kind: 'property',
} as TileDefinition

function game(): GameState {
  return {
    settings: { advanced_economy_enabled: true },
    economy: {
      elapsed_weeks: 20,
      cycle: 'expansion',
      price_index_basis_points: 12_000,
      active_events: [],
      operating_debts: [],
    },
    owners: { [tile.id]: 'owner' },
  } as unknown as GameState
}

describe('advanced economic values', () => {
  it('applies full and partial inflation pass-through', () => {
    const state = game()

    expect(indexedAmount(state, 1_000)).toBe(1_200)
    expect(indexedAmount(state, 1_000, 80)).toBe(1_160)
  })

  it('combines rent inflation, the cycle, and operating-debt penalty', () => {
    const state = game()

    expect(indexedRent(state, tile, 100)).toBe(122)
    state.economy.operating_debts = [
      {
        player_id: 'owner',
        principal: 100,
        interest_percent: 10,
        remaining_amount: 110,
        created_week: 20,
      },
    ]
    expect(indexedRent(state, tile, 100)).toBe(92)
  })
})
