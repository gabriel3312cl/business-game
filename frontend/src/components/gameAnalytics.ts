import type { ContentPack, GameEvent, GameState, PlayerState } from '../types'
import { buildPortfolioPerformance } from './portfolioPerformance'

export type ActivityCategory =
  | 'movement'
  | 'property'
  | 'cashflow'
  | 'finance'
  | 'negotiation'
  | 'game'

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'movement',
  'property',
  'cashflow',
  'finance',
  'negotiation',
  'game',
]

export interface PlayerAnalytics {
  player: PlayerState
  cash: number
  propertyIds: string[]
  propertyCount: number
  propertyValue: number
  mortgagedCount: number
  houseCount: number
  hotelCount: number
  buildingValue: number
  investmentValue: number
  loanDebt: number
  installmentDebt: number
  immediateDebt: number
  totalDebt: number
  estimatedNetWorth: number
  linkedEvents: number
  turns: number
  diceRolls: number
  completedLaps: number
  acceptedTrades: number
}

export interface ActivityBucket {
  from: number
  to: number
  counts: Record<ActivityCategory, number>
  total: number
}

export interface GameAnalytics {
  players: PlayerAnalytics[]
  activePlayers: number
  totalCash: number
  totalPropertyValue: number
  totalBuildingValue: number
  totalInvestmentValue: number
  totalDebt: number
  totalEstimatedNetWorth: number
  ownedProperties: number
  mortgagedProperties: number
  eventCounts: Record<ActivityCategory, number>
  eventTypeCounts: Array<{ type: string; count: number }>
  activityBuckets: ActivityBucket[]
  missingEventSequences: number
  firstEventSequence: number | null
  lastEventSequence: number | null
}

const PLAYER_ID_KEYS = [
  'player_id',
  'user_id',
  'actor_id',
  'payer_id',
  'recipient_id',
  'debtor_id',
  'creditor_id',
  'proposer_id',
  'winner_id',
  'buyer_id',
  'seller_id',
  'bidder_id',
  'current_bidder_id',
  'previous_player_id',
  'next_player_id',
  'target_player_id',
  'bot_id',
] as const

export function activityCategory(type: GameEvent['type']): ActivityCategory {
  if (type.startsWith('investment.') || type.startsWith('bank.')) return 'finance'
  if (
    type.startsWith('trade.') ||
    type.startsWith('debt.') ||
    type.startsWith('relationship.')
  ) {
    return 'negotiation'
  }
  if (
    type.startsWith('property.') ||
    type.startsWith('building.') ||
    type.startsWith('auction.')
  ) {
    return 'property'
  }
  if (
    type.startsWith('dice.') ||
    type.startsWith('turn.') ||
    type.startsWith('jail.') ||
    type === 'card.player_moved'
  ) {
    return 'movement'
  }
  if (
    type.startsWith('payment.') ||
    type.startsWith('salary.') ||
    type.startsWith('free_parking.') ||
    type.startsWith('bank_pot.') ||
    type.startsWith('card.cash_') ||
    type === 'card.repairs_assessed'
  ) {
    return 'cashflow'
  }
  return 'game'
}

export function eventPlayerIds(event: GameEvent, game: GameState): string[] {
  const knownPlayerIds = new Set(game.players.map((player) => player.user_id))
  const result = new Set<string>()
  for (const key of PLAYER_ID_KEYS) {
    const value = event.data[key]
    if (typeof value === 'string' && knownPlayerIds.has(value)) result.add(value)
  }
  const playerIds = event.data.player_ids
  if (Array.isArray(playerIds)) {
    for (const value of playerIds) {
      if (typeof value === 'string' && knownPlayerIds.has(value)) result.add(value)
    }
  }
  return game.players
    .map((player) => player.user_id)
    .filter((playerId) => result.has(playerId))
}

export function eventRelatesToPlayer(
  event: GameEvent,
  game: GameState,
  playerId: string,
): boolean {
  return eventPlayerIds(event, game).includes(playerId)
}

export function buildActivityBuckets(
  events: GameEvent[],
  maximumBuckets = 12,
): ActivityBucket[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((left, right) => left.sequence - right.sequence)
  const bucketSize = Math.max(1, Math.ceil(sorted.length / maximumBuckets))
  const buckets: ActivityBucket[] = []
  for (let index = 0; index < sorted.length; index += bucketSize) {
    const slice = sorted.slice(index, index + bucketSize)
    const counts = emptyActivityCounts()
    for (const event of slice) counts[activityCategory(event.type)] += 1
    buckets.push({
      from: slice[0].sequence,
      to: slice[slice.length - 1].sequence,
      counts,
      total: slice.length,
    })
  }
  return buckets
}

export function buildGameAnalytics(
  game: GameState,
  pack: ContentPack,
): GameAnalytics {
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  const mortgaged = new Set(game.mortgaged_property_ids)
  const sortedEvents = [...game.events].sort(
    (left, right) => left.sequence - right.sequence,
  )
  const players = game.players
    .map((player): PlayerAnalytics => {
      const propertyIds = Object.entries(game.owners)
        .filter(([, ownerId]) => ownerId === player.user_id)
        .map(([propertyId]) => propertyId)
      const propertyValue = propertyIds.reduce(
        (total, propertyId) => total + (tileById.get(propertyId)?.price ?? 0),
        0,
      )
      let houseCount = 0
      let hotelCount = 0
      let buildingValue = 0
      for (const propertyId of propertyIds) {
        const level = game.building_levels[propertyId] ?? 0
        const tile = tileById.get(propertyId)
        if (level >= 5) {
          hotelCount += 1
          buildingValue +=
            4 * (tile?.build_cost ?? 0) + (tile?.hotel_cost ?? tile?.build_cost ?? 0)
        } else {
          houseCount += level
          buildingValue += level * (tile?.build_cost ?? 0)
        }
      }
      const investmentValue = buildPortfolioPerformance(game, player.user_id).currentValue
      const loanDebt = game.bank.loans
        .filter((loan) => loan.player_id === player.user_id)
        .reduce((total, loan) => total + loan.remaining_balance, 0)
      const installmentDebt = game.rent_debt_plans
        .filter((plan) => plan.debtor_id === player.user_id)
        .reduce((total, plan) => total + plan.remaining_amount, 0)
      const immediateDebt =
        game.active_debt?.debtor_id === player.user_id &&
        game.active_debt.installment_plan_id === null
          ? game.active_debt.amount
          : 0
      const totalDebt = loanDebt + installmentDebt + immediateDebt
      const playerEvents = sortedEvents.filter((event) =>
        eventRelatesToPlayer(event, game, player.user_id),
      )
      return {
        player,
        cash: player.balance,
        propertyIds,
        propertyCount: propertyIds.length,
        propertyValue,
        mortgagedCount: propertyIds.filter((propertyId) => mortgaged.has(propertyId))
          .length,
        houseCount,
        hotelCount,
        buildingValue,
        investmentValue,
        loanDebt,
        installmentDebt,
        immediateDebt,
        totalDebt,
        estimatedNetWorth:
          player.balance + propertyValue + buildingValue + investmentValue - totalDebt,
        linkedEvents: playerEvents.length,
        turns: playerEvents.filter((event) => event.type === 'turn.started').length,
        diceRolls: playerEvents.filter((event) => event.type === 'dice.rolled').length,
        completedLaps: playerEvents.filter(
          (event) => event.type === 'salary.collected',
        ).length,
        acceptedTrades: playerEvents.filter((event) => event.type === 'trade.accepted')
          .length,
      }
    })
    .sort((left, right) => right.estimatedNetWorth - left.estimatedNetWorth)

  const eventCounts = emptyActivityCounts()
  const eventTypes = new Map<string, number>()
  for (const event of sortedEvents) {
    eventCounts[activityCategory(event.type)] += 1
    eventTypes.set(event.type, (eventTypes.get(event.type) ?? 0) + 1)
  }
  let missingEventSequences = 0
  for (let index = 1; index < sortedEvents.length; index += 1) {
    missingEventSequences += Math.max(
      0,
      sortedEvents[index].sequence - sortedEvents[index - 1].sequence - 1,
    )
  }
  if (game.events_complete && sortedEvents.length > 0) {
    missingEventSequences += Math.max(0, sortedEvents[0].sequence - 1)
    missingEventSequences += Math.max(
      0,
      game.event_sequence - sortedEvents[sortedEvents.length - 1].sequence,
    )
  }

  return {
    players,
    activePlayers: game.players.filter((player) => !player.bankrupt).length,
    totalCash: sum(players, 'cash'),
    totalPropertyValue: sum(players, 'propertyValue'),
    totalBuildingValue: sum(players, 'buildingValue'),
    totalInvestmentValue: sum(players, 'investmentValue'),
    totalDebt: sum(players, 'totalDebt'),
    totalEstimatedNetWorth: sum(players, 'estimatedNetWorth'),
    ownedProperties: players.reduce((total, player) => total + player.propertyCount, 0),
    mortgagedProperties: players.reduce(
      (total, player) => total + player.mortgagedCount,
      0,
    ),
    eventCounts,
    eventTypeCounts: [...eventTypes.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type)),
    activityBuckets: buildActivityBuckets(sortedEvents),
    missingEventSequences,
    firstEventSequence: sortedEvents[0]?.sequence ?? null,
    lastEventSequence: sortedEvents[sortedEvents.length - 1]?.sequence ?? null,
  }
}

function emptyActivityCounts(): Record<ActivityCategory, number> {
  return {
    movement: 0,
    property: 0,
    cashflow: 0,
    finance: 0,
    negotiation: 0,
    game: 0,
  }
}

function sum(
  players: PlayerAnalytics[],
  field:
    | 'cash'
    | 'propertyValue'
    | 'buildingValue'
    | 'investmentValue'
    | 'totalDebt'
    | 'estimatedNetWorth',
): number {
  return players.reduce((total, player) => total + player[field], 0)
}
