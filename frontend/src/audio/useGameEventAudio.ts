import { useEffect, useRef } from 'react'
import type { ContentPack, GameEvent, GameState } from '../types'
import { gameAudio } from './gameAudio'
import { IMMEDIATE_AUDIO_EVENTS, soundCuesForEvent, type SoundCue } from './gameEventAudio'

interface Cursor {
  gameId: string
  sequence: number
  armed: boolean
}

export function useGameEventAudio(
  game: GameState,
  visibleEvents: GameEvent[],
  pack: ContentPack,
  userId: string,
  synchronized: boolean,
): void {
  const immediateCursor = useRef<Cursor>({
    gameId: game.id,
    sequence: latestSequence(game.events),
    armed: false,
  })
  const settledCursor = useRef<Cursor>({
    gameId: game.id,
    sequence: latestSequence(game.events),
    armed: false,
  })
  const timers = useRef(new Set<number>())

  useEffect(() => {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current.clear()
  }, [game.id, synchronized])

  useEffect(() => {
    const cursor = immediateCursor.current
    if (!synchronized || cursor.gameId !== game.id || !cursor.armed) {
      cursor.gameId = game.id
      cursor.sequence = latestSequence(game.events)
      cursor.armed = synchronized
      return
    }
    const events = game.events.filter(
      (event) => event.sequence > cursor.sequence && IMMEDIATE_AUDIO_EVENTS.has(event.type),
    )
    cursor.sequence = Math.max(cursor.sequence, latestSequence(game.events))
    scheduleEvents(events, pack, userId, timers.current)
  }, [game.events, game.id, pack, synchronized, userId])

  useEffect(() => {
    const cursor = settledCursor.current
    if (!synchronized || cursor.gameId !== game.id || !cursor.armed) {
      cursor.gameId = game.id
      cursor.sequence = latestSequence(game.events)
      cursor.armed = synchronized
      return
    }
    const events = visibleEvents.filter(
      (event) =>
        event.sequence > cursor.sequence && !IMMEDIATE_AUDIO_EVENTS.has(event.type),
    )
    cursor.sequence = Math.max(cursor.sequence, latestSequence(visibleEvents))
    scheduleEvents(events, pack, userId, timers.current)
  }, [game.events, game.id, pack, synchronized, userId, visibleEvents])

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer)
      timers.current.clear()
    },
    [],
  )
}

function scheduleEvents(
  events: GameEvent[],
  pack: ContentPack,
  userId: string,
  timers: Set<number>,
): void {
  let eventDelay = 0
  for (const event of events) {
    const cues = soundCuesForEvent(event, { pack, userId })
    for (const cue of cues) scheduleCue(cue, eventDelay, timers)
    if (cues.length > 0) eventDelay += 280
  }
}

function scheduleCue(cue: SoundCue, eventDelay: number, timers: Set<number>): void {
  const delay = eventDelay + (cue.delayMs ?? 0)
  if (delay <= 0) {
    gameAudio.play(cue.sound, { gain: cue.gain, variant: cue.variant })
    return
  }
  const timer = window.setTimeout(() => {
    timers.delete(timer)
    gameAudio.play(cue.sound, { gain: cue.gain, variant: cue.variant })
  }, delay)
  timers.add(timer)
}

function latestSequence(events: GameEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.sequence), 0)
}
