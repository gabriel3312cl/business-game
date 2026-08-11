import type { GameCommand, GameState } from './types'

interface AutomationOptions {
  game: GameState
  userId: string
  autoRejectTrades: boolean
  autoRollDice: boolean
  autoEndTurns: boolean
  motionPending: boolean
}

export function nextAutomationCommand({
  game,
  userId,
  autoRejectTrades,
  autoRollDice,
  autoEndTurns,
  motionPending,
}: AutomationOptions): GameCommand | null {
  if (
    game.pending_card_draw ||
    game.pending_card_choice ||
    game.pending_card_choice_result
  ) return null

  if (autoRejectTrades) {
    const incomingTrade = game.trades.find(
      (trade) =>
        trade.status === 'pending' && trade.recipient_id === userId,
    )
    if (incomingTrade) {
      return { action: 'reject_trade', trade_id: incomingTrade.id }
    }
  }

  const currentPlayer = game.players[game.current_player_index]
  const operatingAssessment = game.economy?.operating_cost_assessment
  const operatingCostDue = Boolean(
    operatingAssessment &&
      operatingAssessment.due_week <= game.economy.elapsed_weeks &&
      (operatingAssessment.amounts[userId] ?? 0) > 0 &&
      !operatingAssessment.resolved_player_ids.includes(userId),
  )
  const canActAutomatically =
    !motionPending &&
    game.status === 'playing' &&
    game.pending_auction_selector_id === null &&
    game.active_auction === null &&
    game.active_debt === null &&
    !operatingCostDue &&
    currentPlayer?.user_id === userId &&
    !currentPlayer.bankrupt

  if (autoRollDice && canActAutomatically && game.phase === 'waiting_for_roll') {
    return { action: 'roll' }
  }

  if (autoEndTurns && canActAutomatically && game.phase === 'waiting_for_end') {
    return { action: 'end_turn' }
  }

  return null
}
