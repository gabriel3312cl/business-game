import { describe, expect, it } from 'vitest'
import type { ContentPack, GameEvent } from '../types'
import { soundCuesForEvent } from './gameEventAudio'

const context = {
  userId: 'player-1',
  pack: { board: { decks: [] } } as unknown as ContentPack,
}

function event(
  type: GameEvent['type'],
  data: Record<string, unknown> = {},
): GameEvent {
  return {
    sequence: 1,
    type,
    data,
    occurred_at: '2026-08-10T12:00:00Z',
  }
}

describe('financial game event audio', () => {
  it('uses distinct bank sounds and emphasizes the affected player', () => {
    expect(
      soundCuesForEvent(
        event('bank.loan_issued', { player_id: 'player-1' }),
        context,
      ),
    ).toEqual([{ sound: 'bank-loan-issued', gain: 1 }])
    expect(
      soundCuesForEvent(
        event('bank.loan_defaulted', { player_id: 'player-2' }),
        context,
      ),
    ).toEqual([{ sound: 'bank-loan-defaulted', gain: 0.6 }])
  })

  it('covers market trades, dividends, margin calls, and economic weeks', () => {
    expect(
      soundCuesForEvent(
        event('investment.order_filled', {
          buyer_id: 'player-2',
          seller_id: 'player-1',
        }),
        context,
      ),
    ).toEqual([{ sound: 'market-order-filled', gain: 1 }])
    expect(
      soundCuesForEvent(event('investment.dividend_paid'), context),
    ).toEqual([{ sound: 'market-dividend-paid', gain: 0.55 }])
    expect(
      soundCuesForEvent(event('investment.margin_call'), context),
    ).toEqual([{ sound: 'market-margin-call', gain: 0.55 }])
    expect(
      soundCuesForEvent(event('economy.week_advanced'), context),
    ).toEqual([{ sound: 'economy-week-advanced', gain: 0.72 }])
  })
})
