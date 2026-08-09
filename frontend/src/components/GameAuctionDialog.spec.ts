import { describe, expect, it } from 'vitest'
import {
  boardPerimeterPosition,
  compareAuctionPrice,
} from './auctionPresentation'

describe('auction presentation', () => {
  it('compares the live bid with the original property price', () => {
    expect(compareAuctionPrice(90, 120)).toEqual({
      direction: 'below',
      percent: 25,
    })
    expect(compareAuctionPrice(156, 120)).toEqual({
      direction: 'above',
      percent: 30,
    })
    expect(compareAuctionPrice(120, 120)).toEqual({
      direction: 'equal',
      percent: 0,
    })
  })

  it('places board spaces around the four edges for 40 and 64 tile boards', () => {
    expect(boardPerimeterPosition(0, 40)).toEqual({ row: 11, column: 11 })
    expect(boardPerimeterPosition(10, 40)).toEqual({ row: 11, column: 1 })
    expect(boardPerimeterPosition(20, 40)).toEqual({ row: 1, column: 1 })
    expect(boardPerimeterPosition(30, 40)).toEqual({ row: 1, column: 11 })
    expect(boardPerimeterPosition(16, 64)).toEqual({ row: 17, column: 1 })
    expect(boardPerimeterPosition(48, 64)).toEqual({ row: 1, column: 17 })
  })
})
