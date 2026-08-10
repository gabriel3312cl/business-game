import type { PlayerState } from '../types'

export const playerColors = [
  '#b8ff3d',
  '#3da5ff',
  '#ff4f8b',
  '#ff9f1c',
  '#8f6bff',
  '#20d6b5',
  '#ff5252',
  '#ffe14f',
  '#00c2ff',
  '#46e36f',
  '#e45cff',
  '#ff7043',
  '#536dfe',
  '#d6a62e',
  '#00a896',
  '#c77dff',
  '#f72585',
  '#64d8e8',
  '#9dcc42',
  '#f28b82',
] as const

export function playerAppearanceSlot(
  player: Pick<PlayerState, 'appearance_slot'>,
  fallbackIndex: number,
): number {
  return player.appearance_slot ?? fallbackIndex % playerColors.length
}

export function playerColor(
  player: Pick<PlayerState, 'appearance_slot'>,
  fallbackIndex: number,
): string {
  return playerColors[playerAppearanceSlot(player, fallbackIndex)]
}
