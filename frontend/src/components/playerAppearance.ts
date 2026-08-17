import type { PlayerState, TokenAppearanceSettings, TokenIcon } from '../types'
import { playerAppearanceSlot, playerColors } from './gameColors'

const automaticTokens: Array<{ icon: TokenIcon; emoji: string | null }> = [
  { icon: 'micro', emoji: null },
  { icon: 'bus', emoji: null },
  { icon: 'completo', emoji: null },
  { icon: 'terremoto', emoji: null },
  { icon: 'cerro', emoji: null },
  { icon: 'cat', emoji: null },
  { icon: 'emoji', emoji: '🎩' },
  { icon: 'emoji', emoji: '🚀' },
  { icon: 'emoji', emoji: '🐶' },
  { icon: 'emoji', emoji: '🦊' },
  { icon: 'emoji', emoji: '🦁' },
  { icon: 'emoji', emoji: '🐙' },
  { icon: 'emoji', emoji: '🌟' },
  { icon: 'emoji', emoji: '⚡' },
  { icon: 'emoji', emoji: '🔥' },
  { icon: 'emoji', emoji: '🎲' },
  { icon: 'emoji', emoji: '🎮' },
  { icon: 'emoji', emoji: '🎸' },
  { icon: 'emoji', emoji: '💎' },
  { icon: 'emoji', emoji: '👑' },
]

const shapes: TokenAppearanceSettings['shape'][] = [
  'circle',
  'rounded',
  'diamond',
  'hexagon',
  'shield',
  'star',
]
const patterns: TokenAppearanceSettings['pattern'][] = [
  'dots',
  'stripes',
  'checker',
  'waves',
]

export function automaticPlayerAppearance(
  player: Pick<PlayerState, 'appearance_slot'>,
  fallbackIndex: number,
): TokenAppearanceSettings {
  const slot = playerAppearanceSlot(player, fallbackIndex)
  const token = automaticTokens[slot]
  const fill = slot % 3 === 0 ? 'solid' : slot % 3 === 1 ? 'gradient' : 'pattern'

  return {
    color: playerColors[slot],
    secondary_color: playerColors[(slot + 7) % playerColors.length],
    fill,
    gradient_angle: 105 + (slot % 6) * 15,
    pattern: patterns[slot % patterns.length],
    shape: shapes[slot % shapes.length],
    icon: token.icon,
    emoji: token.emoji,
  }
}

export function resolvedPlayerAppearance(
  player: Pick<PlayerState, 'appearance_slot' | 'token_appearance'>,
  fallbackIndex: number,
  localOverride: TokenAppearanceSettings | null = null,
): TokenAppearanceSettings {
  return (
    localOverride ??
    player.token_appearance ??
    automaticPlayerAppearance(player, fallbackIndex)
  )
}
