import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../types'
import { buildPlayerListEntries } from './playerOrdering'

const adaId = '00000000-0000-4000-8000-000000000001'
const beaId = '00000000-0000-4000-8000-000000000002'
const zoeId = '00000000-0000-4000-8000-000000000003'

function fixture(): { game: GameState; pack: ContentPack } {
  const game = {
    players: [
      { user_id: zoeId, display_name: 'Zoé', balance: 900 },
      { user_id: adaId, display_name: 'Ada', balance: 300 },
      { user_id: beaId, display_name: 'Bea', balance: 700 },
    ],
    owners: { plaza: adaId },
    building_levels: { plaza: 2 },
    mortgaged_property_ids: [],
    rent_debt_plans: [],
    active_debt: null,
    bank: {
      loans: [{ player_id: zoeId, remaining_balance: 500 }],
      investments: [],
      market_orders: [],
    },
    events: [],
  } as unknown as GameState
  const pack = {
    board: {
      tiles: [
        {
          id: 'plaza',
          kind: 'property',
          name_key: 'plaza',
          price: 500,
          build_cost: 100,
        },
      ],
      decks: [],
    },
  } as unknown as ContentPack
  return { game, pack }
}

describe('player ordering', () => {
  it('preserves the authoritative turn order and original player indexes', () => {
    const { game, pack } = fixture()

    const result = buildPlayerListEntries(game, pack, 'turnOrder', 'es-CL')

    expect(result.map((entry) => entry.player.user_id)).toEqual([
      zoeId,
      adaId,
      beaId,
    ])
    expect(result.map((entry) => entry.playerIndex)).toEqual([0, 1, 2])
    expect(game.players.map((player) => player.user_id)).toEqual([
      zoeId,
      adaId,
      beaId,
    ])
  })

  it('orders by estimated net worth and cash from highest to lowest', () => {
    const { game, pack } = fixture()

    expect(
      buildPlayerListEntries(game, pack, 'netWorth', 'es-CL').map(
        (entry) => entry.player.user_id,
      ),
    ).toEqual([adaId, beaId, zoeId])
    expect(
      buildPlayerListEntries(game, pack, 'cash', 'es-CL').map(
        (entry) => entry.player.user_id,
      ),
    ).toEqual([zoeId, beaId, adaId])
  })

  it('orders names using the active locale', () => {
    const { game, pack } = fixture()

    expect(
      buildPlayerListEntries(game, pack, 'name', 'es-CL').map(
        (entry) => entry.player.display_name,
      ),
    ).toEqual(['Ada', 'Bea', 'Zoé'])
  })
})
