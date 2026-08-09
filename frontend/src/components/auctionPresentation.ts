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

export function boardPerimeterPosition(
  tileIndex: number,
  tileCount: number,
): { row: number; column: number } {
  const side = Math.ceil(tileCount / 4) + 1
  const edge = side - 1
  const index = Math.max(0, Math.min(tileIndex, tileCount - 1))
  if (index < edge) return { row: side, column: side - index }
  if (index < edge * 2) {
    return { row: side - (index - edge), column: 1 }
  }
  if (index < edge * 3) {
    return { row: 1, column: 1 + index - edge * 2 }
  }
  return { row: 1 + index - edge * 3, column: side }
}
