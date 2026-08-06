import { describe, expect, it } from 'vitest'
import { mergeOlderMessages } from './useGameChat'
import type { ChatMessage } from './types'

function message(id: number): ChatMessage {
  return { id } as ChatMessage
}

describe('mergeOlderMessages', () => {
  it('prepends older messages without duplicating an overlapping boundary', () => {
    expect(
      mergeOlderMessages(
        [message(3), message(4)],
        [message(1), message(2), message(3)],
      ).map((item) => item.id),
    ).toEqual([1, 2, 3, 4])
  })
})
