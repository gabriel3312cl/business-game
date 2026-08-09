import { describe, expect, it } from 'vitest'
import type { GameEvent, GameState } from './types'
import {
  advanceVisualEffects,
  collectNewVisualEffectEvents,
  enqueueVisualEffects,
  type GameVisualEffect,
  visualEffectsForEvent,
} from './visualEffects'

const game = {
  trades: [
    {
      id: 'trade-1',
      proposer_id: 'player-a',
      recipient_id: 'player-b',
      offered_cash: 50,
      requested_cash: 0,
      offered_property_ids: ['property:a'],
      requested_property_ids: ['property:b'],
    },
  ],
} as GameState

function event(type: GameEvent['type'], data: GameEvent['data']): GameEvent {
  return { sequence: 7, type, occurred_at: '2026-08-08T00:00:00Z', data }
}

describe('visualEffectsForEvent', () => {
  it('describes a confirmed payment as a transfer between anchors', () => {
    expect(
      visualEffectsForEvent(
        event('payment.completed', {
          debtor_id: 'player-a',
          creditor_id: 'player-b',
          amount: 120,
        }),
        game,
      ),
    ).toEqual([
      {
        id: '7:money',
        sequence: 7,
        kind: 'money',
        amount: 120,
        fromPlayerId: 'player-a',
        toPlayerId: 'player-b',
      },
    ])
  })

  it('emits money and property feedback for a purchase', () => {
    expect(
      visualEffectsForEvent(
        event('property.purchased', {
          player_id: 'player-a',
          tile_id: 'property:a',
          price: 300,
        }),
        game,
      ).map((effect) => effect.kind),
    ).toEqual(['money', 'property'])
  })

  it('uses the authoritative trade snapshot for an accepted trade', () => {
    expect(
      visualEffectsForEvent(
        event('trade.accepted', { trade_id: 'trade-1' }),
        game,
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'trade',
        proposerId: 'player-a',
        recipientId: 'player-b',
        offeredPropertyIds: ['property:a'],
        requestedPropertyIds: ['property:b'],
      }),
    ])
  })

  it('lets the interactive-card dialog own its reveal animation', () => {
    const gameWithChoice = {
      ...game,
      pending_card_choice: { card_id: 'card-1' },
    } as GameState
    expect(
      visualEffectsForEvent(
        event('card.drawn', { player_id: 'player-a', card_id: 'card-1' }),
        gameWithChoice,
      ),
    ).toEqual([])
  })

  it('lets the drawn-card dialog own the common reveal animation', () => {
    const gameWithDraw = {
      ...game,
      pending_card_draw: { card_id: 'card-1' },
    } as GameState
    expect(
      visualEffectsForEvent(
        event('card.drawn', { player_id: 'player-a', card_id: 'card-1' }),
        gameWithDraw,
      ),
    ).toEqual([])
  })

  it('ignores incomplete events instead of inventing an effect target', () => {
    expect(visualEffectsForEvent(event('turn.started', {}), game)).toEqual([])
    expect(
      visualEffectsForEvent(event('property.mortgaged', { amount: 100 }), game),
    ).toEqual([])
  })
})

function auctionEffect(
  sequence: number,
  action: 'bid' | 'won',
  amount: number,
): GameVisualEffect {
  return {
    id: `${sequence}:auction`,
    sequence,
    kind: 'auction',
    action,
    tileId: 'property:a',
    playerId: `player-${sequence}`,
    amount,
  }
}

describe('auction visual-effect playback', () => {
  it('replaces rapid bids with only the latest bid', () => {
    const first = auctionEffect(1, 'bid', 10)
    const latest = auctionEffect(3, 'bid', 30)

    const playback = enqueueVisualEffects(
      { active: first, queue: [auctionEffect(2, 'bid', 20)] },
      [latest],
    )

    expect(playback).toEqual({ active: latest, queue: [] })
  })

  it('keeps only the latest bid while another effect is active', () => {
    const turn: GameVisualEffect = {
      id: '1:turn',
      sequence: 1,
      kind: 'turn',
      playerId: 'player-a',
    }

    const playback = enqueueVisualEffects(
      { active: turn, queue: [auctionEffect(2, 'bid', 20)] },
      [auctionEffect(3, 'bid', 30)],
    )

    expect(playback.active).toBe(turn)
    expect(playback.queue).toEqual([auctionEffect(3, 'bid', 30)])
  })

  it('removes pending bids and shows the result as soon as the auction ends', () => {
    const activeBid = auctionEffect(2, 'bid', 20)
    const won = auctionEffect(4, 'won', 40)
    const transfer: GameVisualEffect = {
      id: '4:property',
      sequence: 4,
      kind: 'property',
      action: 'transferred',
      tileId: 'property:a',
      playerId: 'player-4',
    }

    const playback = enqueueVisualEffects(
      { active: activeBid, queue: [auctionEffect(3, 'bid', 30)] },
      [won, transfer],
    )

    expect(playback).toEqual({ active: won, queue: [transfer] })
    expect(advanceVisualEffects(playback, activeBid.id)).toBe(playback)
  })

  it('does not discard an auction result when the queue reaches its limit', () => {
    const active: GameVisualEffect = {
      id: '1:card',
      sequence: 1,
      kind: 'card',
      cardId: 'card-1',
    }
    const queued: GameVisualEffect[] = Array.from({ length: 18 }, (_, index) => ({
      id: `${index + 2}:turn`,
      sequence: index + 2,
      kind: 'turn',
      playerId: `player-${index}`,
    }))
    const won = auctionEffect(21, 'won', 50)

    const playback = enqueueVisualEffects(
      { active, queue: queued },
      [won],
    )

    expect(playback.queue).toHaveLength(18)
    expect(playback.queue[0]).toEqual(won)
  })
})

describe('visual-effect event synchronization', () => {
  const historicalEvent = {
    ...event('trade.accepted', { trade_id: 'trade-1' }),
    sequence: 12,
  }

  it('does not replay history revealed after the initial synchronization', () => {
    const armed = collectNewVisualEffectEvents(
      { gameId: 'game-1', sequence: 0, armed: false },
      'game-1',
      [],
      12,
      true,
    )
    const historyRevealed = collectNewVisualEffectEvents(
      armed.cursor,
      'game-1',
      [historicalEvent],
      12,
      true,
    )

    expect(armed.events).toEqual([])
    expect(armed.cursor.sequence).toBe(12)
    expect(historyRevealed.events).toEqual([])
  })

  it('emits only events created after synchronization', () => {
    const nextEvent = { ...historicalEvent, sequence: 13 }
    const selection = collectNewVisualEffectEvents(
      { gameId: 'game-1', sequence: 12, armed: true },
      'game-1',
      [historicalEvent, nextEvent],
      13,
      true,
    )

    expect(selection.events).toEqual([nextEvent])
    expect(selection.cursor.sequence).toBe(13)
  })

  it('resets the baseline without replaying missed events after reconnecting', () => {
    const disconnected = collectNewVisualEffectEvents(
      { gameId: 'game-1', sequence: 12, armed: true },
      'game-1',
      [],
      18,
      false,
    )
    const reconnected = collectNewVisualEffectEvents(
      disconnected.cursor,
      'game-1',
      [{ ...historicalEvent, sequence: 18 }],
      18,
      true,
    )

    expect(disconnected.resetPlayback).toBe(true)
    expect(disconnected.cursor.armed).toBe(false)
    expect(reconnected.events).toEqual([])
    expect(reconnected.cursor).toEqual({
      gameId: 'game-1',
      sequence: 18,
      armed: true,
    })
  })
})
