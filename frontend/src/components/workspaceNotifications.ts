import type { GameEvent } from '../types'

export type WorkspaceNotificationPanel = 'trades' | 'debts' | 'chat'

export type WorkspaceNotificationCounts = Record<
  WorkspaceNotificationPanel,
  number
>

export const EMPTY_WORKSPACE_NOTIFICATION_COUNTS: WorkspaceNotificationCounts = {
  trades: 0,
  debts: 0,
  chat: 0,
}

export function countWorkspaceEventNotifications(
  events: GameEvent[],
  afterSequence: number,
  userId: string,
): WorkspaceNotificationCounts {
  const counts = { ...EMPTY_WORKSPACE_NOTIFICATION_COUNTS }
  for (const event of events) {
    if (event.sequence <= afterSequence) continue
    const panel = workspaceNotificationPanelForEvent(event, userId)
    if (panel) counts[panel] += 1
  }
  return counts
}

export function workspaceNotificationPanelForEvent(
  event: GameEvent,
  userId: string,
): Exclude<WorkspaceNotificationPanel, 'chat'> | null {
  const debtorId = textValue(event, 'debtor_id')
  const creditorId = textValue(event, 'creditor_id')

  switch (event.type) {
    case 'trade.proposed':
    case 'trade.countered':
      return textValue(event, 'recipient_id') === userId ? 'trades' : null
    case 'debt.created':
      return debtorId === userId || creditorId === userId ? 'debts' : null
    case 'debt.collection_demanded':
    case 'debt.plan_proposed':
      return debtorId === userId ? 'debts' : null
    case 'debt.plan_rejected':
      return creditorId === userId ? 'debts' : null
    default:
      return null
  }
}

function textValue(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}
