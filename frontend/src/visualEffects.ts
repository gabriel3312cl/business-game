import type { GameEvent, GameState } from './types'

export type PropertyEffectAction =
  | 'purchased'
  | 'mortgaged'
  | 'unmortgaged'
  | 'built'
  | 'sold'
  | 'transferred'

export type GameVisualEffect =
  | {
      id: string
      sequence: number
      kind: 'turn'
      playerId: string
    }
  | {
      id: string
      sequence: number
      kind: 'money'
      amount: number
      fromPlayerId: string | null
      toPlayerId: string | null
    }
  | {
      id: string
      sequence: number
      kind: 'property'
      action: PropertyEffectAction
      tileId: string
      playerId: string | null
    }
  | {
      id: string
      sequence: number
      kind: 'card'
      cardId: string
    }
  | {
      id: string
      sequence: number
      kind: 'auction'
      action: 'bid' | 'won'
      tileId: string
      playerId: string | null
      amount: number
    }
  | {
      id: string
      sequence: number
      kind: 'trade'
      proposerId: string
      recipientId: string
      offeredPropertyIds: string[]
      requestedPropertyIds: string[]
      offeredCash: number
      requestedCash: number
    }
  | {
      id: string
      sequence: number
      kind: 'jail'
      action: 'entered' | 'released'
      playerId: string
    }

export interface VisualEffectPlayback {
  active: GameVisualEffect | null
  queue: GameVisualEffect[]
}

export interface VisualEffectEventCursor {
  gameId: string
  sequence: number
  armed: boolean
}

export interface VisualEffectEventSelection {
  cursor: VisualEffectEventCursor
  events: GameEvent[]
  resetPlayback: boolean
}

export function collectNewVisualEffectEvents(
  current: VisualEffectEventCursor,
  gameId: string,
  visibleEvents: GameEvent[],
  baselineSequence: number,
  synchronized: boolean,
): VisualEffectEventSelection {
  if (!synchronized || current.gameId !== gameId || !current.armed) {
    return {
      cursor: {
        gameId,
        sequence: baselineSequence,
        armed: synchronized,
      },
      events: [],
      resetPlayback: true,
    }
  }

  const events = visibleEvents.filter(
    (event) => event.sequence > current.sequence,
  )
  return {
    cursor: {
      ...current,
      sequence: Math.max(current.sequence, latestSequence(visibleEvents)),
    },
    events,
    resetPlayback: false,
  }
}

export function enqueueVisualEffects(
  current: VisualEffectPlayback,
  incoming: GameVisualEffect[],
): VisualEffectPlayback {
  let active = current.active
  let queue = [...current.queue]

  for (const effect of incoming) {
    if (effect.kind === 'auction') {
      queue = queue.filter(
        (queued) =>
          queued.kind !== 'auction' ||
          queued.tileId !== effect.tileId ||
          (effect.action === 'bid' && queued.action === 'won'),
      )

      const replacesActiveBid =
        active?.kind === 'auction' &&
        active.action === 'bid' &&
        active.tileId === effect.tileId

      if (replacesActiveBid || active === null) {
        active = effect
      } else if (effect.action === 'won') {
        queue.unshift(effect)
      } else {
        queue.push(effect)
      }
      continue
    }

    if (active === null) active = effect
    else queue.push(effect)
  }

  while (queue.length > 18) {
    const removableIndex = queue.findIndex(
      (effect) => effect.kind !== 'auction' || effect.action !== 'won',
    )
    queue.splice(removableIndex >= 0 ? removableIndex : 0, 1)
  }

  return { active, queue }
}

export function advanceVisualEffects(
  current: VisualEffectPlayback,
  completedId: string,
): VisualEffectPlayback {
  if (current.active?.id !== completedId) return current
  const [active = null, ...queue] = current.queue
  return { active, queue }
}

export function visualEffectsForEvent(
  event: GameEvent,
  game: GameState,
): GameVisualEffect[] {
  const id = (suffix: string) => `${event.sequence}:${suffix}`
  const playerId = text(event, 'player_id')
  const propertyId =
    text(event, 'property_id') ?? text(event, 'tile_id')

  switch (event.type) {
    case 'turn.started':
      return playerId
        ? [{ id: id('turn'), sequence: event.sequence, kind: 'turn', playerId }]
        : []
    case 'salary.collected':
    case 'free_parking.collected':
      return moneyEffect(event, id('money'), null, playerId)
    case 'card.cash_applied': {
      const amount = number(event, 'amount')
      if (!playerId || amount === null || amount === 0) return []
      return [{
        id: id('money'),
        sequence: event.sequence,
        kind: 'money',
        amount: Math.abs(amount),
        fromPlayerId: amount < 0 ? playerId : null,
        toPlayerId: amount > 0 ? playerId : null,
      }]
    }
    case 'card.cash_each_applied':
      return moneyEffect(
        event,
        id('money'),
        text(event, 'payer_id'),
        text(event, 'recipient_id'),
      )
    case 'payment.completed':
      return moneyEffect(
        event,
        id('money'),
        text(event, 'debtor_id'),
        text(event, 'creditor_id'),
      )
    case 'property.purchased':
      return [
        ...moneyEffect(
          event,
          id('money'),
          playerId,
          null,
          'price',
        ),
        ...propertyEffect(id('property'), event.sequence, 'purchased', propertyId, playerId),
      ]
    case 'property.mortgaged':
      return [
        ...moneyEffect(event, id('money'), null, playerId),
        ...propertyEffect(id('property'), event.sequence, 'mortgaged', propertyId, playerId),
      ]
    case 'property.unmortgaged':
      return [
        ...moneyEffect(event, id('money'), playerId, null),
        ...propertyEffect(id('property'), event.sequence, 'unmortgaged', propertyId, playerId),
      ]
    case 'building.purchased':
      return [
        ...moneyEffect(event, id('money'), playerId, null),
        ...propertyEffect(id('property'), event.sequence, 'built', propertyId, playerId),
      ]
    case 'building.sold':
      return [
        ...moneyEffect(event, id('money'), null, playerId),
        ...propertyEffect(id('property'), event.sequence, 'sold', propertyId, playerId),
      ]
    case 'card.drawn': {
      const cardId = text(event, 'card_id')
      if (
        game.pending_card_draw?.card_id === cardId ||
        game.pending_card_choice?.card_id === cardId ||
        game.pending_card_choice_result?.card_id === cardId
      ) return []
      return cardId
        ? [{ id: id('card'), sequence: event.sequence, kind: 'card', cardId }]
        : []
    }
    case 'auction.bid_placed': {
      const amount = number(event, 'amount')
      return propertyId && amount !== null
        ? [{
            id: id('auction'),
            sequence: event.sequence,
            kind: 'auction',
            action: 'bid',
            tileId: propertyId,
            playerId,
            amount,
          }]
        : []
    }
    case 'auction.completed': {
      const winnerId = text(event, 'winner_id')
      const amount = number(event, 'amount') ?? 0
      if (!propertyId || !winnerId) return []
      return [
        {
          id: id('auction'),
          sequence: event.sequence,
          kind: 'auction',
          action: 'won',
          tileId: propertyId,
          playerId: winnerId,
          amount,
        },
        {
          id: id('property'),
          sequence: event.sequence,
          kind: 'property',
          action: 'transferred',
          tileId: propertyId,
          playerId: winnerId,
        },
      ]
    }
    case 'trade.accepted': {
      const tradeId = text(event, 'trade_id')
      const trade = game.trades.find((candidate) => candidate.id === tradeId)
      if (!trade) return []
      return [{
        id: id('trade'),
        sequence: event.sequence,
        kind: 'trade',
        proposerId: trade.proposer_id,
        recipientId: trade.recipient_id,
        offeredPropertyIds: [...trade.offered_property_ids],
        requestedPropertyIds: [...trade.requested_property_ids],
        offeredCash: trade.offered_cash,
        requestedCash: trade.requested_cash,
      }]
    }
    case 'jail.entered':
    case 'jail.released':
      return playerId
        ? [{
            id: id('jail'),
            sequence: event.sequence,
            kind: 'jail',
            action: event.type === 'jail.entered' ? 'entered' : 'released',
            playerId,
          }]
        : []
    default:
      return []
  }
}

function moneyEffect(
  event: GameEvent,
  id: string,
  fromPlayerId: string | null,
  toPlayerId: string | null,
  amountKey = 'amount',
): GameVisualEffect[] {
  const amount = number(event, amountKey)
  if (
    amount === null ||
    amount <= 0 ||
    (fromPlayerId === null && toPlayerId === null)
  ) return []
  return [{
    id,
    sequence: event.sequence,
    kind: 'money',
    amount,
    fromPlayerId,
    toPlayerId,
  }]
}

function propertyEffect(
  id: string,
  sequence: number,
  action: PropertyEffectAction,
  tileId: string | null,
  playerId: string | null,
): GameVisualEffect[] {
  return tileId
    ? [{ id, sequence, kind: 'property', action, tileId, playerId }]
    : []
}

function text(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function number(event: GameEvent, key: string): number | null {
  const value = event.data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function latestSequence(events: GameEvent[]): number {
  return events.reduce(
    (latest, event) => Math.max(latest, event.sequence),
    0,
  )
}
