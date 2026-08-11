import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import type {
  ContentPack,
  GameEvent,
  GameEventType,
  PlayerState,
} from '../types'
import { GameActivityFeed } from './GameActivityFeed'
import { activityTone } from './gameActivityFeedPresentation'
import { institutionRevenueSourceKey } from './institutionRevenue'

function event(type: GameEventType, data: Record<string, unknown> = {}): GameEvent {
  return {
    sequence: 1,
    type,
    occurred_at: '2026-08-06T12:00:00Z',
    data,
  }
}

describe('activityTone', () => {
  it.each([
    'salary.collected',
    'free_parking.collected',
    'property.mortgaged',
    'investment.dividend_paid',
  ] satisfies GameEventType[])('marks %s as income', (type) => {
    expect(activityTone(event(type))).toBe('income')
  })

  it.each([
    'payment.completed',
    'debt.paid',
    'property.purchased',
    'bank.loan_payment',
  ] satisfies GameEventType[])('marks %s as an expense', (type) => {
    expect(activityTone(event(type))).toBe('expense')
  })

  it('uses the sign of a card balance adjustment', () => {
    expect(activityTone(event('card.cash_applied', { amount: 100 }))).toBe('income')
    expect(activityTone(event('card.cash_applied', { amount: -100 }))).toBe('expense')
    expect(activityTone(event('card.cash_applied', { amount: 0 }))).toBe('card')
  })

  it('gives movement, trade, property and alert events distinct tones', () => {
    expect(activityTone(event('dice.rolled'))).toBe('movement')
    expect(activityTone(event('trade.proposed'))).toBe('trade')
    expect(activityTone(event('auction.started'))).toBe('property')
    expect(activityTone(event('player.bankrupt'))).toBe('alert')
  })
})

describe('institutionRevenueSourceKey', () => {
  it.each([
    ['loan_interest', 'loanInterest'],
    ['market_fee', 'marketFee'],
    ['card', 'card'],
    ['jail_fine', 'jailFine'],
    ['tax', 'tax'],
    [undefined, 'other'],
    ['unknown', 'other'],
  ])('maps %s to %s', (revenueType, expected) => {
    expect(institutionRevenueSourceKey(revenueType)).toBe(expected)
  })
})

describe('GameActivityFeed', () => {
  it('renders advanced economy events with localized project names', () => {
    const player = {
      user_id: 'player-1',
      display_name: 'Batman',
      is_bot: false,
      bankrupt: false,
    } as unknown as PlayerState
    const pack = {
      manifest: { tile_count: 40 },
      board: { tiles: [], decks: [] },
      messages: {},
    } as unknown as ContentPack

    const html = renderToStaticMarkup(
      createElement(GameActivityFeed, {
        events: [
          event('economy.public_project_announced', {
            kind: 'rail_modernization',
            minimum_bid: 400,
          }),
        ],
        players: [player],
        spectators: [],
        pack,
      }),
    )

    expect(html).toContain('Modernización ferroviaria')
    expect(html).toContain('$400')
  })

  it('uses the purchase price emitted by property.purchased', () => {
    const player: PlayerState = {
      user_id: 'player-1',
      display_name: 'Bot Equilibrado',
      is_bot: true,
      bot_personality: 'balanced',
      bot_controller: 'standard',
      position: 5,
      balance: 1000,
      pending_dividend_units: 0,
      bankrupt: false,
      in_jail: false,
      jail_failed_rolls: 0,
      jail_card_ids: [],
    }
    const pack = {
      manifest: { tile_count: 40 },
      board: {
        tiles: [
          {
            id: 'reading_railroad',
            kind: 'transport',
            name_key: 'tile.reading',
          },
        ],
        decks: [],
      },
      messages: { 'tile.reading': 'Reading Railroad' },
    } as unknown as ContentPack

    const html = renderToStaticMarkup(
      createElement(GameActivityFeed, {
        events: [
          event('property.purchased', {
            player_id: player.user_id,
            tile_id: 'reading_railroad',
            price: 200,
          }),
        ],
        players: [player],
        spectators: [],
        pack,
      }),
    )

    expect(html).toContain('compró Reading Railroad por')
    expect(html).toContain('$200')
    expect(html).not.toContain('por $.')
  })

  it('shows auction deposit reservations and refunds with their amount', () => {
    const player: PlayerState = {
      user_id: 'player-1',
      display_name: 'Batman',
      is_bot: false,
      bot_personality: null,
      bot_controller: null,
      position: 0,
      balance: 1500,
      pending_dividend_units: 0,
      bankrupt: false,
      in_jail: false,
      jail_failed_rolls: 0,
      jail_card_ids: [],
    }
    const pack = {
      manifest: { tile_count: 40 },
      board: { tiles: [], decks: [] },
      messages: {},
    } as unknown as ContentPack

    const html = renderToStaticMarkup(
      createElement(GameActivityFeed, {
        events: [
          event('auction.deposit_placed', {
            player_id: player.user_id,
            amount: 6,
          }),
          event('auction.deposit_refunded', {
            player_id: player.user_id,
            amount: 6,
          }),
        ],
        players: [player],
        spectators: [],
        pack,
      }),
    )

    const text = html.replace(/<[^>]*>/g, '')
    expect(text).toContain('garantía reembolsable de $6')
    expect(text).toContain('Se devolvió la garantía de')
    expect(text.match(/\$6/g)).toHaveLength(2)
  })
})
