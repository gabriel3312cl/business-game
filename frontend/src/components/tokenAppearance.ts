import { santiagoTokenAssets } from '../assets/monopolySantiago'
import type {
  TokenAppearanceSettings,
  TokenFillMode,
  TokenIcon,
  TokenPattern,
  TokenShape,
} from '../types'

export const TOKEN_COLORS = [
  '#b8ff3d',
  '#70b7ff',
  '#ff6ea8',
  '#ffb45c',
  '#9d8cff',
  '#55d6be',
  '#ff6b6b',
  '#f4e66a',
  '#38e8ff',
  '#4dff88',
  '#ff8fda',
  '#c86bff',
  '#6f7cff',
  '#ff8a3d',
  '#ffd166',
  '#e8ff8a',
  '#a8dadc',
  '#f1c0e8',
  '#caffbf',
  '#fdffb6',
  '#d9d9d9',
  '#f8f9fa',
] as const

export const TOKEN_GRADIENTS = [
  { color: '#b8ff3d', secondaryColor: '#38e8ff', angle: 135 },
  { color: '#ff6ea8', secondaryColor: '#ffb45c', angle: 135 },
  { color: '#9d8cff', secondaryColor: '#38e8ff', angle: 145 },
  { color: '#c86bff', secondaryColor: '#ff8fda', angle: 120 },
  { color: '#ff6b6b', secondaryColor: '#f4e66a', angle: 145 },
  { color: '#55d6be', secondaryColor: '#6f7cff', angle: 135 },
] as const

export const TOKEN_PATTERNS: TokenPattern[] = [
  'dots',
  'stripes',
  'checker',
  'waves',
]

export const TOKEN_EMOJIS = [
  '🎩',
  '🚀',
  '🐱',
  '🐶',
  '🦊',
  '🦁',
  '🐙',
  '🌟',
  '⚡',
  '🔥',
  '🌈',
  '🎲',
  '🎮',
  '⚽',
  '🏀',
  '🎸',
  '🍕',
  '🎉',
  '💎',
  '👑',
] as const

export const TOKEN_ICONS: Array<{
  id: TokenIcon
  labelKey: string
  assetPath?: string
}> = [
  { id: 'number', labelKey: 'token.icons.number' },
  { id: 'micro', labelKey: 'token.icons.micro', assetPath: santiagoTokenAssets[0].path },
  { id: 'bus', labelKey: 'token.icons.bus', assetPath: santiagoTokenAssets[1].path },
  { id: 'completo', labelKey: 'token.icons.completo', assetPath: santiagoTokenAssets[2].path },
  { id: 'terremoto', labelKey: 'token.icons.terremoto', assetPath: santiagoTokenAssets[3].path },
  { id: 'cerro', labelKey: 'token.icons.cerro', assetPath: santiagoTokenAssets[4].path },
  { id: 'cat', labelKey: 'token.icons.cat', assetPath: santiagoTokenAssets[5].path },
  { id: 'emoji', labelKey: 'token.icons.emoji' },
]

export const TOKEN_SHAPES: TokenShape[] = [
  'circle',
  'rounded',
  'diamond',
  'hexagon',
  'shield',
  'star',
]

const TOKEN_FILL_MODES: TokenFillMode[] = ['solid', 'gradient', 'pattern']

export function tokenAssetPath(icon: TokenIcon): string | undefined {
  return TOKEN_ICONS.find((option) => option.id === icon)?.assetPath
}

export function tokenShapeStyle(shape: TokenShape) {
  if (shape === 'circle') return { borderRadius: '50%' }
  if (shape === 'rounded') return { borderRadius: '24%' }
  if (shape === 'diamond') {
    return {
      borderRadius: 0,
      clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    }
  }
  if (shape === 'hexagon') {
    return {
      borderRadius: 0,
      clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)',
    }
  }
  if (shape === 'shield') {
    return {
      borderRadius: 0,
      clipPath: 'polygon(8% 5%, 92% 5%, 92% 58%, 50% 100%, 8% 58%)',
    }
  }
  return {
    borderRadius: 0,
    clipPath:
      'polygon(50% 0, 61% 34%, 98% 35%, 68% 56%, 79% 92%, 50% 70%, 21% 92%, 32% 56%, 2% 35%, 39% 34%)',
  }
}

export function tokenFillStyle(
  appearance: Pick<
    TokenAppearanceSettings,
    'color' | 'secondary_color' | 'fill' | 'gradient_angle' | 'pattern'
  >,
) {
  if (appearance.fill === 'gradient') {
    return {
      background: `linear-gradient(${appearance.gradient_angle}deg, ${appearance.color}, ${appearance.secondary_color})`,
    }
  }
  if (appearance.fill === 'pattern') {
    if (appearance.pattern === 'stripes') {
      return {
        background: `repeating-linear-gradient(135deg, ${appearance.color} 0 6px, ${appearance.secondary_color} 6px 12px)`,
      }
    }
    if (appearance.pattern === 'checker') {
      return {
        backgroundColor: appearance.color,
        backgroundImage: `linear-gradient(45deg, ${appearance.secondary_color} 25%, transparent 25%), linear-gradient(-45deg, ${appearance.secondary_color} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${appearance.secondary_color} 75%), linear-gradient(-45deg, transparent 75%, ${appearance.secondary_color} 75%)`,
        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
        backgroundSize: '12px 12px',
      }
    }
    if (appearance.pattern === 'waves') {
      return {
        backgroundColor: appearance.color,
        backgroundImage: `radial-gradient(circle at 0 100%, transparent 7px, ${appearance.secondary_color} 8px 9px, transparent 10px), radial-gradient(circle at 12px 0, transparent 7px, ${appearance.secondary_color} 8px 9px, transparent 10px)`,
        backgroundSize: '24px 12px',
      }
    }
    return {
      backgroundColor: appearance.color,
      backgroundImage: `radial-gradient(circle, ${appearance.secondary_color} 0 2px, transparent 2.5px)`,
      backgroundSize: '10px 10px',
    }
  }
  return { backgroundColor: appearance.color }
}

export function normalizeTokenAppearance(
  value: Partial<TokenAppearanceSettings> | null | undefined,
): TokenAppearanceSettings | null {
  if (
    !value ||
    typeof value.color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(value.color) ||
    !TOKEN_SHAPES.includes(value.shape as TokenShape) ||
    !TOKEN_ICONS.some((option) => option.id === value.icon)
  ) {
    return null
  }
  const fill = TOKEN_FILL_MODES.includes(value.fill as TokenFillMode)
    ? (value.fill as TokenFillMode)
    : 'solid'
  const secondaryColor =
    typeof value.secondary_color === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(value.secondary_color)
      ? value.secondary_color.toLowerCase()
      : '#9d8cff'
  const gradientAngle =
    typeof value.gradient_angle === 'number' &&
    Number.isInteger(value.gradient_angle) &&
    value.gradient_angle >= 0 &&
    value.gradient_angle <= 360
      ? value.gradient_angle
      : 135
  const pattern = TOKEN_PATTERNS.includes(value.pattern as TokenPattern)
    ? (value.pattern as TokenPattern)
    : 'dots'
  const emoji =
    typeof value.emoji === 'string' && value.emoji.trim().length > 0
      ? value.emoji.trim().slice(0, 16)
      : null
  if (value.icon === 'emoji' && !emoji) return null
  return {
    color: value.color.toLowerCase(),
    secondary_color: secondaryColor,
    fill,
    gradient_angle: gradientAngle,
    pattern,
    shape: value.shape as TokenShape,
    icon: value.icon as TokenIcon,
    emoji,
  }
}
