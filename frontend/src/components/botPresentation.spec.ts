import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../types'
import {
  requiresCurrentUserAttention,
  shouldBufferParticipantPresentation,
} from './botPresentation'

const me = {
  user_id: 'me',
  is_bot: false,
  bankrupt: false,
} as PlayerState
const other = {
  user_id: 'other',
  is_bot: false,
  bankrupt: false,
} as PlayerState
const bot = {
  user_id: 'bot',
  is_bot: true,
  bankrupt: false,
} as PlayerState

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'playing',
    players: [me, other, bot],
    current_player_index: 2,
    pending_card_draw: null,
    pending_card_choice: null,
    pending_card_choice_result: null,
    pending_auction_selector_id: null,
    active_auction: null,
    active_debt: null,
    trades: [],
    ...overrides,
  } as GameState
}

describe('participant presentation omission', () => {
  it('buffers bots and other humans independently', () => {
    expect(
      shouldBufferParticipantPresentation(game(), me.user_id, {
        bots: true,
        otherHumans: false,
      }),
    ).toBe(true)
    expect(
      shouldBufferParticipantPresentation(
        game({ current_player_index: 1 }),
        me.user_id,
        { bots: false, otherHumans: true },
      ),
    ).toBe(true)
  })

  it('does not buffer a participant whose category remains visible', () => {
    expect(
      shouldBufferParticipantPresentation(game(), me.user_id, {
        bots: false,
        otherHumans: true,
      }),
    ).toBe(false)
  })

  it('always releases a state that needs the current user', () => {
    expect(
      shouldBufferParticipantPresentation(
        game({ current_player_index: 0 }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(false)
    expect(
      shouldBufferParticipantPresentation(
        game({ pending_card_draw: { player_id: me.user_id } as never }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(false)
    expect(
      shouldBufferParticipantPresentation(
        game({
          active_debt: {
            debtor_id: bot.user_id,
            creditor_id: me.user_id,
          } as never,
        }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(false)
  })

  it('releases an incoming trade for the current user', () => {
    const tradeGame = game({
      trades: [
        {
          status: 'pending',
          proposer_id: bot.user_id,
          recipient_id: me.user_id,
        } as never,
      ],
    })
    expect(requiresCurrentUserAttention(tradeGame, me.user_id)).toBe(true)
  })

  it('buffers auction progress until the current user must answer', () => {
    const baseAuction = {
      phase: 'bidding',
      eligible_player_ids: [me.user_id, bot.user_id],
      ready_player_ids: [me.user_id, bot.user_id],
      passed_player_ids: [],
    }
    expect(
      shouldBufferParticipantPresentation(
        game({
          active_auction: {
            ...baseAuction,
            current_bidder_id: me.user_id,
          } as never,
        }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(true)
    expect(
      shouldBufferParticipantPresentation(
        game({
          active_auction: {
            ...baseAuction,
            current_bidder_id: bot.user_id,
          } as never,
        }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(false)
  })

  it('never buffers a finished game', () => {
    expect(
      shouldBufferParticipantPresentation(
        game({ status: 'finished' }),
        me.user_id,
        { bots: true, otherHumans: true },
      ),
    ).toBe(false)
  })
})
