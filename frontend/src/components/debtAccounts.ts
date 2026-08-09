import type { GameState, RentDebtPlanState } from '../types'

export interface PlayerDebtAccounts {
  payable: RentDebtPlanState[]
  receivable: RentDebtPlanState[]
}

export function playerDebtAccounts(
  game: GameState,
  playerId: string,
): PlayerDebtAccounts {
  return {
    payable: game.rent_debt_plans.filter((plan) => plan.debtor_id === playerId),
    receivable: game.rent_debt_plans.filter(
      (plan) => plan.creditor_id === playerId,
    ),
  }
}

export function nextRentInstallmentAmount(plan: RentDebtPlanState): number {
  return Math.ceil(plan.remaining_amount / plan.installments_remaining)
}
