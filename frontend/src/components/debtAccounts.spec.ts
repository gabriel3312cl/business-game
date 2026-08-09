import { describe, expect, it } from 'vitest'
import type { GameState, RentDebtPlanState } from '../types'
import { nextRentInstallmentAmount, playerDebtAccounts } from './debtAccounts'

function plan(
  id: string,
  debtorId: string,
  creditorId: string,
  remainingAmount = 73,
  installmentsRemaining = 2,
): RentDebtPlanState {
  return {
    id,
    debtor_id: debtorId,
    creditor_id: creditorId,
    tile_id: 'property_03',
    original_amount: 100,
    interest_percent: 10,
    total_amount: 110,
    remaining_amount: remainingAmount,
    installments_total: 3,
    installments_remaining: installmentsRemaining,
    template: 'custom',
    created_at_sequence: 10,
  }
}

describe('player debt accounts', () => {
  it('separates what the player owes from what others owe them', () => {
    const game = {
      rent_debt_plans: [
        plan('payable', 'me', 'bot'),
        plan('receivable', 'rival', 'me'),
        plan('unrelated', 'rival', 'bot'),
      ],
    } as GameState

    expect(playerDebtAccounts(game, 'me')).toEqual({
      payable: [game.rent_debt_plans[0]],
      receivable: [game.rent_debt_plans[1]],
    })
  })

  it('rounds the next installment up like the server', () => {
    expect(nextRentInstallmentAmount(plan('plan', 'me', 'bot'))).toBe(37)
  })
})
