import type { AuctionState } from '../types'

export function auctionInteractionState(auction: AuctionState, userId: string) {
  const isIdle = auction.phase === 'idle'
  const isLeader = auction.current_bidder_id === userId
  const isReady = auction.ready_player_ids.includes(userId)
  const hasPassed = auction.passed_player_ids.includes(userId)
  const isEligible = auction.eligible_player_ids.includes(userId)
  return {
    isIdle,
    isLeader,
    isReady,
    hasPassed,
    isEligible,
    canBid:
      auction.phase === 'bidding' &&
      isEligible &&
      isReady &&
      !hasPassed &&
      !isLeader,
  }
}
