import type { CardEffect, ContentPack, GameEvent } from '../types'
import type { GameSound } from './gameAudio'

export interface SoundCue {
  sound: GameSound
  delayMs?: number
  gain?: number
  variant?: number
}

interface EventAudioContext {
  pack: ContentPack
  userId: string
}

export const IMMEDIATE_AUDIO_EVENTS = new Set<GameEvent['type']>([
  'dice.rolled',
  'card.drawn',
  'card.utility_dice_rolled',
])

export function soundCuesForEvent(
  event: GameEvent,
  context: EventAudioContext,
): SoundCue[] {
  const { userId } = context
  switch (event.type) {
    case 'dice.rolled': {
      const dice = Array.isArray(event.data.dice) ? event.data.dice : []
      const cues: SoundCue[] = [
        {
          sound: event.sequence % 2 === 0 ? 'dice-roll-a' : 'dice-roll-b',
          variant: event.sequence,
        },
      ]
      if (dice.length === 2 && dice[0] === dice[1]) {
        cues.push({ sound: 'dice-doubles', delayMs: 360, gain: 0.72 })
      }
      return cues
    }
    case 'card.utility_dice_rolled':
      return [{ sound: 'dice-roll-b', gain: 0.78, variant: event.sequence }]
    case 'card.drawn': {
      const mood = cardMood(context.pack, textValue(event, 'card_id'))
      return [
        { sound: 'card-draw' },
        ...(mood ? [{ sound: mood, delayMs: 240, gain: 0.82 } satisfies SoundCue] : []),
      ]
    }
    case 'game.started':
      return [{ sound: 'game-started' }]
    case 'game.finished':
      return [{ sound: 'game-finished' }]
    case 'game.cancelled':
    case 'game.settings_updated':
    case 'host.transferred':
      return [{ sound: 'ui-important-click', gain: 0.8 }]
    case 'player.joined':
    case 'spectator.joined':
      return [{ sound: 'player-joined', gain: 0.82 }]
    case 'player.left':
    case 'player.resigned':
    case 'spectator.left':
      return [{ sound: 'player-left', gain: 0.82 }]
    case 'property.purchased':
      return [{ sound: 'property-purchase' }]
    case 'property.declined':
      return [{ sound: 'property-declined' }]
    case 'property.mortgaged':
      return [{ sound: 'property-mortgaged' }]
    case 'property.unmortgaged':
      return [{ sound: 'property-unmortgaged' }]
    case 'building.purchased':
      return [
        {
          sound: numberValue(event, 'level') === 5 ? 'building-hotel' : 'building-house',
        },
      ]
    case 'building.sold':
      return [{ sound: 'building-sold' }]
    case 'auction.started':
      return [{ sound: 'auction-start' }]
    case 'auction.bid_placed':
      return [{ sound: 'auction-bid', gain: 0.8 }]
    case 'auction.completed':
      return [
        {
          sound:
            textValue(event, 'winner_id') === userId
              ? 'auction-completed'
              : 'auction-lost',
        },
      ]
    case 'payment.completed': {
      if (textValue(event, 'creditor_id') === userId) {
        return [{ sound: 'payment-received' }]
      }
      if (textValue(event, 'debtor_id') === userId) {
        return [{ sound: 'payment-sent' }]
      }
      return [{ sound: 'payment-sent', gain: 0.55 }]
    }
    case 'card.cash_applied':
      return textValue(event, 'player_id') === userId
        ? [{ sound: 'payment-received', gain: 0.88 }]
        : []
    case 'card.cash_each_applied':
      return textValue(event, 'recipient_id') === userId
        ? [{ sound: 'payment-received', gain: 0.82 }]
        : textValue(event, 'payer_id') === userId
          ? [{ sound: 'payment-sent', gain: 0.82 }]
          : []
    case 'card.repairs_assessed':
    case 'bank_pot.increased':
      return [{ sound: 'tax-or-repairs', gain: 0.82 }]
    case 'salary.collected':
      return [{ sound: 'salary-collected' }]
    case 'free_parking.collected':
      return [{ sound: 'free-parking-collected' }]
    case 'jail.entered':
      return [{ sound: 'jail-entered' }]
    case 'jail.released':
      return [{ sound: 'jail-released' }]
    case 'jail.roll_failed':
      return [{ sound: 'jail-roll-failed' }]
    case 'debt.created':
      return [{ sound: 'debt-created' }]
    case 'debt.paid':
      return [{ sound: 'debt-paid' }]
    case 'trade.proposed':
      return [{ sound: 'trade-proposed' }]
    case 'trade.accepted':
      return [{ sound: 'trade-accepted' }]
    case 'trade.rejected':
      return [{ sound: 'trade-rejected' }]
    case 'trade.countered':
      return [{ sound: 'trade-proposed' }]
    case 'trade.cancelled':
      return [{ sound: 'trade-cancelled' }]
    case 'player.bankrupt':
      return [{ sound: 'player-bankrupt' }]
    case 'turn.started':
      return textValue(event, 'player_id') === userId ? [{ sound: 'turn-yours' }] : []
    case 'turn.extra_roll':
      return textValue(event, 'player_id') === userId
        ? [{ sound: 'turn-extra-roll' }]
        : []
    default:
      return []
  }
}

function cardMood(pack: ContentPack, cardId: string | null): GameSound | null {
  const card = pack.board.decks
    .flatMap((deck) => deck.cards)
    .find((candidate) => candidate.id === cardId)
  if (!card) return null
  const effects = card.effects ?? (card.effect ? [card.effect] : [])
  const score = effects.reduce((total, effect) => total + effectMood(effect), 0)
  if (score > 0) return 'card-positive'
  if (score < 0) return 'card-negative'
  return null
}

function effectMood(effect: CardEffect): number {
  switch (effect.type) {
    case 'cash':
      return Math.sign(effect.amount)
    case 'get_out_of_jail':
      return 1
    case 'go_to_jail':
    case 'repairs':
      return -1
    case 'complete_groups_cash':
      return Math.sign(effect.amount_if_at_least + effect.amount_otherwise)
    case 'owned_properties_cash':
      return Math.sign(effect.amount_per_property)
    case 'mortgaged_properties_cash':
      return Math.sign(effect.amount_per_property)
    default:
      return 0
  }
}

function textValue(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}

function numberValue(event: GameEvent, key: string): number | null {
  const value = event.data[key]
  return typeof value === 'number' ? value : null
}
