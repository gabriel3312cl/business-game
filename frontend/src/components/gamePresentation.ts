import type { GameState } from '../types'

export function presentedGameSnapshot(
  settledGame: GameState,
  authoritativeGame: GameState,
  motionPending: boolean,
): GameState {
  if (settledGame.id !== authoritativeGame.id || !motionPending) {
    return authoritativeGame
  }
  return settledGame
}
