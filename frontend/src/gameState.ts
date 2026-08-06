import type { GameEvent, GameState } from './types'

export function mergeGameState(current: GameState | null, next: GameState): GameState {
  if (!current || current.id !== next.id) return next
  if (next.event_sequence < current.event_sequence) return current
  if (next.events_complete) return next

  const eventsBySequence = new Map<number, GameEvent>()
  for (const event of current.events) eventsBySequence.set(event.sequence, event)
  for (const event of next.events) eventsBySequence.set(event.sequence, event)
  const events = [...eventsBySequence.values()].sort(
    (first, second) => first.sequence - second.sequence,
  )
  const eventsComplete =
    current.events_complete &&
    events.length === next.event_sequence &&
    events.every((event, index) => event.sequence === index + 1)
  return { ...next, events, events_complete: eventsComplete }
}
