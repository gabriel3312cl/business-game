import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCommandId } from './commandId'

describe('createCommandId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses randomUUID when the browser provides it', () => {
    const expected = '123e4567-e89b-42d3-a456-426614174000'
    const randomUUID = vi.fn(() => expected)
    vi.stubGlobal('crypto', { randomUUID })

    expect(createCommandId()).toBe(expected)
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('creates a UUID when randomUUID is unavailable on an HTTP LAN origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      },
    })

    expect(createCommandId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
