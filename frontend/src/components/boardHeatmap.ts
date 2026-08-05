import type { ContentPack, GameEvent, GameState, PlayerState } from '../types'

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

function normalizedHeatmap(
  mode: BoardHeatmap['mode'],
  values: Map<number, number>,
): BoardHeatmap {
  const maximum = Math.max(0, ...values.values())
  const cells = new Map<number, BoardHeatmapCell>()

  for (const [position, value] of values) {
    cells.set(position, {
      intensity: maximum > 0 ? value / maximum : 0,
      value,
    })
  }

  return {
    mode,
    cells,
    total: Array.from(values.values()).reduce((sum, value) => sum + value, 0),
  }
}
