import { describe, expect, it } from 'vitest'
import type { ContentPack } from '../types'
import { groupPropertyIds } from './propertyGrouping'

const pack = {
  board: {
    groups: [{ id: 'blue', name_key: 'group.blue', color: '#3388ff' }],
    tiles: [
      { id: 'blue-1', kind: 'property', name_key: 'blue.1', group: 'blue' },
      { id: 'station', kind: 'transport', name_key: 'station' },
      { id: 'blue-2', kind: 'property', name_key: 'blue.2', group: 'blue' },
    ],
  },
  messages: { 'group.blue': 'Grupo azul' },
} as unknown as ContentPack

describe('property grouping', () => {
  it('groups non-contiguous properties using board group order and colors', () => {
    expect(groupPropertyIds(pack, ['blue-2', 'station', 'blue-1'])).toEqual([
      {
        key: 'group:blue',
        name: 'Grupo azul',
        kind: 'property',
        accent: '#3388ff',
        propertyIds: ['blue-1', 'blue-2'],
      },
      {
        key: 'kind:transport',
        name: null,
        kind: 'transport',
        accent: '#70b7ff',
        propertyIds: ['station'],
      },
    ])
  })
})
