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
  const canActAutomatically =
    !motionPending &&
    game.status === 'playing' &&
    game.pending_auction_selector_id === null &&
    game.active_auction === null &&
    game.active_debt === null &&
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
