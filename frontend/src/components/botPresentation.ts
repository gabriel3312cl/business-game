import type { GameState } from '../types'

export interface ParticipantPresentationOmissions {
  bots: boolean
  otherHumans: boolean
}

export function shouldBufferParticipantPresentation(
  game: GameState,
  currentUserId: string,
  omissions: ParticipantPresentationOmissions,
): boolean {
  if (
    game.status !== 'playing' ||
    requiresCurrentUserAttention(game, currentUserId)
  ) {
    return false
  }

  const participantIds = presentationParticipantIds(game)
  if (participantIds.size === 0) return false
  return [...participantIds].every((playerId) => {
    const player = game.players.find((candidate) => candidate.user_id === playerId)
    if (!player || player.user_id === currentUserId) return false
    return player.is_bot ? omissions.bots : omissions.otherHumans
  })
}

export function requiresCurrentUserAttention(
  game: GameState,
  currentUserId: string,
): boolean {
  if (game.status !== 'playing') return true
  if (game.players[game.current_player_index]?.user_id === currentUserId) return true
  if (game.pending_card_draw?.player_id === currentUserId) return true
  if (game.pending_card_choice?.player_id === currentUserId) return true
  if (game.pending_card_choice_result?.player_id === currentUserId) return true
  if (game.pending_auction_selector_id === currentUserId) return true
  if (
    game.active_debt &&
    currentUserId === game.active_debt.debtor_id
  ) {
    return true
  }
  if (
    game.active_debt?.creditor_id === currentUserId
  ) {
    return true
  }
  if (
    game.trades.some(
      (trade) =>
        trade.status === 'pending' && trade.recipient_id === currentUserId,
    )
  ) {
    return true
  }
  return currentUserNeedsAuctionAction(game, currentUserId)
}

function presentationParticipantIds(game: GameState): Set<string> {
  const participantIds = new Set<string>()
  const add = (playerId: string | null | undefined) => {
    if (playerId) participantIds.add(playerId)
  }
  const focusedInteraction =
    game.pending_card_draw !== null ||
    game.pending_card_choice !== null ||
    game.pending_card_choice_result !== null ||
    game.pending_auction_selector_id !== null ||
    game.active_auction !== null ||
    game.active_debt !== null
  if (!focusedInteraction) add(game.players[game.current_player_index]?.user_id)
  add(game.pending_card_draw?.player_id)
  add(game.pending_card_choice?.player_id)
  add(game.pending_card_choice_result?.player_id)
  add(game.pending_auction_selector_id)
  add(game.active_debt?.debtor_id)
  add(game.active_debt?.creditor_id)
  const auction = game.active_auction
  for (const playerId of auction?.eligible_player_ids ?? []) {
    if (auction?.passed_player_ids.includes(playerId)) continue
    if (auction?.phase === 'idle') {
      if (!auction.ready_player_ids.includes(playerId)) add(playerId)
    } else if (
      auction?.ready_player_ids.includes(playerId) &&
      auction.current_bidder_id !== playerId
    ) {
      add(playerId)
    }
  }
  for (const trade of game.trades) {
    if (trade.status === 'pending') add(trade.recipient_id)
  }
  return participantIds
}

function currentUserNeedsAuctionAction(
  game: GameState,
  currentUserId: string,
): boolean {
  const auction = game.active_auction
  if (
    !auction ||
    !auction.eligible_player_ids.includes(currentUserId) ||
    auction.passed_player_ids.includes(currentUserId)
  ) {
    return false
  }
  if (auction.phase === 'idle') {
    return !auction.ready_player_ids.includes(currentUserId)
  }
  return (
    auction.ready_player_ids.includes(currentUserId) &&
    auction.current_bidder_id !== currentUserId
  )
}
