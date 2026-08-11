import { describe, expect, it } from 'vitest'
import type { AuctionState } from '../types'
import { auctionInteractionState } from './auctionInteraction'

function auction(
  phase: 'idle' | 'bidding',
  leaderId: string | null = null,
): AuctionState {
  return {
    id: 'auction-1',
    property_id: 'property_03',
    seller_id: null,
    phase,
    minimum_bid: 42,
    current_bid: leaderId ? 50 : 0,
    current_bidder_id: leaderId,
    bid_deadline:
      phase === 'bidding'
        ? '2026-08-10T12:00:05Z'
        : '2026-08-10T12:00:30Z',
    deposit_amount: 6,
    deposits: {},
    eligible_player_ids: ['player-1', 'player-2'],
    ready_player_ids: phase === 'bidding' ? ['player-1', 'player-2'] : [],
    passed_player_ids: [],
  }
}

describe('auctionInteractionState', () => {
  it('keeps eligible players out of bidding while readiness is idle', () => {
    expect(auctionInteractionState(auction('idle'), 'player-1')).toEqual({
      isIdle: true,
      isLeader: false,
      isReady: false,
      hasPassed: false,
      isEligible: true,
      canBid: false,
    })
  })

  it('blocks the current leader from bidding against itself', () => {
    const state = auctionInteractionState(
      auction('bidding', 'player-1'),
      'player-1',
    )

    expect(state.isLeader).toBe(true)
    expect(state.canBid).toBe(false)
  })

  it('allows a ready non-leader to bid', () => {
    expect(
      auctionInteractionState(auction('bidding', 'player-2'), 'player-1').canBid,
    ).toBe(true)
  })
})
