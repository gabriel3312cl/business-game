import { describe, expect, it } from 'vitest'
import { nextAutomationCommand } from './gameAutomation'
import type { GameState, PlayerState, TradeOffer } from './types'

const user: PlayerState = {
  user_id: 'user-1',
  display_name: 'Gabriel',
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

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'playing',
    phase: 'waiting_for_end',
    current_player_index: 0,
    players: [user],
    trades: [],
    pending_auction_selector_id: null,
    active_auction: null,
    active_debt: null,
    pending_card_draw: null,
    pending_card_choice: null,
    pending_card_choice_result: null,
    ...overrides,
  } as GameState
}

function trade(overrides: Partial<TradeOffer> = {}): TradeOffer {
  return {
    id: 'trade-1',
    proposer_id: 'user-2',
    recipient_id: user.user_id,
    offered_cash: 100,
    requested_cash: 0,
    offered_property_ids: [],
    requested_property_ids: [],
    parent_trade_id: null,
    status: 'pending',
    created_at: '2026-08-06T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}

describe('nextAutomationCommand', () => {
  it('rejects an incoming pending trade before ending the turn', () => {
    expect(
      nextAutomationCommand({
        game: game({ trades: [trade()] }),
        userId: user.user_id,
        autoRejectTrades: true,
        autoRollDice: true,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toEqual({ action: 'reject_trade', trade_id: 'trade-1' })
  })

  it('ends only the current user turn in the waiting-for-end phase', () => {
    expect(
      nextAutomationCommand({
        game: game(),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: false,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toEqual({ action: 'end_turn' })

    expect(
      nextAutomationCommand({
        game: game({ phase: 'waiting_for_roll' }),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: false,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toBeNull()
  })

  it('rolls only for the current user in the waiting-for-roll phase', () => {
    expect(
      nextAutomationCommand({
        game: game({ phase: 'waiting_for_roll' }),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: true,
        autoEndTurns: false,
        motionPending: false,
      }),
    ).toEqual({ action: 'roll' })

    expect(
      nextAutomationCommand({
        game: game({ phase: 'waiting_for_roll', active_debt: {} as never }),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: true,
        autoEndTurns: false,
        motionPending: false,
      }),
    ).toBeNull()
  })

  it('waits for movement and blocks automatic actions when disabled', () => {
    expect(
      nextAutomationCommand({
        game: game(),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: false,
        autoEndTurns: true,
        motionPending: true,
      }),
    ).toBeNull()

    expect(
      nextAutomationCommand({
        game: game({
          pending_card_choice: {} as never,
          trades: [trade()],
        }),
        userId: user.user_id,
        autoRejectTrades: true,
        autoRollDice: true,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toBeNull()

    expect(
      nextAutomationCommand({
        game: game({
          pending_card_draw: {} as never,
          trades: [trade()],
        }),
        userId: user.user_id,
        autoRejectTrades: true,
        autoRollDice: true,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toBeNull()

    expect(
      nextAutomationCommand({
        game: game({
          pending_card_choice_result: {} as never,
          trades: [trade()],
        }),
        userId: user.user_id,
        autoRejectTrades: true,
        autoRollDice: true,
        autoEndTurns: true,
        motionPending: false,
      }),
    ).toBeNull()

    expect(
      nextAutomationCommand({
        game: game({ trades: [trade()] }),
        userId: user.user_id,
        autoRejectTrades: false,
        autoRollDice: false,
        autoEndTurns: false,
        motionPending: false,
      }),
    ).toBeNull()
  })
})
