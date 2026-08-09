import { describe, expect, it } from 'vitest'
import { createBoardDocument } from './defaults'
import { validateBoardLocally } from './validation'

describe('board player limits', () => {
  it('accepts 20 players and rejects 21', () => {
    const document = createBoardDocument()
    document.information.max_players = 20

    expect(
      validateBoardLocally(document).some(
        (issue) => issue.path === 'information.players',
      ),
    ).toBe(false)

    document.information.max_players = 21
    expect(
      validateBoardLocally(document).some(
        (issue) => issue.path === 'information.players',
      ),
    ).toBe(true)
  })
})
