import type {
  ManagementPanelId,
  ManagementPanelLayoutPreferences,
} from '../types'

export const MANAGEMENT_PANEL_IDS: ManagementPanelId[] = [
  'properties',
  'trades',
  'bank',
  'market',
]

export const DEFAULT_MANAGEMENT_PANEL_LAYOUT: ManagementPanelLayoutPreferences = {
  order: MANAGEMENT_PANEL_IDS,
  visible: ['properties'],
  heights: {},
}

export function normalizeManagementPanelLayout(
  stored?: Partial<ManagementPanelLayoutPreferences>,
): ManagementPanelLayoutPreferences {
  const storedOrder = Array.isArray(stored?.order)
    ? stored.order.filter(isManagementPanelId)
    : []
  const order = [
    ...new Set<ManagementPanelId>([...storedOrder, ...MANAGEMENT_PANEL_IDS]),
  ]
  const storedVisible = Array.isArray(stored?.visible)
    ? stored.visible.filter(isManagementPanelId)
    : []
  const visible = [...new Set<ManagementPanelId>(storedVisible)]
  const heights: Partial<Record<ManagementPanelId, number>> = {}
  for (const panelId of MANAGEMENT_PANEL_IDS) {
    const height = stored?.heights?.[panelId]
    if (typeof height === 'number' && Number.isFinite(height) && height >= 144) {
      heights[panelId] = Math.round(height)
    }
  }
  return {
    order,
    visible: visible.length > 0 ? visible : ['properties'],
    heights,
  }
}

export function keepManagementSelection(
  current: ManagementPanelId[],
  next: unknown,
): ManagementPanelId[] {
  if (!Array.isArray(next)) return current
  const visible = [...new Set<ManagementPanelId>(next.filter(isManagementPanelId))]
  return visible.length > 0 ? visible : current
}

export function moveManagementPanel(
  order: ManagementPanelId[],
  panelId: ManagementPanelId,
  targetId: ManagementPanelId | null,
): ManagementPanelId[] {
  const next = order.filter((candidate) => candidate !== panelId)
  const targetIndex = targetId === null ? -1 : next.indexOf(targetId)
  if (targetIndex === -1) next.push(panelId)
  else next.splice(targetIndex, 0, panelId)
  return next
}

export function clearManagementPanelHeights(
  heights: Partial<Record<ManagementPanelId, number>>,
  panelIds: ManagementPanelId[],
): Partial<Record<ManagementPanelId, number>> {
  const next = { ...heights }
  for (const panelId of panelIds) delete next[panelId]
  return next
}

export function isManagementPanelId(value: unknown): value is ManagementPanelId {
  return (
    typeof value === 'string' &&
    MANAGEMENT_PANEL_IDS.includes(value as ManagementPanelId)
  )
}
