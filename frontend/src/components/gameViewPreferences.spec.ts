import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_VIEW_PREFERENCES,
  normalizeGameViewPreferences,
} from './gameViewPreferences'

describe('normalizeGameViewPreferences', () => {
  it('uses accessible defaults for missing preferences', () => {
    expect(normalizeGameViewPreferences(null)).toEqual(
      DEFAULT_GAME_VIEW_PREFERENCES,
    )
  })

  it('preserves supported board, navigation and workspace views', () => {
    expect(
      normalizeGameViewPreferences({
        tile_mode: 'visual',
        workspace_mode: 'focus',
        camera_mode: 'detail',
        movement_preview: 'landing',
        show_other_player_modals: false,
        omit_bot_presentations: true,
        omit_other_human_presentations: true,
        omit_own_presentations: true,
        mobile_panel: 'manage',
        mobile_management_panel: 'bank',
        tablet_workspace_panel: 'market',
        bank_tab: 2,
        market_tab: 'performance',
        property_filter: 'mine',
        analytics_open: true,
        analytics_tab: 'dice',
        analytics_view: 'window',
        analytics_source: 'historical',
      }),
    ).toEqual({
      tile_mode: 'visual',
      workspace_mode: 'focus',
      camera_mode: 'detail',
      movement_preview: 'landing',
      show_other_player_modals: false,
      omit_bot_presentations: true,
      omit_other_human_presentations: true,
      omit_own_presentations: true,
      mobile_panel: 'manage',
      mobile_management_panel: 'bank',
      tablet_workspace_panel: 'market',
      bank_tab: 2,
      market_tab: 'performance',
      property_filter: 'mine',
      analytics_open: true,
      analytics_tab: 'dice',
      analytics_view: 'window',
      analytics_source: 'historical',
    })
  })

  it('rejects unsupported stored values independently', () => {
    expect(
      normalizeGameViewPreferences({
        tile_mode: 'poster' as never,
        bank_tab: 8 as never,
        mobile_panel: 'payment-confirmation' as never,
      }),
    ).toMatchObject({
      tile_mode: 'detailed',
      bank_tab: 0,
      mobile_panel: null,
    })
  })
})
