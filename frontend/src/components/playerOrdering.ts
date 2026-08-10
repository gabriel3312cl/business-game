import type {
  ContentPack,
  GameState,
  PlayerSortOption,
  PlayerState,
} from '../types'
import { buildGameAnalytics } from './gameAnalytics'

export type { PlayerSortOption } from '../types'

export interface PlayerListEntry {
  player: PlayerState
  playerIndex: number
  estimatedNetWorth: number
}

export function buildPlayerListEntries(
  game: GameState,
  pack: ContentPack,
  sortOption: PlayerSortOption,
  locale: string,
): PlayerListEntry[] {
  const netWorthByPlayerId = new Map(
    buildGameAnalytics(game, pack).players.map((entry) => [
      entry.player.user_id,
      entry.estimatedNetWorth,
    ]),
  )
  const entries = game.players.map((player, playerIndex) => ({
    player,
    playerIndex,
    estimatedNetWorth: netWorthByPlayerId.get(player.user_id) ?? player.balance,
  }))
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  })

  return entries.sort((left, right) => {
    if (sortOption === 'netWorth') {
      return (
        right.estimatedNetWorth - left.estimatedNetWorth ||
        left.playerIndex - right.playerIndex
      )
    }
    if (sortOption === 'cash') {
      return (
        right.player.balance - left.player.balance ||
        left.playerIndex - right.playerIndex
      )
    }
    if (sortOption === 'name') {
      return (
        collator.compare(left.player.display_name, right.player.display_name) ||
        left.playerIndex - right.playerIndex
      )
    }
    return left.playerIndex - right.playerIndex
  })
}
