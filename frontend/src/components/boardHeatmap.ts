import type {
  BoardHistoricalStats,
  ContentPack,
  GameEvent,
  GameState,
  PlayerState,
} from '../types'

export type BoardHeatmapMode = 'off' | 'history' | 'probability'

export interface BoardHeatmapCell {
  intensity: number
  value: number
}

export interface BoardHeatmap {
  mode: Exclude<BoardHeatmapMode, 'off'>
  cells: Map<number, BoardHeatmapCell>
  total: number
}

const heatmapPalette = ['#482878', '#31688e', '#1f9e89', '#6ece58', '#fde725']

export const boardHeatmapGradient = `linear-gradient(90deg, ${heatmapPalette.join(', ')})`

export function boardHeatmapColor(intensity: number): string {
  const clampedIntensity = Math.min(1, Math.max(0, intensity))
  const palettePosition = clampedIntensity * (heatmapPalette.length - 1)
  const lowerIndex = Math.floor(palettePosition)
  const upperIndex = Math.min(lowerIndex + 1, heatmapPalette.length - 1)
  const mix = palettePosition - lowerIndex

  const lower = hexToRgb(heatmapPalette[lowerIndex])
  const upper = hexToRgb(heatmapPalette[upperIndex])
  const channel = (start: number, end: number) => Math.round(start + (end - start) * mix)

  return `rgb(${channel(lower[0], upper[0])}, ${channel(lower[1], upper[1])}, ${channel(lower[2], upper[2])})`
}

const movementEventTypes = new Set<GameEvent['type']>([
  'dice.rolled',
  'card.player_moved',
  'jail.entered',
])

export function buildHistoryHeatmap(
  events: GameEvent[],
  tileCount: number,
  playerId: string | null,
  fromSequence: number,
  toSequence: number,
): BoardHeatmap {
  const visits = new Map<number, number>()

  for (const event of events) {
    if (
      event.sequence < fromSequence ||
      event.sequence > toSequence ||
      !movementEventTypes.has(event.type)
    ) {
      continue
    }
    if (playerId !== null && event.data.player_id !== playerId) continue

    const position = event.data.to_position
    if (
      typeof position !== 'number' ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= tileCount
    ) {
      continue
    }
    visits.set(position, (visits.get(position) ?? 0) + 1)
  }

  return normalizedHeatmap('history', visits)
}

export function buildProbabilityHeatmap(
  game: GameState,
  pack: ContentPack,
  player: PlayerState,
): BoardHeatmap {
  const outcomes = new Map<number, number>()
  const tileCount = pack.manifest.tile_count
  const jailPosition = pack.board.tiles.findIndex((tile) => tile.kind === 'jail')

  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      const isDouble = first === second
      const steps = first + second
      let position: number

      if (
        !player.in_jail &&
        isDouble &&
        game.consecutive_doubles + 1 >= pack.manifest.max_consecutive_doubles
      ) {
        position = jailPosition >= 0 ? jailPosition : player.position
      } else if (player.in_jail) {
        const forcedRelease =
          player.jail_failed_rolls + 1 >= pack.manifest.jail_max_failed_rolls
        position =
          isDouble || forcedRelease
            ? (player.position + steps) % tileCount
            : player.position
      } else {
        position = (player.position + steps) % tileCount
      }

      outcomes.set(position, (outcomes.get(position) ?? 0) + 1)
    }
  }

  return normalizedHeatmap('probability', outcomes)
}

export function buildBoardHistoricalHeatmap(
  history: BoardHistoricalStats,
  tileCount: number,
): BoardHeatmap {
  const visits = new Map<number, number>()
  history.position_landings.slice(0, tileCount).forEach((value, position) => {
    if (value > 0) visits.set(position, value)
  })
  return normalizedHeatmap('history', visits)
}

function normalizedHeatmap(
  mode: BoardHeatmap['mode'],
  values: Map<number, number>,
): BoardHeatmap {
  const populatedValues = Array.from(values.values())
  const minimum = populatedValues.length > 0 ? Math.min(...populatedValues) : 0
  const maximum = populatedValues.length > 0 ? Math.max(...populatedValues) : 0
  const range = maximum - minimum
  const cells = new Map<number, BoardHeatmapCell>()

  for (const [position, value] of values) {
    cells.set(position, {
      intensity: range > 0 ? Math.sqrt((value - minimum) / range) : 1,
      value,
    })
  }

  return {
    mode,
    cells,
    total: populatedValues.reduce((sum, value) => sum + value, 0),
  }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}
