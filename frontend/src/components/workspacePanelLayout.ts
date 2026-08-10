import type {
  ManagementPanelLayoutPreferences,
  PanelId,
  WorkspacePanelId,
  WorkspacePanelLayoutPreferences,
  WorkspacePanelPlacement,
  WorkspacePanelWindowGeometry,
} from '../types'
import { normalizeManagementPanelLayout } from './managementPanelLayout'

export const WORKSPACE_PANEL_IDS: WorkspacePanelId[] = [
  'room',
  'heatmap',
  'players',
  'properties',
  'trades',
  'debts',
  'bank',
  'market',
  'chat',
]

export const DEFAULT_WORKSPACE_PANEL_LAYOUT: WorkspacePanelLayoutPreferences = {
  compact: false,
  order: WORKSPACE_PANEL_IDS,
  visible: ['properties'],
  heights: {},
  placements: defaultWorkspacePlacements(),
  windows: {},
}

interface LegacyPanelLayout {
  order: PanelId[]
  heights: Partial<Record<PanelId, number>>
  management: ManagementPanelLayoutPreferences
}

export function normalizeWorkspacePanelLayout(
  stored: Partial<WorkspacePanelLayoutPreferences> | null | undefined,
  legacy: LegacyPanelLayout,
): WorkspacePanelLayoutPreferences {
  if (!stored) return migrateLegacyPanelLayout(legacy)

  const storedOrder = Array.isArray(stored.order)
    ? stored.order.filter(isWorkspacePanelId)
    : []
  const order = [
    ...new Set<WorkspacePanelId>([...storedOrder, ...WORKSPACE_PANEL_IDS]),
  ]
  const storedVisible = Array.isArray(stored.visible)
    ? stored.visible.filter(isWorkspacePanelId)
    : []
  const visible = [...new Set<WorkspacePanelId>(storedVisible)]
  const heights: Partial<Record<WorkspacePanelId, number>> = {}
  const placements = defaultWorkspacePlacements()
  const windows: Partial<Record<WorkspacePanelId, WorkspacePanelWindowGeometry>> = {}
  for (const panelId of WORKSPACE_PANEL_IDS) {
    const height = stored.heights?.[panelId]
    if (typeof height === 'number' && Number.isFinite(height) && height >= 144) {
      heights[panelId] = Math.round(height)
    }
    const placement = stored.placements?.[panelId]
    if (isWorkspacePanelPlacement(placement)) placements[panelId] = placement
    const geometry = normalizeWindowGeometry(stored.windows?.[panelId])
    if (geometry) windows[panelId] = geometry
  }
  return {
    compact: stored.compact === true,
    order,
    visible: visible.length > 0 ? visible : ['properties'],
    heights,
    placements,
    windows,
  }
}

export function placeWorkspacePanel(
  layout: WorkspacePanelLayoutPreferences,
  panelId: WorkspacePanelId,
  placement: WorkspacePanelPlacement,
  targetId?: WorkspacePanelId | null,
): WorkspacePanelLayoutPreferences {
  return {
    ...layout,
    order:
      targetId === undefined
        ? layout.order
        : moveWorkspacePanel(layout.order, panelId, targetId),
    placements: { ...layout.placements, [panelId]: placement },
    windows:
      placement === 'floating' && !layout.windows[panelId]
        ? {
            ...layout.windows,
            [panelId]: defaultWindowGeometry(layout.order.indexOf(panelId)),
          }
        : layout.windows,
  }
}

export function keepWorkspaceSelection(
  current: WorkspacePanelId[],
  next: unknown,
): WorkspacePanelId[] {
  if (!Array.isArray(next)) return current
  const visible = [...new Set<WorkspacePanelId>(next.filter(isWorkspacePanelId))]
  return visible.length > 0 ? visible : current
}

export function moveWorkspacePanel(
  order: WorkspacePanelId[],
  panelId: WorkspacePanelId,
  targetId: WorkspacePanelId | null,
): WorkspacePanelId[] {
  const next = order.filter((candidate) => candidate !== panelId)
  const targetIndex = targetId === null ? -1 : next.indexOf(targetId)
  if (targetIndex === -1) next.push(panelId)
  else next.splice(targetIndex, 0, panelId)
  return next
}

export function clearWorkspacePanelHeights(
  heights: Partial<Record<WorkspacePanelId, number>>,
  panelIds: WorkspacePanelId[],
): Partial<Record<WorkspacePanelId, number>> {
  const next = { ...heights }
  for (const panelId of panelIds) delete next[panelId]
  return next
}

export function isWorkspacePanelId(value: unknown): value is WorkspacePanelId {
  return (
    typeof value === 'string' &&
    WORKSPACE_PANEL_IDS.includes(value as WorkspacePanelId)
  )
}

function migrateLegacyPanelLayout(
  legacy: LegacyPanelLayout,
): WorkspacePanelLayoutPreferences {
  const management = normalizeManagementPanelLayout(legacy.management)
  const order: WorkspacePanelId[] = []
  const visible: WorkspacePanelId[] = []
  const heights: Partial<Record<WorkspacePanelId, number>> = {}

  for (const panelId of legacy.order) {
    if (panelId === 'management') {
      order.push(...management.order)
      visible.push(...management.visible)
      Object.assign(heights, management.heights)
      continue
    }
    order.push(panelId)
    visible.push(panelId)
    const height = legacy.heights[panelId]
    if (height !== undefined) heights[panelId] = height
  }

  return normalizeWorkspacePanelLayout(
    { order, visible, heights },
    {
      order: ['room', 'heatmap', 'players', 'management', 'chat'],
      heights: {},
      management: {
        order: ['properties', 'trades', 'bank', 'market'],
        visible: ['properties'],
        heights: {},
      },
    },
  )
}

function defaultWorkspacePlacements(): Record<
  WorkspacePanelId,
  WorkspacePanelPlacement
> {
  return Object.fromEntries(
    WORKSPACE_PANEL_IDS.map((panelId) => [panelId, 'right']),
  ) as Record<WorkspacePanelId, WorkspacePanelPlacement>
}

function defaultWindowGeometry(index: number): WorkspacePanelWindowGeometry {
  const offset = Math.max(0, index) % 5
  return {
    x: 96 + offset * 28,
    y: 64 + offset * 24,
    width: 380,
    height: 520,
  }
}

function isWorkspacePanelPlacement(
  value: unknown,
): value is WorkspacePanelPlacement {
  return value === 'left' || value === 'right' || value === 'floating'
}

function normalizeWindowGeometry(
  value: Partial<WorkspacePanelWindowGeometry> | null | undefined,
): WorkspacePanelWindowGeometry | null {
  if (!value) return null
  const { x, y, width, height } = value
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    x < 0 ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    y < 0 ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width < 280 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height < 180
  ) {
    return null
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}
