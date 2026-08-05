import type {
  ContentPack,
  GameState,
  TileDefinition,
} from '../types'

export type PropertyRuleReason =
  | 'gameNotActive'
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

  const cost =
    level === 4 && tile.hotel_cost != null
      ? tile.hotel_cost
      : (tile.build_cost ?? 0)
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
  if (!player || player.balance < unmortgageCost(pack, tile)) {
    return denied('insufficientBalance')
  }
  return { allowed: true }
}

export function unmortgageCost(
  pack: ContentPack,
  tile: TileDefinition,
): number {
  const value = tile.mortgage_value ?? 0
  return value + Math.ceil((value * pack.manifest.mortgage_interest_percent) / 100)
}

function commonActionBlock(
  game: GameState,
  actorId: string,
  allowedForDebtor: boolean,
): PropertyActionAvailability | null {
  if (game.status !== 'playing') return denied('gameNotActive')
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

function denied(reason: PropertyRuleReason): PropertyActionAvailability {
  return { allowed: false, reason }
}
