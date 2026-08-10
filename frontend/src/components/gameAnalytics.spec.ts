import { describe, expect, it } from 'vitest'
import type { ContentPack, GameEvent, GameState } from '../types'
import {
  activityCategory,
  buildActivityBuckets,
  buildDiceAnalytics,
  buildGameAnalytics,
  eventPlayerIds,
} from './gameAnalytics'

const firstId = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'

function event(
  sequence: number,
  type: GameEvent['type'],
  data: Record<string, unknown> = {},
): GameEvent {
  return { sequence, type, data, occurred_at: '2026-08-08T12:00:00Z' }
}

function fixture(): { game: GameState; pack: ContentPack } {
  const game = {
    id: 'game',
    players: [
      { user_id: firstId, display_name: 'Ada', balance: 900, bankrupt: false },
      { user_id: secondId, display_name: 'Linus', balance: 500, bankrupt: false },
    ],
    owners: { alpha: firstId, beta: secondId },
    mortgaged_property_ids: ['beta'],
    building_levels: { alpha: 2 },
    active_debt: {
      debtor_id: secondId,
      amount: 80,
      installment_plan_id: null,
    },
    rent_debt_plans: [],
    bank: {
      loans: [
        { player_id: firstId, remaining_balance: 100 },
        { player_id: secondId, remaining_balance: 30 },
      ],
      investments: [],
      market_orders: [],
    },
    events: [
      event(1, 'game.started'),
      event(2, 'turn.started', { player_id: firstId }),
      event(4, 'property.purchased', { player_id: firstId, property_id: 'alpha' }),
      event(5, 'payment.completed', {
        payer_id: secondId,
        recipient_id: firstId,
        amount: 50,
      }),
    ],
  } as unknown as GameState
  const pack = {
    board: {
      tiles: [
        { id: 'alpha', kind: 'property', name_key: 'alpha', price: 200, build_cost: 50 },
        { id: 'beta', kind: 'property', name_key: 'beta', price: 120 },
      ],
      decks: [],
    },
  } as unknown as ContentPack
  return { game, pack }
}

describe('game analytics', () => {
  it('reconciles player assets and liabilities into the global totals', () => {
    const { game, pack } = fixture()
    const result = buildGameAnalytics(game, pack)
    const ada = result.players.find((player) => player.player.user_id === firstId)
    const linus = result.players.find((player) => player.player.user_id === secondId)

    expect(ada).toMatchObject({
      cash: 900,
      propertyValue: 200,
      buildingValue: 100,
      totalDebt: 100,
      estimatedNetWorth: 1100,
      linkedEvents: 3,
    })
    expect(linus).toMatchObject({
      cash: 500,
      propertyValue: 120,
      totalDebt: 110,
      estimatedNetWorth: 510,
      linkedEvents: 1,
    })
    expect(result.totalEstimatedNetWorth).toBe(1610)
    expect(result.totalEstimatedNetWorth).toBe(
      result.players.reduce((total, player) => total + player.estimatedNetWorth, 0),
    )
    expect(result.missingEventSequences).toBe(1)
  })

  it('classifies event activity and keeps sequence ranges in bounded buckets', () => {
    const events = [
      event(1, 'dice.rolled'),
      event(2, 'property.purchased'),
      event(3, 'investment.shares_bought'),
      event(4, 'trade.accepted'),
      event(5, 'payment.completed'),
    ]
    const buckets = buildActivityBuckets(events, 2)

    expect(activityCategory('bank.loan_issued')).toBe('finance')
    expect(buckets).toHaveLength(2)
    expect(buckets[0]).toMatchObject({ from: 1, to: 3, total: 3 })
    expect(buckets[1]).toMatchObject({ from: 4, to: 5, total: 2 })
  })

  it('links an event only through known player identifier fields', () => {
    const { game } = fixture()
    expect(
      eventPlayerIds(
        event(6, 'trade.accepted', {
          proposer_id: firstId,
          recipient_id: secondId,
          property_id: firstId,
        }),
        game,
      ),
    ).toEqual([firstId, secondId])
  })

  it('builds dice distributions, landing history, and player summaries', () => {
    const result = buildDiceAnalytics([
      event(1, 'dice.rolled', {
        player_id: firstId,
        dice: [3, 4],
        from_position: 0,
        to_position: 7,
        steps: 7,
        tile_id: 'seven',
      }),
      event(2, 'dice.rolled', {
        player_id: firstId,
        dice: [6, 6],
        from_position: 7,
        to_position: 19,
        steps: 12,
        tile_id: 'nineteen',
      }),
      event(3, 'dice.rolled', {
        player_id: secondId,
        dice: [2, 2],
        from_position: 10,
        to_position: 10,
        steps: 0,
        jail_attempt: true,
        tile_id: 'jail',
      }),
      event(4, 'card.utility_dice_rolled', {
        player_id: secondId,
        dice: [1, 5],
      }),
      event(5, 'dice.rolled', { player_id: secondId, dice: [0, 8] }),
    ])

    expect(result.rolls).toHaveLength(3)
    expect(result.utilityRolls).toHaveLength(1)
    expect(result.average).toBeCloseTo(23 / 3)
    expect(result.doubles).toBe(2)
    expect(result.faceCounts).toEqual([0, 2, 1, 1, 0, 2])
    expect(result.totalCounts[5]).toBe(1)
    expect(result.totalCounts[10]).toBe(1)
    expect(result.landings).toEqual([
      { position: 7, tileId: 'seven', count: 1 },
      { position: 19, tileId: 'nineteen', count: 1 },
    ])
    expect(result.players).toEqual([
      { playerId: firstId, rolls: 2, average: 9.5, doubles: 1 },
      { playerId: secondId, rolls: 1, average: 4, doubles: 1 },
    ])
    expect(result.history.map((roll) => roll.sequence)).toEqual([4, 3, 2, 1])
  })
})
