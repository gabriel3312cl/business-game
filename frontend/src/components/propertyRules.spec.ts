import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState, TileDefinition } from '../types'
import {
  buildGroupRoundAvailability,
  sellGroupRoundAvailability,
} from './propertyRules'

const actorId = 'player-1'
const groupTiles = ['a', 'b', 'c'].map(
  (id): TileDefinition =>
    ({
      id,
      kind: 'property',
      group: 'blue',
      build_cost: 50,
      hotel_cost: 50,
    }) as TileDefinition,
)
const pack = {
  manifest: { building_sell_percent: 50 },
} as ContentPack

function game(levels: number[], balance = 500): GameState {
  return {
    status: 'playing',
    current_player_index: 0,
    players: [{ user_id: actorId, balance }],
    owners: Object.fromEntries(groupTiles.map((tile) => [tile.id, actorId])),
    building_levels: Object.fromEntries(
      groupTiles.map((tile, index) => [tile.id, levels[index]]),
    ),
    mortgaged_property_ids: [],
    houses_remaining: 32,
    hotels_remaining: 12,
    active_auction: null,
    pending_auction_selector_id: null,
    active_debt: null,
  } as unknown as GameState
}

describe('property group rounds', () => {
  it('prices only the lowest properties needed to complete a build round', () => {
    expect(buildGroupRoundAvailability(game([2, 1, 1]), groupTiles, actorId)).toEqual({
      allowed: true,
      amount: 100,
      propertyCount: 2,
    })
  })

  it('prices only the highest properties needed to complete a sale round', () => {
    expect(
      sellGroupRoundAvailability(game([2, 2, 1]), pack, groupTiles, actorId),
    ).toEqual({
      allowed: true,
      amount: 50,
      propertyCount: 2,
    })
  })

  it('blocks the complete round when the player cannot afford it', () => {
    expect(
      buildGroupRoundAvailability(game([1, 1, 1], 149), groupTiles, actorId),
    ).toMatchObject({ allowed: false, reason: 'insufficientBalance' })
  })
})
