import { describe, expect, it } from 'vitest'
import {
  createGameTheme,
  DEFAULT_GAME_COLOR_THEME,
  GAME_COLOR_THEMES,
  isGameColorThemeId,
} from './theme'

describe('game color themes', () => {
  it('exposes every supported theme once', () => {
    const ids = GAME_COLOR_THEMES.map((definition) => definition.id)

    expect(ids).toHaveLength(21)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_GAME_COLOR_THEME)
    expect(ids).toEqual(
      expect.arrayContaining([
        'macos-tahoe',
        'ios26-glass',
        'windows11',
        'windows10',
        'windows7',
        'windows-xp',
        'windows98',
        'linux',
        'meta',
        'facebook',
        'daylight',
        'financial-paper',
        'macos-tahoe-light',
        'ios26-glass-light',
        'windows11-light',
        'facebook-light',
      ]),
    )
    expect(
      GAME_COLOR_THEMES.filter((definition) => definition.mode === 'light'),
    ).toHaveLength(6)
  })

  it('builds the expected Material UI mode from each palette', () => {
    for (const definition of GAME_COLOR_THEMES) {
      const theme = createGameTheme(definition.id)

      expect(theme.palette.mode).toBe(definition.mode ?? 'dark')
      expect(theme.palette.primary.main).toBe(definition.primary)
      expect(theme.palette.secondary.main).toBe(definition.secondary)
      expect(theme.palette.background.default).toBe(definition.background)
      expect(theme.palette.background.paper).toBe(definition.paper)
      const cssBaseline = JSON.stringify(
        theme.components?.MuiCssBaseline?.styleOverrides,
      )
      expect(cssBaseline).toContain('--game-theme-board')
      expect(cssBaseline).toContain('--game-theme-board-center')
      expect(cssBaseline).toContain('--game-theme-tile')
    }
  })

  it('rejects unsupported persisted values', () => {
    expect(isGameColorThemeId('windows7')).toBe(true)
    expect(isGameColorThemeId('windows-vista')).toBe(false)
    expect(isGameColorThemeId(null)).toBe(false)
  })

  it('keeps light theme text readable on its main surfaces', () => {
    for (const definition of GAME_COLOR_THEMES.filter(
      (candidate) => candidate.mode === 'light',
    )) {
      expect(contrastRatio(definition.text, definition.background)).toBeGreaterThanOrEqual(
        7,
      )
      expect(contrastRatio(definition.mutedText, definition.paper)).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })
})

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
