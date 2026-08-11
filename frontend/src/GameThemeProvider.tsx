import { CssBaseline, ThemeProvider } from '@mui/material'
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { GameThemeContext } from './gameThemeContext'
import {
  createGameTheme,
  DEFAULT_GAME_COLOR_THEME,
  isGameColorThemeId,
} from './theme'
import type { GameColorThemeId } from './types'

const LAST_THEME_STORAGE_KEY = 'business-game:color-theme:last'

function readLastTheme(): GameColorThemeId {
  try {
    const stored = localStorage.getItem(LAST_THEME_STORAGE_KEY)
    return isGameColorThemeId(stored) ? stored : DEFAULT_GAME_COLOR_THEME
  } catch {
    return DEFAULT_GAME_COLOR_THEME
  }
}

export function GameThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<GameColorThemeId>(readLastTheme)
  const setThemeId = useCallback((nextThemeId: GameColorThemeId) => {
    setThemeIdState(nextThemeId)
    try {
      localStorage.setItem(LAST_THEME_STORAGE_KEY, nextThemeId)
    } catch {
      // The authenticated preference remains authoritative when storage is unavailable.
    }
  }, [])
  const muiTheme = useMemo(() => createGameTheme(themeId), [themeId])
  const value = useMemo(() => ({ themeId, setThemeId }), [setThemeId, themeId])

  return (
    <GameThemeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </GameThemeContext.Provider>
  )
}
