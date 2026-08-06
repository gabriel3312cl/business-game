import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import LayersRoundedIcon from '@mui/icons-material/LayersRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { io, type Socket } from 'socket.io-client'
import { api, ApiError, authToken } from '../api'
import { AudioControls } from '../audio/AudioControls'
import {
  GAME_SOUNDS,
  gameAudio,
  type AudioSettings,
  type GameSound,
} from '../audio/gameAudio'
import { useGameEventAudio } from '../audio/useGameEventAudio'
import { chatApi } from '../chat/api'
import { GameChatPanel } from '../chat/GameChatPanel'
import type { ChatMessage } from '../chat/types'
import { useGameChat } from '../chat/useGameChat'
import type {
  BotController,
  BotPersonality,
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  AudioPreferenceSettings,
  PanelId,
  PanelLayoutPreferences as PanelLayout,
  PanelZone,
  TokenAppearanceSettings,
  User,
} from '../types'
import { BotManagementPanel } from './BotManagementPanel'
import { GameActionCenter } from './GameActionCenter'
import { GameAuctionDialog } from './GameAuctionDialog'
import { GameBoard } from './GameBoard'
import { GameFinishedDialog } from './GameFinishedDialog'
import { BoardHeatmapControls } from './BoardHeatmapControls'
import {
  buildHistoryHeatmap,
  buildProbabilityHeatmap,
  type BoardHeatmapMode,
} from './boardHeatmap'
import {
  latestMotionSequence,
  type MotionAudioCue,
  type MotionSettlement,
} from './gameMotion'
import { GamePlayersPanel } from './GamePlayersPanel'
import { playerColors } from './gameColors'
import { GameTradePanel } from './GameTradePanel'
import { LobbySettingsPanel } from './LobbySettingsPanel'
import { PersonalizablePanel } from './PersonalizablePanel'
import { PropertyManagementPanel } from './PropertyManagementPanel'
import { TokenCustomizationDialog } from './TokenCustomizationDialog'
import { normalizeTokenAppearance } from './tokenAppearance'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  zoom: number
  onChange: (game: GameState) => void
  onBackToMenu: () => void
  onLeave: () => void
  onLogout: () => void
  onSessionExpired: () => void
}

interface CommandAck {
  ok: boolean
  code?: 'AUTH_EXPIRED' | 'DOMAIN_ERROR'
  error?: string
}

interface ChatAck {
  ok: boolean
  code?: 'AUTH_EXPIRED' | 'DOMAIN_ERROR' | 'RATE_LIMITED'
  error?: string
  message?: ChatMessage
}

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

type MobilePanel = 'room' | 'players' | 'manage' | 'heatmap' | 'chat' | null

const PANEL_IDS: PanelId[] = [
  'room',
  'heatmap',
  'players',
  'management',
  'chat',
]
const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  order: PANEL_IDS,
  zones: {
    room: 'left',
    heatmap: 'left',
    players: 'right',
    management: 'right',
    chat: 'right',
  },
  heights: {},
}
const PANEL_LAYOUT_STORAGE_PREFIX = 'business-game:panel-layout:v1:'
const TOKEN_APPEARANCE_STORAGE_PREFIX = 'business-game:token-appearance:v1:'

function readPanelLayout(userId: string): PanelLayout {
  try {
    const raw = localStorage.getItem(`${PANEL_LAYOUT_STORAGE_PREFIX}${userId}`)
    if (!raw) return DEFAULT_PANEL_LAYOUT
    return normalizePanelLayout(JSON.parse(raw) as Partial<PanelLayout>)
  } catch {
    return DEFAULT_PANEL_LAYOUT
  }
}

function normalizePanelLayout(stored: Partial<PanelLayout>): PanelLayout {
  const storedOrder = Array.isArray(stored.order)
    ? stored.order.filter(isPanelId)
    : []
  const order = [...new Set<PanelId>([...storedOrder, ...PANEL_IDS])]
  const zones = { ...DEFAULT_PANEL_LAYOUT.zones }
  for (const panelId of PANEL_IDS) {
    const zone = stored.zones?.[panelId]
    if (zone === 'left' || zone === 'right') zones[panelId] = zone
  }
  const heights: Partial<Record<PanelId, number>> = {}
  for (const panelId of PANEL_IDS) {
    const height = stored.heights?.[panelId]
    if (typeof height === 'number' && Number.isFinite(height) && height >= 144) {
      heights[panelId] = Math.round(height)
    }
  }
  return { order, zones, heights }
}

function writePanelLayout(userId: string, layout: PanelLayout): void {
  try {
    localStorage.setItem(
      `${PANEL_LAYOUT_STORAGE_PREFIX}${userId}`,
      JSON.stringify(layout),
    )
  } catch {
    // PostgreSQL remains authoritative when browser storage is unavailable.
  }
}

function readTokenAppearance(userId: string): TokenAppearanceSettings | null {
  try {
    const raw = localStorage.getItem(`${TOKEN_APPEARANCE_STORAGE_PREFIX}${userId}`)
    return raw
      ? normalizeTokenAppearance(
          JSON.parse(raw) as Partial<TokenAppearanceSettings>,
        )
      : null
  } catch {
    return null
  }
}

function writeTokenAppearance(
  userId: string,
  appearance: TokenAppearanceSettings,
): void {
  try {
    localStorage.setItem(
      `${TOKEN_APPEARANCE_STORAGE_PREFIX}${userId}`,
      JSON.stringify(appearance),
    )
  } catch {
    // PostgreSQL remains authoritative when browser storage is unavailable.
  }
}

function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && PANEL_IDS.includes(value as PanelId)
}

function toAudioPreferences(settings: AudioSettings): AudioPreferenceSettings {
  return {
    muted: settings.muted,
    volume: settings.volume,
    disabled_sounds: [...settings.disabledSounds],
  }
}

function fromAudioPreferences(
  preferences: AudioPreferenceSettings,
): AudioSettings {
  return {
    muted: preferences.muted,
    volume: preferences.volume,
    disabledSounds: preferences.disabled_sounds.filter(
      (sound): sound is GameSound => GAME_SOUNDS.includes(sound as GameSound),
    ),
  }
}

export function GameSessionPanel({
  game,
  pack,
  user,
  zoom,
  onChange,
  onBackToMenu,
  onLeave,
  onLogout,
  onSessionExpired,
}: Props) {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const isTablet = useMediaQuery(theme.breakpoints.up('md'))
  const isWide = useMediaQuery(theme.breakpoints.up('xl'))
  const socketRef = useRef<Socket | null>(null)
  const refreshingSocketRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const [confirmResignation, setConfirmResignation] = useState(false)
  const [gameResultOpen, setGameResultOpen] = useState(
    game.status === 'finished',
  )
  const [sideTab, setSideTab] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(() =>
    readPanelLayout(user.id),
  )
  const [tokenAppearance, setTokenAppearance] =
    useState<TokenAppearanceSettings | null>(() => readTokenAppearance(user.id))
  const tokenAppearanceRef = useRef(tokenAppearance)
  const tokenAppearanceChangeRef = useRef(0)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const panelLayoutRef = useRef(panelLayout)
  const panelLayoutChangeRef = useRef(0)
  const preferenceSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const audioSettingsChangeRef = useRef(0)
  const restoringAudioSettingsRef = useRef(false)
  const audioSaveTimerRef = useRef<number | null>(null)
  const audioSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [draggedPanel, setDraggedPanel] = useState<PanelId | null>(null)
  const chat = useGameChat(game.id)
  const receiveChatMessage = chat.receive
  const receiveChatMessageWithAudio = useCallback(
    (message: ChatMessage) => {
      receiveChatMessage(message)
      if (message.author_id === user.id) return
      const mention = `@${user.display_name}`.toLocaleLowerCase()
      gameAudio.play(
        message.body.toLocaleLowerCase().includes(mention)
          ? 'chat-mention'
          : 'chat-message',
        { gain: 0.72 },
      )
    },
    [receiveChatMessage, user.display_name, user.id],
  )
  const [heatmapMode, setHeatmapMode] = useState<BoardHeatmapMode>('off')
  const [heatmapPlayerId, setHeatmapPlayerId] = useState<string | null>(null)
  const [heatmapRange, setHeatmapRange] = useState<{
    gameId: string
    from: number
    to: number | null
  }>(() => ({ gameId: game.id, from: 1, to: null }))
  const [motionSyncKey, setMotionSyncKey] = useState(0)
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  )
  const [motionSettlement, setMotionSettlement] = useState<MotionSettlement>(
    () => ({
      gameId: game.id,
      sequence: latestMotionSequence(game),
      syncMotionKey: 0,
    }),
  )
  const motionPending =
    !prefersReducedMotion &&
    motionSettlement.gameId === game.id &&
    Object.is(motionSettlement.syncMotionKey, motionSyncKey) &&
    latestMotionSequence(game) > motionSettlement.sequence
  const visibleEvents = motionPending
    ? game.events.filter(
        (event) => event.sequence <= motionSettlement.sequence,
      )
    : game.events
  useGameEventAudio(game, visibleEvents, pack, user.id)
  const maximumHeatmapSequence =
    visibleEvents[visibleEvents.length - 1]?.sequence ?? 1
  const selectedHeatmapPlayerId = game.players.some(
    (player) => player.user_id === heatmapPlayerId,
  )
    ? heatmapPlayerId
    : null
  const currentPlayer = game.players[game.current_player_index]
  const probabilityHeatmapAvailable =
    game.status === 'playing' &&
    game.phase === 'waiting_for_roll' &&
    game.pending_auction_selector_id === null &&
    game.active_auction === null &&
    game.active_debt === null &&
    currentPlayer !== undefined &&
    !motionPending
  const activeRange =
    heatmapRange.gameId === game.id
      ? heatmapRange
      : { gameId: game.id, from: 1, to: null }
  const resolvedHeatmapRange = useMemo<[number, number]>(
    () => [
      Math.min(Math.max(1, activeRange.from), maximumHeatmapSequence),
      Math.min(
        Math.max(activeRange.from, activeRange.to ?? maximumHeatmapSequence),
        maximumHeatmapSequence,
      ),
    ],
    [activeRange.from, activeRange.to, maximumHeatmapSequence],
  )
  const boardHeatmap = useMemo(() => {
    if (heatmapMode === 'history') {
      return buildHistoryHeatmap(
        visibleEvents,
        pack.manifest.tile_count,
        selectedHeatmapPlayerId,
        resolvedHeatmapRange[0],
        resolvedHeatmapRange[1],
      )
    }
    if (
      heatmapMode === 'probability' &&
      probabilityHeatmapAvailable &&
      currentPlayer
    ) {
      return buildProbabilityHeatmap(game, pack, currentPlayer)
    }
    return null
  }, [
    currentPlayer,
    game,
    heatmapMode,
    pack,
    probabilityHeatmapAvailable,
    resolvedHeatmapRange,
    selectedHeatmapPlayerId,
    visibleEvents,
  ])
  const handleMotionSettled = useCallback((settlement: MotionSettlement) => {
    setMotionSettlement((current) =>
      current.gameId === settlement.gameId &&
      current.sequence === settlement.sequence &&
      Object.is(current.syncMotionKey, settlement.syncMotionKey)
        ? current
        : settlement,
    )
  }, [])
  const handleTokenStep = useCallback((cue: MotionAudioCue) => {
    gameAudio.play('token-step-metal-soft', {
      gain: 0.58,
      variant: cue.sequence + cue.step,
    })
  }, [])
  const handleTokenTeleport = useCallback(() => {
    gameAudio.play('token-teleport', { gain: 0.78 })
  }, [])
  const handleAuctionCountdown = useCallback(() => {
    gameAudio.play('auction-countdown', { gain: 0.78 })
  }, [])

  useEffect(() => {
    setHeatmapMode('off')
    setHeatmapPlayerId(null)
    setHeatmapRange({ gameId: game.id, from: 1, to: null })
  }, [game.id])

  useEffect(() => {
    if (game.status === 'finished') setGameResultOpen(true)
  }, [game.id, game.status])

  useEffect(() => {
    if (heatmapMode === 'probability' && !probabilityHeatmapAvailable) {
      setHeatmapMode('off')
    }
  }, [heatmapMode, probabilityHeatmapAvailable])

  const savePanelLayoutRemotely = useCallback((layout: PanelLayout) => {
    preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.updatePanelLayout(layout)
        } catch {
          // The local cache remains available until a later change retries.
        }
      })
  }, [])

  const saveAudioSettingsRemotely = useCallback((settings: AudioSettings) => {
    const preferences = toAudioPreferences(settings)
    audioSaveQueueRef.current = audioSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.updateAudioSettings(preferences)
        } catch {
          // The per-user browser cache remains available until a later change retries.
        }
      })
  }, [])

  const saveTokenAppearanceRemotely = useCallback(
    (appearance: TokenAppearanceSettings) => {
      preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.updateTokenAppearance(appearance)
          } catch {
            // The per-user browser cache remains available until a later change retries.
          }
        })
    },
    [],
  )

  useEffect(() => {
    gameAudio.useUser(user.id)
    const unsubscribe = gameAudio.subscribe(() => {
      if (restoringAudioSettingsRef.current) return
      audioSettingsChangeRef.current += 1
      if (audioSaveTimerRef.current !== null) {
        window.clearTimeout(audioSaveTimerRef.current)
      }
      audioSaveTimerRef.current = window.setTimeout(() => {
        audioSaveTimerRef.current = null
        saveAudioSettingsRemotely(gameAudio.getSettings())
      }, 350)
    })
    return () => {
      unsubscribe()
      if (audioSaveTimerRef.current !== null) {
        window.clearTimeout(audioSaveTimerRef.current)
        audioSaveTimerRef.current = null
      }
    }
  }, [saveAudioSettingsRemotely, user.id])

  useEffect(() => {
    let active = true
    const changesAtStart = panelLayoutChangeRef.current
    const audioChangesAtStart = audioSettingsChangeRef.current
    const tokenChangesAtStart = tokenAppearanceChangeRef.current
    void api
      .getUserPreferences()
      .then((preferences) => {
        if (!active) return
        if (
          preferences.panel_layout &&
          panelLayoutChangeRef.current === changesAtStart
        ) {
          const restored = normalizePanelLayout(preferences.panel_layout)
          panelLayoutRef.current = restored
          setPanelLayout(restored)
          writePanelLayout(user.id, restored)
        } else {
          savePanelLayoutRemotely(panelLayoutRef.current)
        }
        if (
          preferences.audio_settings &&
          audioSettingsChangeRef.current === audioChangesAtStart
        ) {
          restoringAudioSettingsRef.current = true
          try {
            gameAudio.replaceSettings(
              fromAudioPreferences(preferences.audio_settings),
            )
          } finally {
            restoringAudioSettingsRef.current = false
          }
        } else {
          saveAudioSettingsRemotely(gameAudio.getSettings())
        }
        if (
          preferences.token_appearance &&
          tokenAppearanceChangeRef.current === tokenChangesAtStart
        ) {
          const restored = normalizeTokenAppearance(preferences.token_appearance)
          if (restored) {
            tokenAppearanceRef.current = restored
            setTokenAppearance(restored)
            writeTokenAppearance(user.id, restored)
          }
        } else if (tokenAppearanceRef.current) {
          saveTokenAppearanceRemotely(tokenAppearanceRef.current)
        }
      })
      .catch(() => {
        // The per-user browser cache keeps customization available offline.
      })
    return () => {
      active = false
    }
  }, [
    saveAudioSettingsRemotely,
    savePanelLayoutRemotely,
    saveTokenAppearanceRemotely,
    user.id,
  ])

  const updateTokenAppearance = useCallback(
    (appearance: TokenAppearanceSettings) => {
      const normalized = normalizeTokenAppearance(appearance)
      if (!normalized) return
      tokenAppearanceRef.current = normalized
      tokenAppearanceChangeRef.current += 1
      setTokenAppearance(normalized)
      writeTokenAppearance(user.id, normalized)
      saveTokenAppearanceRemotely(normalized)
      setTokenDialogOpen(false)
    },
    [saveTokenAppearanceRemotely, user.id],
  )

  const updatePanelLayout = useCallback(
    (update: (current: PanelLayout) => PanelLayout) => {
      const next = update(panelLayoutRef.current)
      panelLayoutRef.current = next
      panelLayoutChangeRef.current += 1
      setPanelLayout(next)
      writePanelLayout(user.id, next)
      savePanelLayoutRemotely(next)
    },
    [savePanelLayoutRemotely, user.id],
  )

  const movePanel = useCallback(
    (panelId: PanelId, targetId: PanelId | null, zone: PanelZone) => {
      updatePanelLayout((current) => {
        const order = current.order.filter((candidate) => candidate !== panelId)
        const targetIndex = targetId === null ? -1 : order.indexOf(targetId)
        if (targetIndex === -1) order.push(panelId)
        else order.splice(targetIndex, 0, panelId)
        return {
          ...current,
          order,
          zones: isWide
            ? { ...current.zones, [panelId]: zone }
            : current.zones,
        }
      })
    },
    [isWide, updatePanelLayout],
  )

  const startPanelDrag = useCallback(
    (panelId: PanelId, event: DragEvent<HTMLElement>) => {
      setDraggedPanel(panelId)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', panelId)
    },
    [],
  )

  const dropPanel = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      targetId: PanelId | null,
      zone: PanelZone,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const transferred = event.dataTransfer.getData('text/plain')
      const panelId = draggedPanel ?? (isPanelId(transferred) ? transferred : null)
      if (panelId && panelId !== targetId) movePanel(panelId, targetId, zone)
      setDraggedPanel(null)
    },
    [draggedPanel, movePanel],
  )

  const resizePanel = useCallback(
    (panelId: PanelId, height: number) => {
      updatePanelLayout((current) => ({
        ...current,
        heights: { ...current.heights, [panelId]: height },
      }))
    },
    [updatePanelLayout],
  )

  useEffect(() => {
    const token = authToken.get()
    if (!token) {
      setConnectionState('disconnected')
      return
    }
    setConnectionState('connecting')
    const socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = socket
    let connectedOnce = false
    let connectionWasLost = false

    async function renewSocketSession() {
      if (refreshingSocketRef.current) return
      refreshingSocketRef.current = true
      try {
        const refreshed = await api.refreshSession()
        socket.auth = { token: refreshed.access_token }
        if (socket.connected) {
          joinRoom()
        } else {
          socket.connect()
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          setConnectionState('disconnected')
          onSessionExpired()
        } else {
          setConnectionState('reconnecting')
        }
      } finally {
        refreshingSocketRef.current = false
      }
    }

    function joinRoom() {
      socket.timeout(8000).emit(
        'room_join',
        { game_id: game.id },
        (timeoutError: Error | null, ack?: CommandAck) => {
          if (timeoutError) {
            setConnectionState('reconnecting')
            setError(t('realtimeError'))
            return
          }
          if (!ack) {
            setConnectionState('reconnecting')
            return
          }
          if (ack.ok) {
            if (connectionWasLost) {
              gameAudio.play('connection-restored', { gain: 0.82 })
            }
            connectedOnce = true
            connectionWasLost = false
            setConnectionState('connected')
            setError(null)
            setMotionSyncKey((value) => value + 1)
          } else {
            setConnectionState('disconnected')
            setError(ack.error ?? t('realtimeError'))
            if (isAuthenticationError(ack.code, ack.error)) {
              void renewSocketSession()
            }
          }
        },
      )
    }

    function resyncVisibleGame() {
      if (document.visibilityState !== 'visible') return
      if (socket.connected) {
        joinRoom()
      } else if (navigator.onLine) {
        socket.connect()
      }
    }

    function reconnectOnline() {
      if (socket.connected) {
        joinRoom()
      } else {
        socket.connect()
      }
    }

    socket.on('connect', joinRoom)
    socket.on('game_state', (nextGame: GameState) => {
      setConnectionState('connected')
      onChange(nextGame)
    })
    socket.on('chat_message', receiveChatMessageWithAudio)
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        if (connectedOnce && !connectionWasLost) {
          gameAudio.play('connection-lost', { gain: 0.82 })
        }
        connectionWasLost = true
        setConnectionState('reconnecting')
        if (reason === 'io server disconnect') socket.connect()
      }
    })
    socket.on('connect_error', (connectionError) => {
      if (connectedOnce && !connectionWasLost) {
        gameAudio.play('connection-lost', { gain: 0.82 })
      }
      if (connectedOnce) connectionWasLost = true
      setConnectionState('reconnecting')
      setError(t('realtimeError'))
      if (
        navigator.onLine &&
        isAuthenticationError(
          socketErrorCode(connectionError),
          connectionError.message,
        )
      ) {
        void renewSocketSession()
      }
    })
    socket.io.on('reconnect_attempt', () => setConnectionState('reconnecting'))
    window.addEventListener('online', reconnectOnline)
    document.addEventListener('visibilitychange', resyncVisibleGame)

    return () => {
      window.removeEventListener('online', reconnectOnline)
      document.removeEventListener('visibilitychange', resyncVisibleGame)
      socket.disconnect()
      socketRef.current = null
      refreshingSocketRef.current = false
    }
  }, [game.id, onChange, onSessionExpired, receiveChatMessageWithAudio, t])

  const playerName = (playerId: string | null) =>
    game.players.find((player) => player.user_id === playerId)?.display_name ??
    t('bank')

  const run = async (
    operation: () => Promise<GameState>,
    snapToSnapshot = false,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const nextGame = await operation()
      onChange(nextGame)
      if (snapToSnapshot) {
        setMotionSyncKey((value) => value + 1)
      }
      return true
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired()
        return false
      }
      gameAudio.play('action-rejected', { gain: 0.72 })
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('operationRejected'),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  const sendCommand = async (command: GameCommand): Promise<boolean> => {
    const socket = socketRef.current
    if (!socket?.connected) {
      setBusy(true)
      setError(null)
      try {
        onChange(await api.executeCommand(game.id, command))
        return true
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired()
        } else {
          gameAudio.play('action-rejected', { gain: 0.72 })
          setError(
            requestError instanceof Error
              ? requestError.message
              : t('operationRejected'),
          )
        }
        return false
      } finally {
        setBusy(false)
      }
    }
    setBusy(true)
    setError(null)
    return new Promise<boolean>((resolve) => {
      socket.timeout(8000).emit(
        'game_command',
        { game_id: game.id, command },
        (timeoutError: Error | null, ack?: CommandAck) => {
          if (timeoutError) {
            gameAudio.play('action-rejected', { gain: 0.72 })
            setError(t('realtimeError'))
            setConnectionState('reconnecting')
            setBusy(false)
            resolve(false)
            return
          }
          if (!ack) {
            gameAudio.play('action-rejected', { gain: 0.72 })
            setError(t('commandRejected'))
            setBusy(false)
            resolve(false)
            return
          }
          if (!ack.ok) {
            gameAudio.play('action-rejected', { gain: 0.72 })
            setError(ack.error ?? t('commandRejected'))
            if (isAuthenticationError(ack.code, ack.error)) {
              socket.disconnect()
              socket.connect()
            }
            setBusy(false)
            resolve(false)
            return
          }
          setBusy(false)
          resolve(true)
        },
      )
    })
  }

  const sendChatMessage = async (body: string): Promise<boolean> => {
    const socket = socketRef.current
    if (!socket?.connected) {
      // Chat must not depend on the socket being up; the room broadcast still
      // reaches everyone else, and `receive` dedupes our own copy by id.
      try {
        receiveChatMessage(await chatApi.send(game.id, body))
        return true
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired()
        } else {
          gameAudio.play('action-rejected', { gain: 0.58 })
        }
        return false
      }
    }
    return new Promise<boolean>((resolve) => {
      socket.timeout(8000).emit(
        'chat_message',
        { game_id: game.id, body },
        (timeoutError: Error | null, ack?: ChatAck) => {
          if (timeoutError) {
            gameAudio.play('action-rejected', { gain: 0.58 })
            setConnectionState('reconnecting')
            resolve(false)
            return
          }
          if (!ack?.ok) {
            gameAudio.play('action-rejected', { gain: 0.58 })
            if (ack && isAuthenticationError(ack.code, ack.error)) {
              socket.disconnect()
              socket.connect()
            }
            setError(
              ack?.code === 'RATE_LIMITED'
                ? t('chat.rateLimited')
                : (ack?.error ?? t('chat.sendFailed')),
            )
            resolve(false)
            return
          }
          if (ack.message) receiveChatMessage(ack.message)
          resolve(true)
        },
      )
    })
  }

  const leaveGame = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.leaveGame(game.id)
      onLeave()
    } catch (requestError) {
      gameAudio.play('action-rejected', { gain: 0.72 })
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('operationRejected'),
      )
    } finally {
      setBusy(false)
      setConfirmResignation(false)
    }
  }

  const isParticipant = game.players.some(
    (player) => player.user_id === user.id,
  )
  const isSpectator = game.spectators.some(
    (spectator) => spectator.user_id === user.id,
  )
  const isHost = game.host_user_id === user.id
  const currentUserPlayerIndex = game.players.findIndex(
    (player) => player.user_id === user.id,
  )
  const tokenDialogValue = useMemo<TokenAppearanceSettings>(
    () =>
      tokenAppearance ?? {
        color:
          playerColors[
            Math.max(0, currentUserPlayerIndex) % playerColors.length
          ],
        shape: 'circle',
        icon: 'number',
      },
    [currentUserPlayerIndex, tokenAppearance],
  )
  const currentCardId = currentTurnCardId(game.events)
  const lastCard = pack.board.decks
    .flatMap((deck) => deck.cards)
    .find((card) => card.id === currentCardId)

  const roomContent = (
    <Stack spacing={1.5}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography fontWeight={900} sx={{ letterSpacing: '-0.03em' }}>
              BUSINESS<span style={{ color: '#b8ff3d' }}>GAME</span>
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <AudioControls />
              <FormControl size="small">
                <Select
                  value={i18n.language}
                  onChange={(event) =>
                    void i18n.changeLanguage(event.target.value)
                  }
                  aria-label="Language"
                  sx={{ minWidth: 68 }}
                >
                  <MenuItem value="es">ES</MenuItem>
                  <MenuItem value="en">EN</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,.045)',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} minWidth={0}>
              <AccountCircleRoundedIcon color="secondary" />
              <Typography
                variant="body2"
                fontWeight={750}
                noWrap
                title={user.display_name}
              >
                {user.display_name}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5}>
              {isParticipant && (
                <Button
                  size="small"
                  color="secondary"
                  startIcon={<PaletteRoundedIcon />}
                  onClick={() => setTokenDialogOpen(true)}
                >
                  {t('token.open')}
                </Button>
              )}
              <Button
                size="small"
                color="inherit"
                startIcon={<LogoutRoundedIcon />}
                onClick={onLogout}
              >
                {t('logout')}
              </Button>
            </Stack>
          </Stack>

          <Box>
            <Typography variant="overline" color="secondary.light">
              {t('room')}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography
                fontWeight={850}
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {game.id.slice(0, 8)}
              </Typography>
              <IconButton
                size="small"
                aria-label={t('copyRoomId')}
                onClick={() => void navigator.clipboard.writeText(game.id)}
              >
                <ContentCopyRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              label={t(`gameStatus.${game.status}`)}
              color={game.status === 'playing' ? 'success' : 'default'}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t(`connection.${connectionState}`)}
              color={connectionColor(connectionState)}
            />
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            <Button
              size="small"
              startIcon={<MenuRoundedIcon />}
              disabled={busy}
              onClick={onBackToMenu}
            >
              {t('backToMenu')}
            </Button>
            <Button
              size="small"
              startIcon={<RefreshRoundedIcon />}
              disabled={busy}
              onClick={() => void run(() => api.getGame(game.id), true)}
            >
              {t('refresh')}
            </Button>
            {(isParticipant || isSpectator) && (
              <Button
                size="small"
                color={
                  game.status === 'playing' && isParticipant ? 'error' : 'inherit'
                }
                startIcon={<LogoutRoundedIcon />}
                disabled={busy}
                onClick={() => {
                  if (game.status === 'playing' && isParticipant) {
                    setConfirmResignation(true)
                  } else {
                    void leaveGame()
                  }
                }}
              >
                {game.status === 'playing' && isParticipant
                  ? t('resignGame')
                  : t('leaveRoom')}
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={t('houseSupply', { count: game.houses_remaining })}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t('hotelSupply', { count: game.hotels_remaining })}
            />
            {game.settings.rules.free_parking_jackpot && (
              <Chip
                size="small"
                color={game.bank_pot > 0 ? 'secondary' : 'default'}
                variant="outlined"
                label={t('bankPot', { amount: game.bank_pot })}
              />
            )}
          </Stack>

          {game.status === 'lobby' && (
            <Stack spacing={2}>
              <LobbySettingsPanel
                game={game}
                pack={pack}
                isHost={isHost}
                busy={busy}
                onUpdate={(data) =>
                  void run(() => api.updateGameSettings(game.id, data))
                }
              />
              <BotManagementPanel
                game={game}
                isHost={isHost}
                busy={busy}
                onAdd={(
                  controller: BotController,
                  personality: BotPersonality,
                  displayName?: string,
                ) =>
                  run(() =>
                    api.addBot(game.id, controller, personality, displayName),
                  )
                }
                onRemove={(botId) => run(() => api.removeBot(game.id, botId))}
              />
            </Stack>
          )}
    </Stack>
  )

  const heatmapContent = (
    <BoardHeatmapControls
      mode={heatmapMode}
      playerId={selectedHeatmapPlayerId}
      players={game.players}
      range={resolvedHeatmapRange}
      maximumSequence={maximumHeatmapSequence}
      probabilityAvailable={probabilityHeatmapAvailable}
      showTitle={false}
      onModeChange={setHeatmapMode}
      onPlayerChange={setHeatmapPlayerId}
      onRangeChange={([from, to]) =>
        setHeatmapRange({
          gameId: game.id,
          from,
          to: to >= maximumHeatmapSequence ? null : to,
        })
      }
      onShowAllHistory={() =>
        setHeatmapRange({ gameId: game.id, from: 1, to: null })
      }
    />
  )

  const playersContent = (
    <GamePlayersPanel
      game={game}
      user={user}
      useAssetTokens={pack.board.tiles.some((tile) => tile.asset_path)}
      currentUserTokenAppearance={tokenAppearance}
      showTitle={false}
    />
  )

  const propertiesContent = (
    <PropertyManagementPanel
      embedded
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      onCommand={sendCommand}
    />
  )

  const tradesContent = (
    <GameTradePanel
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      error={error}
      onCommand={sendCommand}
    />
  )

  const tabContent = sideTab === 0 ? propertiesContent : tradesContent

  const managementContent = (
    <>
      <Tabs
        value={sideTab}
        onChange={(_, value: number) => setSideTab(value)}
        variant="scrollable"
        scrollButtons={false}
        aria-label={t('gamePanels')}
      >
        <Tab
          value={0}
          id="game-panel-tab-0"
          aria-controls="game-panel-0"
          label={t('properties')}
        />
        <Tab
          value={1}
          id="game-panel-tab-1"
          aria-controls="game-panel-1"
          label={t('trades')}
        />
      </Tabs>
      <Box
        role="tabpanel"
        id={`game-panel-${sideTab}`}
        aria-labelledby={`game-panel-tab-${sideTab}`}
        sx={{ pt: 2, minWidth: 0 }}
      >
        {tabContent}
      </Box>
    </>
  )

  const criticalAlerts = (
    <>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!motionPending && lastCard && (
        <Alert severity="info">
          {t('drawnCard', { message: pack.messages[lastCard.message_key] })}
        </Alert>
      )}
      {!motionPending && game.active_debt && (
        <Alert
          severity="error"
          sx={{
            flexDirection: { xs: 'column', sm: 'row' },
            '& .MuiAlert-action': {
              ml: { xs: 0, sm: 2 },
              mt: { xs: 1, sm: 0 },
              alignSelf: { xs: 'stretch', sm: 'center' },
            },
          }}
          action={
            game.active_debt.debtor_id === user.id ? (
              <Stack direction="row" useFlexGap flexWrap="wrap">
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() => void sendCommand({ action: 'pay_debt' })}
                >
                  {t('payDebt')}
                </Button>
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() =>
                    void sendCommand({ action: 'declare_bankruptcy' })
                  }
                >
                  {t('declareBankruptcy')}
                </Button>
              </Stack>
            ) : undefined
          }
        >
          {t('debtSummary', {
            debtor: playerName(game.active_debt.debtor_id),
            amount: game.active_debt.amount,
            creditor: playerName(game.active_debt.creditor_id),
          })}
        </Alert>
      )}
    </>
  )

  const renderSidebarPanel = (
    panelId: PanelId,
    zone: PanelZone,
    personalizable = true,
  ) => {
    const title =
      panelId === 'room'
        ? t('room')
        : panelId === 'heatmap'
          ? t('heatmap.title')
          : panelId === 'players'
            ? t('playersPanel')
            : panelId === 'management'
              ? t('propertiesAndTrades')
              : t('chat.title')
    const content =
      panelId === 'room'
        ? roomContent
        : panelId === 'heatmap'
          ? heatmapContent
          : panelId === 'players'
            ? playersContent
            : panelId === 'management'
              ? managementContent
              : (
                  <GameChatPanel
                    game={game}
                    user={user}
                    chat={chat}
                    showHeader={false}
                    fillAvailableHeight={personalizable}
                    onSend={sendChatMessage}
                  />
                )

    return (
      <PersonalizablePanel
        key={panelId}
        id={`game-panel-${panelId}`}
        title={title}
        personalizable={personalizable}
        height={personalizable ? panelLayout.heights[panelId] : undefined}
        defaultHeight={
          personalizable
            ? panelId === 'room'
              ? 'calc(68dvh - 12px)'
              : panelId === 'heatmap'
                ? 'calc(32dvh - 28px)'
                : panelId === 'players'
                  ? '30dvh'
                  : panelId === 'management'
                    ? '40dvh'
                    : 'calc(30dvh - 40px)'
            : undefined
        }
        dragging={draggedPanel === panelId}
        dragLabel={t('layout.dragPanel', { panel: title })}
        resizeLabel={t('layout.resizePanel', { panel: title })}
        onDragStart={(event) => startPanelDrag(panelId, event)}
        onDragEnd={() => setDraggedPanel(null)}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => dropPanel(event, panelId, zone)}
        onHeightChange={(height) => resizePanel(panelId, height)}
      >
        {content}
      </PersonalizablePanel>
    )
  }

  return (
    <Box
      data-testid="game-workspace"
      sx={{
        width: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          minHeight: 0,
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1fr) clamp(240px, 25vw, 280px)',
            lg: 'minmax(0, 1fr) clamp(280px, 25vw, 330px)',
            xl: 'clamp(230px, 16vw, 280px) minmax(0, 1fr) clamp(310px, 22vw, 360px)',
          },
          gridTemplateAreas: {
            xs: '"board"',
            md: '"board right"',
            xl: '"left board right"',
          },
          gap: 0,
          alignItems: 'stretch',
        }}
      >
        {isWide && (
          <Stack
            gridArea="left"
            spacing={1.25}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => dropPanel(event, null, 'left')}
            sx={{
              height: '100%',
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehaviorY: 'contain',
              scrollbarGutter: 'stable',
              p: 1,
              borderRight: '1px solid rgba(255,255,255,.08)',
              '& > *': { flexShrink: 0 },
            }}
          >
            {panelLayout.order
              .filter((panelId) => panelLayout.zones[panelId] === 'left')
              .map((panelId) => renderSidebarPanel(panelId, 'left'))}
          </Stack>
        )}

        <Stack
          gridArea="board"
          spacing={0}
          sx={{
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Stack
            spacing={0.75}
            sx={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(92%, 760px)',
              zIndex: 8,
              pointerEvents: 'none',
              '& .MuiAlert-root': { pointerEvents: 'auto' },
            }}
          >
            {criticalAlerts}
          </Stack>
          <Box
            sx={{
              width: '100%',
              height: '100%',
              minWidth: 0,
              overflow: 'auto',
              display: 'flex',
              justifyContent: zoom > 1 ? 'flex-start' : 'center',
              alignItems: 'flex-start',
            }}
          >
            <GameBoard
              pack={pack}
              zoom={zoom}
              game={game}
              currentUserId={user.id}
              currentUserTokenAppearance={tokenAppearance}
              syncMotionKey={motionSyncKey}
              onMotionSettled={handleMotionSettled}
              onTokenStep={handleTokenStep}
              onTokenTeleport={handleTokenTeleport}
              motionPending={motionPending}
              busy={busy}
              onCommand={sendCommand}
              heatmap={boardHeatmap}
              centerContent={
                <GameActionCenter
                  game={game}
                  pack={pack}
                  user={user}
                  busy={busy}
                  motionPending={motionPending}
                  visibleEvents={visibleEvents}
                  isHost={isHost}
                  probabilityHeatmapVisible={heatmapMode === 'probability'}
                  onCommand={sendCommand}
                  onToggleProbabilityHeatmap={() =>
                    setHeatmapMode((mode) =>
                      mode === 'probability' ? 'off' : 'probability',
                    )
                  }
                  onStart={() => void run(() => api.startGame(game.id))}
                />
              }
            />
          </Box>
        </Stack>

        {isTablet && (
          <Stack
            gridArea="right"
            spacing={1.25}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => dropPanel(event, null, 'right')}
            sx={{
              height: '100%',
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehaviorY: 'contain',
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
              scrollbarGutter: 'stable',
              p: 1,
              borderLeft: '1px solid rgba(255,255,255,.08)',
              '& > *': { flexShrink: 0 },
            }}
          >
            {panelLayout.order
              .filter(
                (panelId) =>
                  !isWide || panelLayout.zones[panelId] === 'right',
              )
              .map((panelId) => renderSidebarPanel(panelId, 'right'))}
          </Stack>
        )}
      </Box>

      {!isTablet && (
        <>
          <BottomNavigation
            showLabels
            value={mobilePanel}
            sx={{
              position: 'fixed',
              left: 8,
              right: 8,
              bottom: 'max(8px, env(safe-area-inset-bottom))',
              zIndex: 1200,
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 12px 36px rgba(0,0,0,.5)',
            }}
          >
            <BottomNavigationAction
              value="room"
              label={t('room')}
              icon={<MenuRoundedIcon />}
              onClick={() => setMobilePanel('room')}
            />
            <BottomNavigationAction
              value="players"
              label={t('playersPanel')}
              icon={<GroupsRoundedIcon />}
              onClick={() => setMobilePanel('players')}
            />
            <BottomNavigationAction
              value="manage"
              label={t('manage')}
              icon={<ApartmentRoundedIcon />}
              onClick={() => setMobilePanel('manage')}
            />
            <BottomNavigationAction
              value="heatmap"
              label={t('heatmap.title')}
              icon={<LayersRoundedIcon />}
              onClick={() => setMobilePanel('heatmap')}
            />
            <BottomNavigationAction
              value="chat"
              label={t('chat.short')}
              icon={<ForumRoundedIcon />}
              onClick={() => setMobilePanel('chat')}
            />
          </BottomNavigation>
          <Drawer
            anchor="bottom"
            open={mobilePanel !== null}
            onClose={() => setMobilePanel(null)}
            slotProps={{
              paper: {
                sx: {
                  maxHeight: 'min(78dvh, 720px)',
                  borderRadius: '20px 20px 0 0',
                  p: 1.5,
                  pb: 'max(16px, env(safe-area-inset-bottom))',
                },
              },
            }}
          >
            <Stack
              direction="row"
              justifyContent="flex-end"
              sx={{ position: 'sticky', top: 0, zIndex: 1 }}
            >
              <IconButton
                aria-label={t('close')}
                onClick={() => setMobilePanel(null)}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
            <Box sx={{ overflow: 'auto' }}>
              {mobilePanel === 'room' &&
                renderSidebarPanel('room', 'left', false)}
              {mobilePanel === 'players' &&
                renderSidebarPanel('players', 'right', false)}
              {mobilePanel === 'manage' &&
                renderSidebarPanel('management', 'right', false)}
              {mobilePanel === 'heatmap' &&
                renderSidebarPanel('heatmap', 'left', false)}
              {mobilePanel === 'chat' &&
                renderSidebarPanel('chat', 'right', false)}
            </Box>
          </Drawer>
        </>
      )}

      {!motionPending && (
        <GameAuctionDialog
          game={game}
          pack={pack}
          user={user}
          busy={busy}
          error={error}
          onCommand={sendCommand}
          onCountdownWarning={handleAuctionCountdown}
        />
      )}

      <GameFinishedDialog
        open={gameResultOpen}
        game={game}
        currentUserId={user.id}
        busy={busy}
        onClose={() => setGameResultOpen(false)}
        onExit={() => void leaveGame()}
      />

      <TokenCustomizationDialog
        open={tokenDialogOpen}
        value={tokenDialogValue}
        playerNumber={Math.max(1, currentUserPlayerIndex + 1)}
        onClose={() => setTokenDialogOpen(false)}
        onSave={updateTokenAppearance}
      />

      <Dialog
        open={confirmResignation}
        onClose={() => setConfirmResignation(false)}
      >
        <DialogTitle>{t('confirmResignTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('confirmResignBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmResignation(false)}>
            {t('cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void leaveGame()}
          >
            {t('confirmResign')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function isAuthenticationError(code?: string, error?: string): boolean {
  return code === 'AUTH_EXPIRED' || error === 'authentication required'
}

function currentTurnCardId(events: GameEvent[]): string | null {
  let latestBoundarySequence = 0
  let latestCardEvent: GameEvent | null = null

  for (const event of events) {
    if (
      event.type === 'turn.started' ||
      event.type === 'turn.extra_roll' ||
      event.type === 'game.finished'
    ) {
      latestBoundarySequence = Math.max(latestBoundarySequence, event.sequence)
    } else if (
      event.type === 'card.drawn' &&
      (latestCardEvent === null ||
        event.sequence > latestCardEvent.sequence)
    ) {
      latestCardEvent = event
    }
  }

  if (
    latestCardEvent === null ||
    latestCardEvent.sequence <= latestBoundarySequence
  ) {
    return null
  }
  const cardId = latestCardEvent.data.card_id
  return typeof cardId === 'string' ? cardId : null
}

function socketErrorCode(error: Error): string | undefined {
  const data = (error as Error & { data?: { code?: unknown } }).data
  return typeof data?.code === 'string' ? data.code : undefined
}

function connectionColor(
  state: ConnectionState,
): 'success' | 'warning' | 'error' | 'default' {
  if (state === 'connected') return 'success'
  if (state === 'reconnecting') return 'warning'
  if (state === 'disconnected') return 'error'
  return 'default'
}
