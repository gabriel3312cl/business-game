import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TileDefinition } from '../types'
import { BoardTile, type BoardToken } from './BoardTile'

const tile: TileDefinition = {
  id: 'property-1',
  kind: 'property',
  name_key: 'tile.property',
  color: '#ff6ea8',
}

const currentUserToken: BoardToken = {
  playerId: 'player-1',
  playerNumber: 1,
  displayName: 'Jugador actual',
  color: '#38e8ff',
  active: false,
  currentUser: true,
  highlighted: false,
}

describe('BoardTile current player location', () => {
  it('marks the tile and adds a trail behind the current player token', () => {
    const html = renderTile(currentUserToken)

    expect(html).toContain('data-current-user-location="true"')
    expect(html).toContain('data-current-user-trail="true"')
    expect(html).toContain('data-current-user="true"')
  })

  it('does not add the location trail for another player', () => {
    const html = renderTile({
      ...currentUserToken,
      playerId: 'player-2',
      displayName: 'Otro jugador',
      currentUser: false,
    })

    expect(html).not.toContain('data-current-user-location')
    expect(html).not.toContain('data-current-user-trail')
    expect(html).not.toContain('data-current-user="true"')
  })
})

function renderTile(token: BoardToken) {
  return renderToStaticMarkup(
    createElement(BoardTile, {
      tile,
      name: 'Propiedad',
      gridColumn: 2,
      gridRow: 1,
      edge: 'top',
      rotation: 0,
      compact: false,
      tokens: [token],
      tooltip: 'Propiedad',
      onClick: () => undefined,
    }),
  )
}
