import { useMediaQuery } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEvent, GameState, VisualEffectsIntensity } from '../types'

type VisualPositions = Record<string, number>

type MovementKind = 'forward' | 'backward' | 'teleport'

export interface MotionSettlement {
  gameId: string | null
  sequence: number
  syncMotionKey?: string | number
}

export interface MotionAudioCue {
  sequence: number
  step: number
  playerId: string
}

interface PlayerMovement {
  sequence: number
  eventType: GameEvent['type']
  playerId: string
  fromPosition: number
  toPosition: number
  steps: number
  movement: MovementKind
}

const DICE_SETTLE_DELAY_MS = 600
const DEFAULT_STEP_DURATION_MS = 90
const MIN_STEP_DURATION_MS = 24
const MAX_MOVEMENT_DURATION_MS = 3_000

export function useVisualPlayerPositions(
  game: GameState | null,
  tileCount: number,
  syncMotionKey?: string | number,
  onMotionSettled?: (settlement: MotionSettlement) => void,
  onTokenStep?: (cue: MotionAudioCue) => void,
  onTokenTeleport?: (cue: MotionAudioCue) => void,
  motionIntensity: VisualEffectsIntensity = 'full',
): VisualPositions {
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  )
  const initialPositions = authoritativePositions(game)
  const [visualPositions, setVisualPositions] =
    useState<VisualPositions>(initialPositions)
  const visualPositionsRef = useRef(initialPositions)
  const latestAuthoritativeRef = useRef(initialPositions)
  const tileCountRef = useRef(tileCount)
  const queueRef = useRef<PlayerMovement[]>([])
  const processingGenerationRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const pendingWaitsRef = useRef(
    new Map<number, () => void>(),
  )
  const initializedRef = useRef(false)
  const gameIdRef = useRef<string | null>(game?.id ?? null)
  const syncMotionKeyRef = useRef(syncMotionKey)
  const processedSequenceRef = useRef(latestSequence(game))
  const onMotionSettledRef = useRef(onMotionSettled)
  const onTokenStepRef = useRef(onTokenStep)
  const onTokenTeleportRef = useRef(onTokenTeleport)

  const replaceVisualPositions = useCallback((positions: VisualPositions) => {
    visualPositionsRef.current = positions
    setVisualPositions(positions)
  }, [])

  const setPlayerPosition = useCallback(
    (playerId: string, position: number) => {
      setVisualPositions((current) => {
        if (current[playerId] === position) return current
        const next = { ...current, [playerId]: position }
        visualPositionsRef.current = next
        return next
      })
    },
    [],
  )

  const cancelMotion = useCallback(() => {
    generationRef.current += 1
    queueRef.current = []
    processingGenerationRef.current = null
    for (const [timerId, cancelWait] of pendingWaitsRef.current) {
      window.clearTimeout(timerId)
      cancelWait()
    }
    pendingWaitsRef.current.clear()
  }, [])

  useEffect(() => {
    onMotionSettledRef.current = onMotionSettled
  }, [onMotionSettled])

  useEffect(() => {
    onTokenStepRef.current = onTokenStep
  }, [onTokenStep])

  useEffect(() => {
    onTokenTeleportRef.current = onTokenTeleport
  }, [onTokenTeleport])

  const notifyMotionSettled = useCallback(
    (
      sequence: number,
      gameId: string | null,
      settledSyncMotionKey?: string | number,
    ) => {
      onMotionSettledRef.current?.({
        gameId,
        sequence,
        syncMotionKey: settledSyncMotionKey,
      })
    },
    [],
  )

  const wait = useCallback((milliseconds: number, generation: number) => {
    return new Promise<boolean>((resolve) => {
      if (generation !== generationRef.current) {
        resolve(false)
        return
      }
      const timerId = window.setTimeout(() => {
        pendingWaitsRef.current.delete(timerId)
        resolve(generation === generationRef.current)
      }, milliseconds)
      pendingWaitsRef.current.set(timerId, () => resolve(false))
    })
  }, [])

  const runQueue = useCallback(() => {
    const generation = generationRef.current
    if (processingGenerationRef.current === generation) return
    processingGenerationRef.current = generation

    void (async () => {
      while (generation === generationRef.current) {
        const movement = queueRef.current.shift()
        if (!movement) break

        const count = Math.max(1, tileCountRef.current)
        const fromPosition = normalizePosition(movement.fromPosition, count)
        const toPosition = normalizePosition(movement.toPosition, count)
        if (visualPositionsRef.current[movement.playerId] !== fromPosition) {
          setPlayerPosition(movement.playerId, fromPosition)
        }

        if (
          movement.eventType === 'dice.rolled' &&
          !(await wait(
            motionIntensity === 'soft'
              ? Math.round(DICE_SETTLE_DELAY_MS * 0.55)
              : DICE_SETTLE_DELAY_MS,
            generation,
          ))
        ) {
          break
        }

        if (movement.movement === 'teleport') {
          setPlayerPosition(movement.playerId, toPosition)
          onTokenTeleportRef.current?.({
            sequence: movement.sequence,
            step: 0,
            playerId: movement.playerId,
          })
          continue
        }

        const direction = movement.movement === 'backward' ? -1 : 1
        const stepCount =
          Math.abs(movement.steps) ||
          directionalDistance(
            fromPosition,
            toPosition,
            direction,
            count,
          )
        const stepDuration = stepDurationFor(stepCount, motionIntensity)

        for (let step = 1; step <= stepCount; step += 1) {
          if (generation !== generationRef.current) break
          setPlayerPosition(
            movement.playerId,
            normalizePosition(fromPosition + direction * step, count),
          )
          onTokenStepRef.current?.({
            sequence: movement.sequence,
            step,
            playerId: movement.playerId,
          })
          if (!(await wait(stepDuration, generation))) break
        }

        if (generation === generationRef.current) {
          setPlayerPosition(movement.playerId, toPosition)
        }
      }

      if (generation !== generationRef.current) return
      processingGenerationRef.current = null
      replaceVisualPositions(latestAuthoritativeRef.current)
      notifyMotionSettled(
        processedSequenceRef.current,
        gameIdRef.current,
        syncMotionKeyRef.current,
      )
    })()
  }, [motionIntensity, notifyMotionSettled, replaceVisualPositions, setPlayerPosition, wait])

  useEffect(() => {
    tileCountRef.current = tileCount
    const authoritative = authoritativePositions(game)
    latestAuthoritativeRef.current = authoritative
    const nextSequence = latestSequence(game)
    const gameChanged = gameIdRef.current !== (game?.id ?? null)
    const syncChanged = !Object.is(syncMotionKeyRef.current, syncMotionKey)

    if (
      !initializedRef.current ||
      gameChanged ||
      syncChanged ||
      prefersReducedMotion ||
      motionIntensity === 'off'
    ) {
      cancelMotion()
      replaceVisualPositions(authoritative)
      processedSequenceRef.current = nextSequence
      gameIdRef.current = game?.id ?? null
      syncMotionKeyRef.current = syncMotionKey
      initializedRef.current = true
      notifyMotionSettled(nextSequence, game?.id ?? null, syncMotionKey)
      return
    }

    gameIdRef.current = game?.id ?? null
    syncMotionKeyRef.current = syncMotionKey
    const movements = (game?.events ?? [])
      .filter((event) => event.sequence > processedSequenceRef.current)
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => movementFromEvent(event))
      .filter((movement): movement is PlayerMovement => movement !== null)

    processedSequenceRef.current = Math.max(
      processedSequenceRef.current,
      nextSequence,
    )

    if (movements.length > 0) {
      queueRef.current.push(...movements)
      runQueue()
    } else if (processingGenerationRef.current === null) {
      replaceVisualPositions(authoritative)
      notifyMotionSettled(nextSequence, game?.id ?? null, syncMotionKey)
    }
  }, [
    cancelMotion,
    game,
    notifyMotionSettled,
    motionIntensity,
    prefersReducedMotion,
    replaceVisualPositions,
    runQueue,
    syncMotionKey,
    tileCount,
  ])

  useEffect(() => cancelMotion, [cancelMotion])

  return visualPositions
}

export function latestMotionSequence(game: GameState | null): number {
  for (let index = (game?.events.length ?? 0) - 1; index >= 0; index -= 1) {
    const event = game?.events[index]
    if (event && movementFromEvent(event) !== null) return event.sequence
  }
  return 0
}

function authoritativePositions(game: GameState | null): VisualPositions {
  return Object.fromEntries(
    (game?.players ?? []).map((player) => [
      player.user_id,
      player.position,
    ]),
  )
}

function latestSequence(game: GameState | null): number {
  return game?.events.reduce(
    (latest, event) => Math.max(latest, event.sequence),
    0,
  ) ?? 0
}

function movementFromEvent(event: GameEvent): PlayerMovement | null {
  const playerId = stringValue(event.data.player_id)
  const fromPosition = integerValue(event.data.from_position)
  const toPosition = integerValue(event.data.to_position)
  const rawSteps = integerValue(event.data.steps)
  const rawMovement = stringValue(event.data.movement)
  if (
    playerId === null ||
    fromPosition === null ||
    toPosition === null ||
    rawMovement === null
  ) {
    return null
  }

  const movement = movementKind(rawMovement, rawSteps)
  if (movement === null) return null

  return {
    sequence: event.sequence,
    eventType: event.type,
    playerId,
    fromPosition,
    toPosition,
    steps: rawSteps ?? 0,
    movement,
  }
}

function movementKind(
  movement: string,
  steps: number | null,
): MovementKind | null {
  if (movement === 'teleport') return 'teleport'
  if (movement === 'backward' || (movement === 'step' && (steps ?? 0) < 0)) {
    return 'backward'
  }
  if (
    movement === 'forward' ||
    movement === 'step' ||
    movement === 'relative'
  ) {
    return (steps ?? 0) < 0 ? 'backward' : 'forward'
  }
  return null
}

function directionalDistance(
  fromPosition: number,
  toPosition: number,
  direction: 1 | -1,
  tileCount: number,
): number {
  return direction === 1
    ? normalizePosition(toPosition - fromPosition, tileCount)
    : normalizePosition(fromPosition - toPosition, tileCount)
}

function stepDurationFor(
  stepCount: number,
  intensity: VisualEffectsIntensity,
): number {
  const duration = stepCount <= 0
    ? DEFAULT_STEP_DURATION_MS
    : Math.max(
    MIN_STEP_DURATION_MS,
    Math.min(
      DEFAULT_STEP_DURATION_MS,
      Math.floor(MAX_MOVEMENT_DURATION_MS / stepCount),
    ),
  )
  return intensity === 'soft' ? Math.max(16, Math.round(duration * 0.55)) : duration
}

function normalizePosition(position: number, tileCount: number): number {
  return ((position % tileCount) + tileCount) % tileCount
}

function integerValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
