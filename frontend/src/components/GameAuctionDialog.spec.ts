import { describe, expect, it } from 'vitest'
import { compareAuctionPrice } from './auctionPresentation'
import { perimeterPosition } from './boardGeometry'

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

  it('uses the same board positions for 40 and 64 tile boards', () => {
    expect(perimeterPosition(0, 11)).toMatchObject({ row: 1, column: 1 })
    expect(perimeterPosition(10, 11)).toMatchObject({ row: 1, column: 11 })
    expect(perimeterPosition(20, 11)).toMatchObject({ row: 11, column: 11 })
    expect(perimeterPosition(30, 11)).toMatchObject({ row: 11, column: 1 })
    expect(perimeterPosition(16, 17)).toMatchObject({ row: 1, column: 17 })
    expect(perimeterPosition(48, 17)).toMatchObject({ row: 17, column: 1 })
  })
})
