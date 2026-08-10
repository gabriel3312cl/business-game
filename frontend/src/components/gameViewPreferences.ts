import type {
  AnalyticsDashboardTab,
  AnalyticsDashboardView,
  AnalyticsDashboardSource,
  BoardCameraMode,
  BoardMovementPreviewMode,
  BoardTileViewMode,
  BoardWorkspaceMode,
  GameViewPreferenceSettings,
  ManagementPanelId,
  MobileWorkspacePanel,
  PropertyFilter,
  WorkspacePanelId,
} from '../types'

export const DEFAULT_GAME_VIEW_PREFERENCES: GameViewPreferenceSettings = {
  tile_mode: 'detailed',
  workspace_mode: 'normal',
  camera_mode: 'fit',
  movement_preview: 'steps',
  show_other_player_modals: true,
  omit_bot_presentations: false,
  omit_other_human_presentations: false,
  omit_own_presentations: false,
  mobile_panel: null,
  mobile_management_panel: 'properties',
  tablet_workspace_panel: 'properties',
  bank_tab: 0,
  market_tab: 'market',
  property_filter: 'all',
  analytics_open: false,
  analytics_tab: 'overview',
  analytics_view: 'fullscreen',
  analytics_source: 'current',
}

const MANAGEMENT_PANELS = new Set<ManagementPanelId>([
  'properties',
  'trades',
  'debts',
  'bank',
  'market',
])
const WORKSPACE_PANELS = new Set<WorkspacePanelId>([
  'room',
  'heatmap',
  'players',
  'properties',
  'trades',
  'debts',
  'bank',
  'market',
  'chat',
])
const MOBILE_PANELS = new Set<Exclude<MobileWorkspacePanel, null>>([
  'room',
  'players',
  'manage',
  'heatmap',
  'chat',
])
const ANALYTICS_TABS = new Set<AnalyticsDashboardTab>([
  'overview',
  'players',
  'economy',
  'activity',
  'dice',
  'technical',
])

export function normalizeGameViewPreferences(
  stored: Partial<GameViewPreferenceSettings> | null | undefined,
): GameViewPreferenceSettings {
  return {
    tile_mode: oneOf<BoardTileViewMode>(stored?.tile_mode, ['detailed', 'visual'])
      ? stored.tile_mode
      : DEFAULT_GAME_VIEW_PREFERENCES.tile_mode,
    workspace_mode: oneOf<BoardWorkspaceMode>(stored?.workspace_mode, [
      'normal',
      'focus',
    ])
      ? stored.workspace_mode
      : DEFAULT_GAME_VIEW_PREFERENCES.workspace_mode,
    camera_mode: oneOf<BoardCameraMode>(stored?.camera_mode, ['fit', 'detail'])
      ? stored.camera_mode
      : DEFAULT_GAME_VIEW_PREFERENCES.camera_mode,
    movement_preview: oneOf<BoardMovementPreviewMode>(stored?.movement_preview, [
      'steps',
      'landing',
      'off',
    ])
      ? stored.movement_preview
      : DEFAULT_GAME_VIEW_PREFERENCES.movement_preview,
    show_other_player_modals:
      typeof stored?.show_other_player_modals === 'boolean'
        ? stored.show_other_player_modals
        : DEFAULT_GAME_VIEW_PREFERENCES.show_other_player_modals,
    omit_bot_presentations:
      typeof stored?.omit_bot_presentations === 'boolean'
        ? stored.omit_bot_presentations
        : DEFAULT_GAME_VIEW_PREFERENCES.omit_bot_presentations,
    omit_other_human_presentations:
      typeof stored?.omit_other_human_presentations === 'boolean'
        ? stored.omit_other_human_presentations
        : DEFAULT_GAME_VIEW_PREFERENCES.omit_other_human_presentations,
    omit_own_presentations:
      typeof stored?.omit_own_presentations === 'boolean'
        ? stored.omit_own_presentations
        : DEFAULT_GAME_VIEW_PREFERENCES.omit_own_presentations,
    mobile_panel:
      stored?.mobile_panel === null || MOBILE_PANELS.has(stored?.mobile_panel as never)
        ? (stored?.mobile_panel ?? null)
        : DEFAULT_GAME_VIEW_PREFERENCES.mobile_panel,
    mobile_management_panel: MANAGEMENT_PANELS.has(
      stored?.mobile_management_panel as ManagementPanelId,
    )
      ? (stored?.mobile_management_panel as ManagementPanelId)
      : DEFAULT_GAME_VIEW_PREFERENCES.mobile_management_panel,
    tablet_workspace_panel: WORKSPACE_PANELS.has(
      stored?.tablet_workspace_panel as WorkspacePanelId,
    )
      ? (stored?.tablet_workspace_panel as WorkspacePanelId)
      : DEFAULT_GAME_VIEW_PREFERENCES.tablet_workspace_panel,
    bank_tab:
      stored?.bank_tab === 0 || stored?.bank_tab === 1 || stored?.bank_tab === 2
        ? stored.bank_tab
        : DEFAULT_GAME_VIEW_PREFERENCES.bank_tab,
    market_tab: oneOf(stored?.market_tab, ['market', 'performance'])
      ? stored.market_tab
      : DEFAULT_GAME_VIEW_PREFERENCES.market_tab,
    property_filter: oneOf<PropertyFilter>(stored?.property_filter, [
      'all',
      'available',
      'mine',
      'mortgaged',
    ])
      ? stored.property_filter
      : DEFAULT_GAME_VIEW_PREFERENCES.property_filter,
    analytics_open:
      typeof stored?.analytics_open === 'boolean'
        ? stored.analytics_open
        : DEFAULT_GAME_VIEW_PREFERENCES.analytics_open,
    analytics_tab: ANALYTICS_TABS.has(stored?.analytics_tab as AnalyticsDashboardTab)
      ? (stored?.analytics_tab as AnalyticsDashboardTab)
      : DEFAULT_GAME_VIEW_PREFERENCES.analytics_tab,
    analytics_view: oneOf<AnalyticsDashboardView>(stored?.analytics_view, [
      'fullscreen',
      'window',
    ])
      ? stored.analytics_view
      : DEFAULT_GAME_VIEW_PREFERENCES.analytics_view,
    analytics_source: oneOf<AnalyticsDashboardSource>(stored?.analytics_source, [
      'current',
      'historical',
    ])
      ? stored.analytics_source
      : DEFAULT_GAME_VIEW_PREFERENCES.analytics_source,
  }
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}
