import type { ContentPack, GameState } from '../types'

const MAX_SUGGESTIONS = 4

export function buildAdvisorSuggestions(
  game: GameState,
  pack: ContentPack,
  userId: string,
  language: string,
): string[] {
  const spanish = !language.toLowerCase().startsWith('en')
  const suggestions: string[] = []
  const player = game.players.find((candidate) => candidate.user_id === userId)
  if (!player) return []

  const tileName = (tileId: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === tileId)
    return tile ? (pack.messages[tile.name_key] ?? tile.id) : tileId
  }
  const playerName = (playerId: string | null) =>
    game.players.find((candidate) => candidate.user_id === playerId)?.display_name ??
    (spanish ? 'el banco' : 'the bank')

  if (game.active_debt?.debtor_id === userId) {
    suggestions.push(
      spanish
        ? `¿Cómo conviene cubrir la deuda de $${game.active_debt.amount} sin quedar demasiado expuesto?`
        : `How should I cover the $${game.active_debt.amount} debt without becoming too exposed?`,
    )
  }

  if (
    game.active_auction &&
    game.active_auction.eligible_player_ids.includes(userId) &&
    !game.active_auction.passed_player_ids.includes(userId)
  ) {
    const property = tileName(game.active_auction.property_id)
    suggestions.push(
      spanish
        ? `¿Hasta cuánto debería ofertar por ${property} si la puja va en $${game.active_auction.current_bid}?`
        : `How high should I bid for ${property} if the current bid is $${game.active_auction.current_bid}?`,
    )
  }

  if (
    game.phase === 'buy_decision' &&
    game.current_player_index >= 0 &&
    game.players[game.current_player_index]?.user_id === userId &&
    game.pending_tile_id
  ) {
    const tile = pack.board.tiles.find(
      (candidate) => candidate.id === game.pending_tile_id,
    )
    if (tile) {
      suggestions.push(
        spanish
          ? `¿Conviene comprar ${tileName(tile.id)} por $${tile.price ?? 0} si tengo $${player.balance}?`
          : `Should I buy ${tileName(tile.id)} for $${tile.price ?? 0} if I have $${player.balance}?`,
      )
    }
  }

  const pendingTrade = game.trades.find(
    (trade) =>
      trade.status === 'pending' &&
      (trade.proposer_id === userId || trade.recipient_id === userId),
  )
  if (pendingTrade) {
    const counterpartId =
      pendingTrade.proposer_id === userId
        ? pendingTrade.recipient_id
        : pendingTrade.proposer_id
    suggestions.push(
      spanish
        ? `¿Me conviene el trato pendiente con ${playerName(counterpartId)}?`
        : `Is the pending trade with ${playerName(counterpartId)} good for me?`,
    )
  }

  const ownedPropertyIds = Object.entries(game.owners)
    .filter(([, ownerId]) => ownerId === userId)
    .map(([tileId]) => tileId)
  if (ownedPropertyIds.length > 0) {
    suggestions.push(
      spanish
        ? '¿En cuál de mis propiedades conviene invertir primero y cuánta liquidez debería conservar?'
        : 'Which of my properties should I invest in first, and how much cash should I keep?',
    )
  }

  const missingGroupTrade = findMissingGroupTrade(
    game,
    pack,
    userId,
    tileName,
    playerName,
    spanish,
  )
  if (missingGroupTrade) suggestions.push(missingGroupTrade)

  suggestions.push(
    spanish
      ? '¿Cuál es mi mejor decisión ahora y cuál es el principal riesgo?'
      : 'What is my best decision now, and what is the main risk?',
  )
  suggestions.push(
    spanish
      ? '¿Cómo está mi posición frente a los demás jugadores?'
      : 'How strong is my position compared with the other players?',
  )

  return [...new Set(suggestions)].slice(0, MAX_SUGGESTIONS)
}

function findMissingGroupTrade(
  game: GameState,
  pack: ContentPack,
  userId: string,
  tileName: (tileId: string) => string,
  playerName: (playerId: string | null) => string,
  spanish: boolean,
): string | null {
  const groupIds = new Set(
    pack.board.tiles.flatMap((tile) => (tile.group ? [tile.group] : [])),
  )
  for (const groupId of groupIds) {
    const groupTiles = pack.board.tiles.filter((tile) => tile.group === groupId)
    const ownedCount = groupTiles.filter(
      (tile) => game.owners[tile.id] === userId,
    ).length
    if (ownedCount === 0 || ownedCount >= groupTiles.length) continue
    const target = groupTiles.find((tile) => {
      const ownerId = game.owners[tile.id]
      return ownerId && ownerId !== userId
    })
    if (!target) continue
    const ownerId = game.owners[target.id]
    return spanish
      ? `¿Qué trato razonable podría ofrecerle a ${playerName(ownerId)} por ${tileName(target.id)}?`
      : `What reasonable trade could I offer ${playerName(ownerId)} for ${tileName(target.id)}?`
  }
  return null
}
