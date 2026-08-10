import { describe, expect, it } from 'vitest'
import { tradeCashSuggestions } from './tradeCashSuggestions'

describe('trade cash suggestions', () => {
  it('suggests the difference and reference prices for received properties', () => {
    expect(tradeCashSuggestions(200, 80, 500)).toEqual([
      { kind: 'difference', amount: 120 },
      { kind: 'discount', amount: 150 },
      { kind: 'original', amount: 200 },
      { kind: 'premium', amount: 250 },
    ])
  })

  it('deduplicates equal amounts and omits unaffordable suggestions', () => {
    expect(tradeCashSuggestions(200, 50, 180)).toEqual([
      { kind: 'difference', amount: 150 },
    ])
  })

  it('labels the full property price as original when no property is given back', () => {
    expect(tradeCashSuggestions(200, 0, 500)).toEqual([
      { kind: 'discount', amount: 150 },
      { kind: 'original', amount: 200 },
      { kind: 'premium', amount: 250 },
    ])
  })

  it('does not suggest cash when no properties are received', () => {
    expect(tradeCashSuggestions(0, 200, 500)).toEqual([])
  })
})
