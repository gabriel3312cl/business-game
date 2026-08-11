import {
  DEFAULT_GAME_COLOR_THEME,
  isGameColorThemeId,
} from './theme'
import type { GameColorThemeId } from './types'

const COLOR_THEME_STORAGE_PREFIX = 'business-game:color-theme:v1:'

export function readColorTheme(userId: string): GameColorThemeId {
  try {
    const stored = localStorage.getItem(`${COLOR_THEME_STORAGE_PREFIX}${userId}`)
    return isGameColorThemeId(stored) ? stored : DEFAULT_GAME_COLOR_THEME
  } catch {
    return DEFAULT_GAME_COLOR_THEME
  }
}

export function writeColorTheme(
  userId: string,
  themeId: GameColorThemeId,
): void {
  try {
    localStorage.setItem(`${COLOR_THEME_STORAGE_PREFIX}${userId}`, themeId)
  } catch {
    // PostgreSQL remains authoritative when browser storage is unavailable.
  }
}
