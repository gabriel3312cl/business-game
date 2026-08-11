import { createContext, useContext } from 'react'
import type { GameColorThemeId } from './types'

export interface GameThemeContextValue {
  themeId: GameColorThemeId
  setThemeId: (themeId: GameColorThemeId) => void
}

export const GameThemeContext = createContext<GameThemeContextValue | null>(null)

export function useGameTheme(): GameThemeContextValue {
  const context = useContext(GameThemeContext)
  if (!context) throw new Error('useGameTheme must be used inside GameThemeProvider')
  return context
}
