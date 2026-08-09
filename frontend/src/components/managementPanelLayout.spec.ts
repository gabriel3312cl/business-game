import { describe, expect, it } from 'vitest'
import {
  clearManagementPanelHeights,
  keepManagementSelection,
  moveManagementPanel,
  normalizeManagementPanelLayout,
} from './managementPanelLayout'

describe('management panel layout', () => {
  it('defaults legacy preferences to properties only', () => {
    expect(normalizeManagementPanelLayout()).toEqual({
      order: ['properties', 'trades', 'debts', 'bank', 'market'],
      visible: ['properties'],
      heights: {},
    })
  })

  it('supports multiple views but keeps at least one selected', () => {
    expect(keepManagementSelection(['properties'], ['properties', 'bank'])).toEqual([
      'properties',
      'bank',
    ])
    expect(keepManagementSelection(['properties'], [])).toEqual(['properties'])
  })

  it('reorders a selected panel before its drop target', () => {
    expect(
      moveManagementPanel(
        ['properties', 'trades', 'debts', 'bank', 'market'],
        'bank',
        'properties',
      ),
    ).toEqual(['bank', 'properties', 'trades', 'debts', 'market'])
  })

  it('redistributes only the visible panel heights', () => {
    expect(
      clearManagementPanelHeights(
        { properties: 300, trades: 420, bank: 260 },
        ['properties', 'trades'],
      ),
    ).toEqual({ bank: 260 })
  })
})
