import { describe, expect, it } from 'vitest'
import {
  clearWorkspacePanelHeights,
  keepWorkspaceSelection,
  moveWorkspacePanel,
  normalizeWorkspacePanelLayout,
  placeWorkspacePanel,
} from './workspacePanelLayout'

const rightPlacements = {
  room: 'right',
  heatmap: 'right',
  players: 'right',
  properties: 'right',
  trades: 'right',
  debts: 'right',
  bank: 'right',
  market: 'right',
  chat: 'right',
} as const

const legacy: Parameters<typeof normalizeWorkspacePanelLayout>[1] = {
  order: ['room', 'management', 'players', 'heatmap', 'chat'],
  heights: { room: 400, chat: 300 },
  management: {
    order: ['bank', 'properties', 'trades', 'market'],
    visible: ['bank', 'properties'],
    heights: { bank: 360 },
  },
}

describe('workspace panel layout', () => {
  it('migrates the prior general and management layout into the icon rail', () => {
    expect(normalizeWorkspacePanelLayout(null, legacy)).toEqual({
      compact: false,
      order: [
        'room',
        'bank',
        'properties',
        'trades',
        'debts',
        'market',
        'players',
        'heatmap',
        'chat',
      ],
      visible: ['room', 'bank', 'properties', 'players', 'heatmap', 'chat'],
      heights: { room: 400, bank: 360, chat: 300 },
      placements: rightPlacements,
      windows: {},
    })
  })

  it('preserves the compact rail choice without changing older layouts', () => {
    const compact = normalizeWorkspacePanelLayout(
      {
        compact: true,
        order: [
          'room',
          'heatmap',
          'players',
          'properties',
          'trades',
          'debts',
          'bank',
          'market',
          'chat',
        ],
        visible: ['properties'],
      },
      legacy,
    )

    expect(compact.compact).toBe(true)
    expect(normalizeWorkspacePanelLayout({}, legacy).compact).toBe(false)
  })

  it('supports multiple panels but keeps at least one selected', () => {
    expect(keepWorkspaceSelection(['properties'], ['properties', 'chat'])).toEqual([
      'properties',
      'chat',
    ])
    expect(keepWorkspaceSelection(['properties'], [])).toEqual(['properties'])
  })

  it('reorders a panel before the drop target', () => {
    expect(
      moveWorkspacePanel(['room', 'properties', 'chat'], 'chat', 'properties'),
    ).toEqual(['room', 'chat', 'properties'])
  })

  it('docks panels on either side and creates floating window geometry', () => {
    const layout = normalizeWorkspacePanelLayout(
      {
        order: ['room', 'heatmap', 'players', 'properties', 'trades', 'debts', 'bank', 'market', 'chat'],
        visible: ['properties', 'chat'],
        heights: {},
      },
      legacy,
    )
    const docked = placeWorkspacePanel(layout, 'chat', 'left', 'properties')
    expect(docked.placements.chat).toBe('left')
    expect(docked.order.indexOf('chat')).toBeLessThan(
      docked.order.indexOf('properties'),
    )

    const floating = placeWorkspacePanel(docked, 'chat', 'floating')
    expect(floating.placements.chat).toBe('floating')
    expect(floating.windows.chat).toEqual({
      x: 180,
      y: 136,
      width: 380,
      height: 520,
    })
  })

  it('redistributes only selected panel heights', () => {
    expect(
      clearWorkspacePanelHeights(
        { room: 300, properties: 420, chat: 260 },
        ['room', 'properties'],
      ),
    ).toEqual({ chat: 260 })
  })
})
