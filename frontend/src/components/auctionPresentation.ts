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
