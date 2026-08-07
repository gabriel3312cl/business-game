import type { GameEvent } from '../types'

export type ActivityTone =
  | 'income'
  | 'expense'
  | 'movement'
  | 'property'
  | 'trade'
  | 'card'
  | 'alert'
  | 'info'

interface EventPresentation {
  tone: ActivityTone
  color: string
}

const ACTIVITY_COLORS: Record<ActivityTone, string> = {
  income: '#67dc8a',
  expense: '#ff6b74',
  movement: '#70b7ff',
  property: '#ffb45c',
  trade: '#b69cff',
  card: '#ffd166',
  alert: '#ff8a65',
  info: '#94a0b8',
}

export function activityPresentation(event: GameEvent): EventPresentation {
  const tone = activityTone(event)
  return { tone, color: ACTIVITY_COLORS[tone] }
}

export function activityTone(event: GameEvent): ActivityTone {
  if (event.type === 'card.cash_applied') {
    const amount = event.data.amount
    if (typeof amount === 'number' && amount > 0) return 'income'
    if (typeof amount === 'number' && amount < 0) return 'expense'
    return 'card'
  }

  if (
    [
      'salary.collected',
      'free_parking.collected',
      'property.mortgaged',
      'building.sold',
      'bank.loan_issued',
      'bank.emergency_issued',
      'investment.shares_sold',
      'investment.dividend_paid',
      'investment.institution_revenue',
      'investment.position_liquidated',
    ].includes(event.type)
  ) {
    return 'income'
  }

  if (
    [
      'payment.completed',
      'debt.paid',
      'debt.installment_paid',
      'property.purchased',
      'property.unmortgaged',
      'building.purchased',
      'card.cash_each_applied',
      'card.repairs_assessed',
      'bank.loan_payment',
      'investment.shares_bought',
    ].includes(event.type)
  ) {
    return 'expense'
  }

  if (
    [
      'debt.created',
      'debt.plan_cancelled',
      'bank.loan_payment_missed',
      'bank.loan_defaulted',
      'player.bankrupt',
      'player.resigned',
      'game.cancelled',
    ].includes(event.type)
  ) {
    return 'alert'
  }

  if (
    [
      'dice.rolled',
      'turn.started',
      'turn.extra_roll',
      'card.player_moved',
      'card.utility_dice_rolled',
      'jail.entered',
      'jail.released',
      'jail.roll_failed',
    ].includes(event.type)
  ) {
    return 'movement'
  }

  if (event.type.startsWith('property.') || event.type.startsWith('auction.')) {
    return 'property'
  }
  if (event.type.startsWith('trade.') || event.type === 'relationship.changed') {
    return 'trade'
  }
  if (event.type.startsWith('card.')) return 'card'
  return 'info'
}
