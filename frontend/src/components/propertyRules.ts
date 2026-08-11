import type {
  ContentPack,
  GameState,
  TileDefinition,
} from '../types'
import { indexedAmount } from './economicValues'

export type PropertyRuleReason =
  | 'gameNotActive'
  | 'notYourTurn'
  | 'notOwner'
  | 'propertyOnly'
  | 'completeGroupRequired'
  | 'mortgagedGroup'
  | 'hotelAlreadyBuilt'
  | 'buildEvenly'
  | 'sellEvenly'
  | 'noBuilding'
  | 'insufficientBalance'
  | 'noHousesAvailable'
  | 'noHotelsAvailable'
  | 'fourHousesRequired'
  | 'auctionInProgress'
  | 'auctionSelectionInProgress'
  | 'debtBlocksAction'
  | 'debtorOnly'
  | 'alreadyMortgaged'
  | 'notMortgaged'
  | 'sellGroupBuildingsFirst'

export interface PropertyActionAvailability {
  allowed: boolean
  reason?: PropertyRuleReason
}

export interface GroupRoundAvailability extends PropertyActionAvailability {
  amount: number
  propertyCount: number
}

export function propertyGroupTiles(
  pack: ContentPack,
  tile: TileDefinition,
): TileDefinition[] {
  if (tile.kind !== 'property' || !tile.group) return []
  return pack.board.tiles.filter(
    (candidate) =>
      candidate.kind === 'property' && candidate.group === tile.group,
  )
}

export function buildAvailability(
  game: GameState,
  pack: ContentPack,
  tile: TileDefinition,
  actorId: string,
): PropertyActionAvailability {
  const blocked = commonActionBlock(game, actorId, false)
  if (blocked) return blocked
  if (game.owners[tile.id] !== actorId) return denied('notOwner')
  if (tile.kind !== 'property') return denied('propertyOnly')

  const groupTiles = propertyGroupTiles(pack, tile)
  if (!groupTiles.every((item) => game.owners[item.id] === actorId)) {
    return denied('completeGroupRequired')
  }
  if (groupTiles.some((item) => game.mortgaged_property_ids.includes(item.id))) {
    return denied('mortgagedGroup')
  }

  const level = game.building_levels[tile.id] ?? 0
  if (level >= 5) return denied('hotelAlreadyBuilt')
  const minimumLevel = Math.min(
    ...groupTiles.map((item) => game.building_levels[item.id] ?? 0),
  )
  if (level !== minimumLevel) return denied('buildEvenly')

  const cost = indexedAmount(
    game,
    level === 4 && tile.hotel_cost != null
      ? tile.hotel_cost
      : (tile.build_cost ?? 0),
  )
  const player = game.players.find((candidate) => candidate.user_id === actorId)
  if (!player || player.balance < cost) return denied('insufficientBalance')
  if (level < 4 && game.houses_remaining < 1) {
    return denied('noHousesAvailable')
  }
  if (level === 4 && game.hotels_remaining < 1) {
    return denied('noHotelsAvailable')
  }
  return { allowed: true }
}

export function sellBuildingAvailability(
  game: GameState,
  pack: ContentPack,
  tile: TileDefinition,
  actorId: string,
): PropertyActionAvailability {
  const blocked = commonActionBlock(game, actorId, true)
  if (blocked) return blocked
  if (game.owners[tile.id] !== actorId) return denied('notOwner')
  if (tile.kind !== 'property') return denied('propertyOnly')

  const groupTiles = propertyGroupTiles(pack, tile)
  const level = game.building_levels[tile.id] ?? 0
  if (level <= 0) return denied('noBuilding')
  const maximumLevel = Math.max(
    ...groupTiles.map((item) => game.building_levels[item.id] ?? 0),
  )
  if (level !== maximumLevel) return denied('sellEvenly')
  if (level === 5 && game.houses_remaining < 4) {
    return denied('fourHousesRequired')
  }
  return { allowed: true }
}

export function buildGroupRoundAvailability(
  game: GameState,
  groupTiles: TileDefinition[],
  actorId: string,
): GroupRoundAvailability {
  const blocked = commonActionBlock(game, actorId, false)
  if (blocked) return groupDenied(blocked.reason)
  if (
    groupTiles.length === 0 ||
    groupTiles.some(
      (tile) => tile.kind !== 'property' || game.owners[tile.id] !== actorId,
    )
  ) {
    return groupDenied('completeGroupRequired')
  }
  if (groupTiles.some((tile) => game.mortgaged_property_ids.includes(tile.id))) {
    return groupDenied('mortgagedGroup')
  }
  const levels = groupTiles.map((tile) => game.building_levels[tile.id] ?? 0)
  const minimumLevel = Math.min(...levels)
  const maximumLevel = Math.max(...levels)
  if (maximumLevel - minimumLevel > 1) return groupDenied('buildEvenly')
  if (minimumLevel >= 5) return groupDenied('hotelAlreadyBuilt')
  const targetTiles = groupTiles.filter(
    (tile) => (game.building_levels[tile.id] ?? 0) === minimumLevel,
  )
  const amount = targetTiles.reduce(
    (total, tile) =>
      total +
      indexedAmount(game, minimumLevel === 4 && tile.hotel_cost != null
        ? tile.hotel_cost
        : (tile.build_cost ?? 0)),
    0,
  )
  const player = game.players.find((candidate) => candidate.user_id === actorId)
  if (!player || player.balance < amount) return groupDenied('insufficientBalance')
  if (minimumLevel < 4 && game.houses_remaining < targetTiles.length) {
    return groupDenied('noHousesAvailable')
  }
  if (minimumLevel === 4 && game.hotels_remaining < targetTiles.length) {
    return groupDenied('noHotelsAvailable')
  }
  return { allowed: true, amount, propertyCount: targetTiles.length }
}

export function sellGroupRoundAvailability(
  game: GameState,
  pack: ContentPack,
  groupTiles: TileDefinition[],
  actorId: string,
): GroupRoundAvailability {
  const blocked = commonActionBlock(game, actorId, true)
  if (blocked) return groupDenied(blocked.reason)
  if (
    groupTiles.length === 0 ||
    groupTiles.some(
      (tile) => tile.kind !== 'property' || game.owners[tile.id] !== actorId,
    )
  ) {
    return groupDenied('completeGroupRequired')
  }
  const levels = groupTiles.map((tile) => game.building_levels[tile.id] ?? 0)
  const minimumLevel = Math.min(...levels)
  const maximumLevel = Math.max(...levels)
  if (maximumLevel - minimumLevel > 1) return groupDenied('sellEvenly')
  if (maximumLevel <= 0) return groupDenied('noBuilding')
  const targetTiles = groupTiles.filter(
    (tile) => (game.building_levels[tile.id] ?? 0) === maximumLevel,
  )
  const hotelsToSell = targetTiles.filter(
    (tile) => (game.building_levels[tile.id] ?? 0) === 5,
  ).length
  if (game.houses_remaining < hotelsToSell * 4) {
    return groupDenied('fourHousesRequired')
  }
  const amount = targetTiles.reduce((total, tile) => {
    const cost =
      maximumLevel === 5 && tile.hotel_cost != null
        ? tile.hotel_cost
        : (tile.build_cost ?? 0)
    return total + Math.floor(
      (indexedAmount(game, cost) * pack.manifest.building_sell_percent) / 100,
    )
  }, 0)
  return { allowed: true, amount, propertyCount: targetTiles.length }
}

export function mortgageAvailability(
  game: GameState,
  pack: ContentPack,
  tile: TileDefinition,
  actorId: string,
): PropertyActionAvailability {
  const blocked = commonActionBlock(game, actorId, true)
  if (blocked) return blocked
  if (game.owners[tile.id] !== actorId) return denied('notOwner')
  if (game.mortgaged_property_ids.includes(tile.id)) {
    return denied('alreadyMortgaged')
  }
  if (
    tile.kind === 'property' &&
    propertyGroupTiles(pack, tile).some(
      (item) => (game.building_levels[item.id] ?? 0) > 0,
    )
  ) {
    return denied('sellGroupBuildingsFirst')
  }
  return { allowed: true }
}

export function unmortgageAvailability(
  game: GameState,
  pack: ContentPack,
  tile: TileDefinition,
  actorId: string,
): PropertyActionAvailability {
  const blocked = commonActionBlock(game, actorId, false)
  if (blocked) return blocked
  if (game.owners[tile.id] !== actorId) return denied('notOwner')
  if (!game.mortgaged_property_ids.includes(tile.id)) {
    return denied('notMortgaged')
  }
  const player = game.players.find((candidate) => candidate.user_id === actorId)
  if (!player || player.balance < unmortgageCost(game, pack, tile)) {
    return denied('insufficientBalance')
  }
  return { allowed: true }
}

export function unmortgageCost(
  game: GameState,
  pack: ContentPack,
  tile: TileDefinition,
): number {
  const value = indexedAmount(game, tile.mortgage_value ?? 0)
  return value + Math.ceil((value * pack.manifest.mortgage_interest_percent) / 100)
}

function commonActionBlock(
  game: GameState,
  actorId: string,
  allowedForDebtor: boolean,
): PropertyActionAvailability | null {
  if (game.status !== 'playing') return denied('gameNotActive')
  if (game.players[game.current_player_index]?.user_id !== actorId) {
    return denied('notYourTurn')
  }
  if (game.active_auction) return denied('auctionInProgress')
  if (game.pending_auction_selector_id) {
    return denied('auctionSelectionInProgress')
  }
  if (game.active_debt) {
    if (game.active_debt.debtor_id !== actorId) return denied('debtorOnly')
    if (!allowedForDebtor) return denied('debtBlocksAction')
  }
  return null
}

function groupDenied(reason?: PropertyRuleReason): GroupRoundAvailability {
  return { allowed: false, reason, amount: 0, propertyCount: 0 }
}

function denied(reason: PropertyRuleReason): PropertyActionAvailability {
  return { allowed: false, reason }
}
