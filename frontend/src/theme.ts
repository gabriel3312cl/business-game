import { createTheme, type Theme } from '@mui/material/styles'
import type { GameColorThemeId } from './types'

export interface GameColorThemeDefinition {
  id: GameColorThemeId
  mode?: 'dark' | 'light'
  background: string
  paper: string
  primary: string
  secondary: string
  text: string
  mutedText: string
  border: string
  translucentSurface: string
  elevatedSurface: string
  backdrop: string
  radius: number
  shadow: string
  fontFamily: string
}

const DEFAULT_FONT =
  'Inter, ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif'
const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif'
const WINDOWS_FONT = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'

export const DEFAULT_GAME_COLOR_THEME: GameColorThemeId = 'neon-night'

export const GAME_COLOR_THEMES: readonly GameColorThemeDefinition[] = [
  {
    id: 'neon-night',
    background: '#0b0912',
    paper: '#1b172a',
    primary: '#b8ff3d',
    secondary: '#9d8cff',
    text: '#f7f5ff',
    mutedText: '#b8b2c9',
    border: 'rgba(255,255,255,.14)',
    translucentSurface: 'rgba(27,23,42,.88)',
    elevatedSurface: '#211b33',
    backdrop: 'radial-gradient(circle at 15% 0%, rgba(157,140,255,.12), transparent 38%)',
    radius: 14,
    shadow: '0 20px 58px rgba(0,0,0,.46)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'ocean',
    background: '#06151c',
    paper: '#102831',
    primary: '#4ddcff',
    secondary: '#3ee0b8',
    text: '#effcff',
    mutedText: '#a8c8cf',
    border: 'rgba(77,220,255,.2)',
    translucentSurface: 'rgba(16,40,49,.88)',
    elevatedSurface: '#15343f',
    backdrop: 'radial-gradient(circle at 82% 0%, rgba(77,220,255,.13), transparent 42%)',
    radius: 16,
    shadow: '0 22px 62px rgba(0,16,24,.55)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'emerald',
    background: '#07150f',
    paper: '#11271c',
    primary: '#59e5a6',
    secondary: '#ffd166',
    text: '#f0fff7',
    mutedText: '#acd0bc',
    border: 'rgba(89,229,166,.2)',
    translucentSurface: 'rgba(17,39,28,.9)',
    elevatedSurface: '#173424',
    backdrop: 'radial-gradient(circle at 20% 0%, rgba(89,229,166,.12), transparent 40%)',
    radius: 12,
    shadow: '0 22px 60px rgba(0,20,11,.54)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'copper',
    background: '#17100c',
    paper: '#2b1d16',
    primary: '#ffb457',
    secondary: '#ef7d57',
    text: '#fff8f1',
    mutedText: '#d1b8a8',
    border: 'rgba(255,180,87,.2)',
    translucentSurface: 'rgba(43,29,22,.9)',
    elevatedSurface: '#38251b',
    backdrop: 'radial-gradient(circle at 85% 0%, rgba(239,125,87,.13), transparent 40%)',
    radius: 10,
    shadow: '0 22px 60px rgba(24,8,0,.55)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'high-contrast',
    background: '#000000',
    paper: '#101010',
    primary: '#fff200',
    secondary: '#59d9ff',
    text: '#ffffff',
    mutedText: '#d6d6d6',
    border: 'rgba(255,255,255,.42)',
    translucentSurface: 'rgba(16,16,16,.96)',
    elevatedSurface: '#1b1b1b',
    backdrop: 'none',
    radius: 4,
    shadow: '0 0 0 2px rgba(255,255,255,.18)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'macos-tahoe',
    background: '#10182a',
    paper: '#24334b',
    primary: '#64d2ff',
    secondary: '#bf8cff',
    text: '#f7fbff',
    mutedText: '#bdc9dc',
    border: 'rgba(255,255,255,.24)',
    translucentSurface: 'rgba(37,51,75,.66)',
    elevatedSurface: '#30415d',
    backdrop: 'radial-gradient(circle at 18% 0%, rgba(100,210,255,.22), transparent 36%), radial-gradient(circle at 88% 15%, rgba(191,140,255,.2), transparent 35%)',
    radius: 20,
    shadow: '0 24px 70px rgba(0,7,25,.46)',
    fontFamily: APPLE_FONT,
  },
  {
    id: 'ios26-glass',
    background: '#0a1020',
    paper: '#202c48',
    primary: '#70e1ff',
    secondary: '#ff8ad8',
    text: '#ffffff',
    mutedText: '#c3cce0',
    border: 'rgba(255,255,255,.3)',
    translucentSurface: 'rgba(31,44,72,.58)',
    elevatedSurface: '#2b3959',
    backdrop: 'radial-gradient(circle at 20% 12%, rgba(74,174,255,.28), transparent 34%), radial-gradient(circle at 85% 5%, rgba(255,104,196,.2), transparent 34%), linear-gradient(160deg, #0a1020 20%, #172039 100%)',
    radius: 26,
    shadow: '0 26px 80px rgba(0,5,22,.5)',
    fontFamily: APPLE_FONT,
  },
  {
    id: 'windows11',
    background: '#0d1525',
    paper: '#1f2a3a',
    primary: '#60cdff',
    secondary: '#a78bfa',
    text: '#f5f7fb',
    mutedText: '#bac3d1',
    border: 'rgba(255,255,255,.16)',
    translucentSurface: 'rgba(31,42,58,.82)',
    elevatedSurface: '#29364a',
    backdrop: 'radial-gradient(circle at 10% 0%, rgba(96,205,255,.16), transparent 42%)',
    radius: 8,
    shadow: '0 20px 64px rgba(0,8,24,.48)',
    fontFamily: WINDOWS_FONT,
  },
  {
    id: 'windows10',
    background: '#0b111b',
    paper: '#171f2b',
    primary: '#00a4ef',
    secondary: '#7fba00',
    text: '#ffffff',
    mutedText: '#b8c0ca',
    border: 'rgba(255,255,255,.2)',
    translucentSurface: 'rgba(23,31,43,.94)',
    elevatedSurface: '#202b39',
    backdrop: 'linear-gradient(135deg, rgba(0,164,239,.08), transparent 48%)',
    radius: 2,
    shadow: '0 18px 52px rgba(0,0,0,.5)',
    fontFamily: WINDOWS_FONT,
  },
  {
    id: 'windows7',
    background: '#0c2237',
    paper: '#24465f',
    primary: '#62c4ff',
    secondary: '#8ed14f',
    text: '#f7fcff',
    mutedText: '#bdd0de',
    border: 'rgba(190,233,255,.3)',
    translucentSurface: 'rgba(36,70,95,.72)',
    elevatedSurface: '#315b75',
    backdrop: 'radial-gradient(circle at 72% 0%, rgba(98,196,255,.2), transparent 42%)',
    radius: 7,
    shadow: '0 20px 58px rgba(0,18,38,.52)',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'windows-xp',
    background: '#142b16',
    paper: '#1f4470',
    primary: '#71b7ff',
    secondary: '#8ed34e',
    text: '#ffffff',
    mutedText: '#d0dceb',
    border: 'rgba(166,210,255,.34)',
    translucentSurface: 'rgba(31,68,112,.92)',
    elevatedSurface: '#2b5688',
    backdrop: 'linear-gradient(180deg, rgba(69,145,255,.18), transparent 48%), linear-gradient(0deg, rgba(86,170,67,.12), transparent 35%)',
    radius: 8,
    shadow: '0 18px 48px rgba(0,24,64,.52)',
    fontFamily: 'Tahoma, "Segoe UI", sans-serif',
  },
  {
    id: 'windows98',
    background: '#003b3b',
    paper: '#343434',
    primary: '#4da3ff',
    secondary: '#c0c0c0',
    text: '#ffffff',
    mutedText: '#d2d2d2',
    border: 'rgba(255,255,255,.46)',
    translucentSurface: 'rgba(52,52,52,.98)',
    elevatedSurface: '#454545',
    backdrop: 'none',
    radius: 0,
    shadow: '3px 3px 0 rgba(0,0,0,.65)',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
  },
  {
    id: 'linux',
    background: '#180f1f',
    paper: '#2c1c34',
    primary: '#e95420',
    secondary: '#f4b942',
    text: '#fff8ff',
    mutedText: '#d0becf',
    border: 'rgba(233,84,32,.26)',
    translucentSurface: 'rgba(44,28,52,.92)',
    elevatedSurface: '#392441',
    backdrop: 'radial-gradient(circle at 8% 0%, rgba(233,84,32,.16), transparent 40%)',
    radius: 6,
    shadow: '0 20px 58px rgba(14,2,20,.55)',
    fontFamily: 'Ubuntu, Cantarell, system-ui, sans-serif',
  },
  {
    id: 'meta',
    background: '#081426',
    paper: '#122642',
    primary: '#35a7ff',
    secondary: '#9b7bff',
    text: '#f4f9ff',
    mutedText: '#b4c6dc',
    border: 'rgba(53,167,255,.22)',
    translucentSurface: 'rgba(18,38,66,.88)',
    elevatedSurface: '#193252',
    backdrop: 'radial-gradient(circle at 78% 0%, rgba(155,123,255,.16), transparent 40%)',
    radius: 16,
    shadow: '0 22px 64px rgba(0,12,34,.52)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'facebook',
    background: '#0d1726',
    paper: '#1b2b41',
    primary: '#4f9cff',
    secondary: '#42b72a',
    text: '#f5f8fc',
    mutedText: '#b8c4d4',
    border: 'rgba(79,156,255,.2)',
    translucentSurface: 'rgba(27,43,65,.92)',
    elevatedSurface: '#243751',
    backdrop: 'linear-gradient(145deg, rgba(79,156,255,.1), transparent 45%)',
    radius: 8,
    shadow: '0 18px 54px rgba(0,8,22,.52)',
    fontFamily: 'Arial, Helvetica, system-ui, sans-serif',
  },
  {
    id: 'daylight',
    mode: 'light',
    background: '#eef3f8',
    paper: '#ffffff',
    primary: '#2155d9',
    secondary: '#6d4ce8',
    text: '#172033',
    mutedText: '#5c687b',
    border: 'rgba(31,48,76,.18)',
    translucentSurface: 'rgba(255,255,255,.9)',
    elevatedSurface: '#e2eaf5',
    backdrop: 'radial-gradient(circle at 12% 0%, rgba(33,85,217,.1), transparent 40%)',
    radius: 14,
    shadow: '0 18px 50px rgba(35,55,90,.16)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'financial-paper',
    mode: 'light',
    background: '#f3efe4',
    paper: '#fffaf0',
    primary: '#1f6b52',
    secondary: '#9a5d16',
    text: '#2a261e',
    mutedText: '#70675a',
    border: 'rgba(84,66,42,.2)',
    translucentSurface: 'rgba(255,250,240,.94)',
    elevatedSurface: '#e9e0cf',
    backdrop: 'linear-gradient(145deg, rgba(154,93,22,.06), transparent 46%)',
    radius: 10,
    shadow: '0 18px 48px rgba(74,55,30,.16)',
    fontFamily: DEFAULT_FONT,
  },
  {
    id: 'macos-tahoe-light',
    mode: 'light',
    background: '#e8f1fb',
    paper: '#f8fbff',
    primary: '#007aff',
    secondary: '#8054d8',
    text: '#162031',
    mutedText: '#607089',
    border: 'rgba(48,82,120,.18)',
    translucentSurface: 'rgba(248,251,255,.7)',
    elevatedSurface: '#dce9f7',
    backdrop: 'radial-gradient(circle at 18% 0%, rgba(0,122,255,.15), transparent 36%), radial-gradient(circle at 88% 15%, rgba(128,84,216,.13), transparent 35%)',
    radius: 20,
    shadow: '0 22px 64px rgba(45,70,105,.2)',
    fontFamily: APPLE_FONT,
  },
  {
    id: 'ios26-glass-light',
    mode: 'light',
    background: '#edf4ff',
    paper: '#ffffff',
    primary: '#087cf0',
    secondary: '#c92c97',
    text: '#111827',
    mutedText: '#5f6d82',
    border: 'rgba(58,89,130,.2)',
    translucentSurface: 'rgba(255,255,255,.62)',
    elevatedSurface: '#dce9fa',
    backdrop: 'radial-gradient(circle at 20% 12%, rgba(74,174,255,.22), transparent 34%), radial-gradient(circle at 85% 5%, rgba(255,104,196,.15), transparent 34%), linear-gradient(160deg, #edf4ff 20%, #f8edff 100%)',
    radius: 26,
    shadow: '0 24px 70px rgba(55,77,116,.2)',
    fontFamily: APPLE_FONT,
  },
  {
    id: 'windows11-light',
    mode: 'light',
    background: '#f3f3f3',
    paper: '#ffffff',
    primary: '#0067c0',
    secondary: '#5b5fc7',
    text: '#1a1a1a',
    mutedText: '#5f5f5f',
    border: 'rgba(0,0,0,.14)',
    translucentSurface: 'rgba(255,255,255,.86)',
    elevatedSurface: '#e7edf4',
    backdrop: 'radial-gradient(circle at 10% 0%, rgba(0,103,192,.1), transparent 42%)',
    radius: 8,
    shadow: '0 18px 54px rgba(31,45,65,.18)',
    fontFamily: WINDOWS_FONT,
  },
  {
    id: 'facebook-light',
    mode: 'light',
    background: '#f0f2f5',
    paper: '#ffffff',
    primary: '#0866ff',
    secondary: '#42b72a',
    text: '#1c1e21',
    mutedText: '#65676b',
    border: 'rgba(28,30,33,.16)',
    translucentSurface: 'rgba(255,255,255,.94)',
    elevatedSurface: '#e4e6eb',
    backdrop: 'linear-gradient(145deg, rgba(8,102,255,.07), transparent 45%)',
    radius: 8,
    shadow: '0 16px 44px rgba(28,39,55,.16)',
    fontFamily: 'Arial, Helvetica, system-ui, sans-serif',
  },
] as const

export function isGameColorThemeId(value: unknown): value is GameColorThemeId {
  return GAME_COLOR_THEMES.some((definition) => definition.id === value)
}

export function getGameColorTheme(
  id: GameColorThemeId,
): GameColorThemeDefinition {
  return (
    GAME_COLOR_THEMES.find((definition) => definition.id === id) ??
    GAME_COLOR_THEMES[0]
  )
}

export function createGameTheme(id: GameColorThemeId): Theme {
  const definition = getGameColorTheme(id)
  const glass =
    id === 'macos-tahoe' ||
    id === 'ios26-glass' ||
    id === 'windows7' ||
    id === 'macos-tahoe-light' ||
    id === 'ios26-glass-light'

  return createTheme({
    palette: {
      mode: definition.mode ?? 'dark',
      primary: { main: definition.primary },
      secondary: { main: definition.secondary },
      background: {
        default: definition.background,
        paper: definition.paper,
      },
      text: {
        primary: definition.text,
        secondary: definition.mutedText,
      },
      divider: definition.border,
    },
    shape: { borderRadius: definition.radius },
    typography: {
      fontFamily: definition.fontFamily,
      h1: { fontWeight: 800, letterSpacing: '-0.04em' },
      button: { fontWeight: 750, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--game-theme-primary': definition.primary,
            '--game-theme-primary-soft': `color-mix(in srgb, ${definition.primary} 14%, transparent)`,
            '--game-theme-secondary': definition.secondary,
            '--game-theme-secondary-soft': `color-mix(in srgb, ${definition.secondary} 12%, transparent)`,
            '--game-theme-border': definition.border,
            '--game-theme-surface': definition.translucentSurface,
            '--game-theme-elevated': definition.elevatedSurface,
            '--game-theme-shadow': definition.shadow,
            '--game-theme-board': `linear-gradient(145deg, color-mix(in srgb, ${definition.background} 78%, ${definition.paper}), ${definition.background})`,
            '--game-theme-board-center': `radial-gradient(circle at 50% 42%, color-mix(in srgb, ${definition.secondary} 22%, transparent), transparent 60%), radial-gradient(circle at 20% 85%, color-mix(in srgb, ${definition.primary} 9%, transparent), transparent 46%)`,
            '--game-theme-tile': `linear-gradient(155deg, color-mix(in srgb, ${definition.elevatedSurface} 90%, white), color-mix(in srgb, ${definition.paper} 92%, ${definition.background}) 72%)`,
            '--game-theme-tile-tooltip': `linear-gradient(155deg, color-mix(in srgb, ${definition.elevatedSurface} 94%, white), color-mix(in srgb, ${definition.paper} 82%, ${definition.background}) 72%)`,
          },
          body: {
            backgroundColor: definition.background,
            backgroundImage: definition.backdrop,
            backgroundAttachment: 'fixed',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderColor: definition.border,
            ...(glass
              ? {
                  backgroundColor: definition.translucentSurface,
                  backdropFilter: 'blur(22px) saturate(145%)',
                }
              : {}),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: Math.max(0, definition.radius - 2) },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            boxShadow: definition.shadow,
            border: `1px solid ${definition.border}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: definition.translucentSurface,
            borderColor: definition.border,
          },
        },
      },
    },
  })
}

export const theme = createGameTheme(DEFAULT_GAME_COLOR_THEME)
