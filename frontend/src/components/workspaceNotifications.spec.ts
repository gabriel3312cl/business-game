import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../types'
import {
  countWorkspaceEventNotifications,
  workspaceNotificationPanelForEvent,
} from './workspaceNotifications'

function event(
  sequence: number,
  type: GameEvent['type'],
  data: GameEvent['data'],
): GameEvent {
  return {
    sequence,
    type,
    data,
    occurred_at: '2026-08-10T12:00:00Z',
  }
}

describe('workspace notifications', () => {
  it('counts only incoming trades after the read cursor', () => {
    const events = [
      event(3, 'trade.proposed', {
        proposer_id: 'other',
        recipient_id: 'me',
      }),
      event(4, 'trade.proposed', {
        proposer_id: 'me',
        recipient_id: 'other',
      }),
      event(5, 'trade.countered', {
        proposer_id: 'other',
        recipient_id: 'me',
      }),
    ]

    expect(countWorkspaceEventNotifications(events, 3, 'me')).toEqual({
      trades: 1,
      debts: 0,
      chat: 0,
    })
  })

  it('notifies the player who receives each debt update', () => {
    expect(
      workspaceNotificationPanelForEvent(
        event(1, 'debt.created', {
          debtor_id: 'other',
          creditor_id: 'me',
        }),
        'me',
      ),
    ).toBe('debts')
    expect(
      workspaceNotificationPanelForEvent(
        event(2, 'debt.plan_proposed', {
          debtor_id: 'me',
          creditor_id: 'other',
        }),
        'me',
      ),
    ).toBe('debts')
    expect(
      workspaceNotificationPanelForEvent(
        event(3, 'debt.plan_rejected', {
          debtor_id: 'me',
          creditor_id: 'other',
        }),
        'me',
      ),
    ).toBeNull()
    expect(
      workspaceNotificationPanelForEvent(
        event(4, 'debt.plan_rejected', {
          debtor_id: 'other',
          creditor_id: 'me',
        }),
        'me',
      ),
    ).toBe('debts')
  })

  it('ignores unrelated event types and other players', () => {
    const events = [
      event(8, 'turn.started', { player_id: 'me' }),
      event(9, 'debt.created', {
        debtor_id: 'one',
        creditor_id: 'two',
      }),
    ]

    expect(countWorkspaceEventNotifications(events, 0, 'me')).toEqual({
      trades: 0,
      debts: 0,
      chat: 0,
    })
  })
})
