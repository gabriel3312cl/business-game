import { describe, expect, it } from 'vitest'
import { shouldShowPlayerModal } from './playerModalVisibility'

describe('shouldShowPlayerModal', () => {
  it('keeps every modal visible when observation is enabled', () => {
    expect(shouldShowPlayerModal(true, 'current', ['other'])).toBe(true)
  })

  it('hides a modal that only belongs to another player', () => {
    expect(shouldShowPlayerModal(false, 'current', ['other'])).toBe(false)
  })

  it('never hides a modal that requires the current player', () => {
    expect(
      shouldShowPlayerModal(false, 'current', ['other', 'current']),
    ).toBe(true)
  })
})
