export function compareAuctionPrice(currentBid: number, originalPrice: number): {
  direction: 'below' | 'equal' | 'above'
  percent: number
} {
  if (originalPrice <= 0 || currentBid === originalPrice) {
    return { direction: 'equal', percent: 0 }
  }
  return {
    direction: currentBid < originalPrice ? 'below' : 'above',
    percent: Math.round((Math.abs(currentBid - originalPrice) / originalPrice) * 100),
  }
}

export const AUCTION_COUNTDOWN_SOUND_MS = 3_000

export function auctionCountdownDelayMs(
  deadlineMs: number,
  nowMs: number,
): number | null {
  const remainingMs = deadlineMs - nowMs
  if (remainingMs <= 0) return null
  return Math.max(0, remainingMs - AUCTION_COUNTDOWN_SOUND_MS)
}
