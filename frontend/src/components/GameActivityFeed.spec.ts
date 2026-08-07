import { describe, expect, it } from 'vitest'
import type { GameEvent, GameEventType } from '../types'
import { activityTone } from './gameActivityFeedPresentation'

function event(type: GameEventType, data: Record<string, unknown> = {}): GameEvent {
  return {
    sequence: 1,
    type,
    occurred_at: '2026-08-06T12:00:00Z',
    data,
  }
}

describe('activityTone', () => {
  it.each([
    'salary.collected',
    'free_parking.collected',
    'property.mortgaged',
    'investment.dividend_paid',
  ] satisfies GameEventType[])('marks %s as income', (type) => {
    expect(activityTone(event(type))).toBe('income')
  })

  it.each([
    'payment.completed',
    'debt.paid',
    'property.purchased',
    'bank.loan_payment',
  ] satisfies GameEventType[])('marks %s as an expense', (type) => {
    expect(activityTone(event(type))).toBe('expense')
  })

  it('uses the sign of a card balance adjustment', () => {
    expect(activityTone(event('card.cash_applied', { amount: 100 }))).toBe('income')
    expect(activityTone(event('card.cash_applied', { amount: -100 }))).toBe('expense')
    expect(activityTone(event('card.cash_applied', { amount: 0 }))).toBe('card')
  })

  it('gives movement, trade, property and alert events distinct tones', () => {
    expect(activityTone(event('dice.rolled'))).toBe('movement')
    expect(activityTone(event('trade.proposed'))).toBe('trade')
    expect(activityTone(event('auction.started'))).toBe('property')
    expect(activityTone(event('player.bankrupt'))).toBe('alert')
  })
})
