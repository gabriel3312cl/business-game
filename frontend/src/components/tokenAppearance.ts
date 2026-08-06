import { santiagoTokenAssets } from '../assets/monopolySantiago'
import type {
  TokenAppearanceSettings,
  TokenIcon,
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
]

const TOKEN_SHAPES: TokenShape[] = ['circle', 'rounded', 'diamond']

export function tokenAssetPath(icon: TokenIcon): string | undefined {
  return TOKEN_ICONS.find((option) => option.id === icon)?.assetPath
}

export function tokenShapeStyle(shape: TokenShape) {
  return shape === 'circle'
    ? { borderRadius: '50%' }
    : shape === 'rounded'
      ? { borderRadius: '24%' }
      : {
          borderRadius: 0,
          clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
        }
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
  return {
    color: value.color.toLowerCase(),
    shape: value.shape as TokenShape,
    icon: value.icon as TokenIcon,
  }
}
