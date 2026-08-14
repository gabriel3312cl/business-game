import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../i18n'
import type { GameState, User } from '../types'
import { ActiveGamesPanel } from './ActiveGamesPanel'

describe('ActiveGamesPanel', () => {
  it('uses explicit card and action radii instead of multiplying the active theme radius', () => {
    const user = { id: 'user-1', display_name: 'Batman' } as User
    const game = {
      id: 'game-preview',
      status: 'playing',
      host_user_id: user.id,
      current_player_index: 0,
      players: [
        {
          user_id: user.id,
          display_name: user.display_name,
          bankrupt: false,
        },
      ],
    } as GameState

    const html = renderToStaticMarkup(
      createElement(ActiveGamesPanel, {
        games: [game],
        user,
        loading: false,
        onResume: () => undefined,
        onRefresh: () => undefined,
      }),
    )

    expect(html).toContain('border-radius:20px')
    expect(html).toContain('border-radius:14px')
  })
})
