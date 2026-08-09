import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import LayersRoundedIcon from '@mui/icons-material/LayersRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import VerticalAlignCenterRoundedIcon from '@mui/icons-material/VerticalAlignCenterRounded'
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  type DragEvent,
  lazy,
  Suspense,
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
  AutomationPreferenceSettings,
  BotController,
  BotPersonality,
  ContentPack,
  GameCommand,
  GameState,
  AudioPreferenceSettings,
  ManagementPanelId,
  PanelId,
  PanelLayoutPreferences,
  TokenAppearanceSettings,
  User,
  VisualEffectsIntensity,
  VisualEffectsPreferenceSettings,
  WorkspacePanelId,
  WorkspacePanelLayoutPreferences,
  WorkspacePanelPlacement,
  WorkspacePanelWindowGeometry,
} from '../types'
import { nextAutomationCommand } from '../gameAutomation'
import { BotManagementPanel } from './BotManagementPanel'
import { BankPanel } from './BankPanel'
import { GameActionCenter } from './GameActionCenter'
import { GameAuctionDialog } from './GameAuctionDialog'
import { GameBoard } from './GameBoard'
import { GameCardChoiceDialog } from './GameCardChoiceDialog'
import { GameCardDrawDialog } from './GameCardDrawDialog'
import { GameFinishedDialog } from './GameFinishedDialog'
import { GameVisualEffects } from './GameVisualEffects'
import { BoardHeatmapControls } from './BoardHeatmapControls'
import { DebtAccountsPanel } from './DebtAccountsPanel'
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
import { FloatingWorkspacePanel } from './FloatingWorkspacePanel'
import { playerColors } from './gameColors'
import { GameTradePanel } from './GameTradePanel'
import { LobbySettingsPanel } from './LobbySettingsPanel'
import {
  clearManagementPanelHeights,
  DEFAULT_MANAGEMENT_PANEL_LAYOUT,
  isManagementPanelId,
  keepManagementSelection,
  MANAGEMENT_PANEL_IDS,
  moveManagementPanel,
  normalizeManagementPanelLayout,
} from './managementPanelLayout'
import { MarketPanel } from './MarketPanel'
import { PersonalizablePanel } from './PersonalizablePanel'
import { PropertyManagementPanel } from './PropertyManagementPanel'
import { RentDebtResolutionPanel } from './RentDebtResolutionPanel'
import { TokenCustomizationDialog } from './TokenCustomizationDialog'
import { VisualEffectsControl } from './VisualEffectsControl'
import { normalizeTokenAppearance } from './tokenAppearance'
import {
  clearWorkspacePanelHeights,
  DEFAULT_WORKSPACE_PANEL_LAYOUT,
  isWorkspacePanelId,
  keepWorkspaceSelection,
  moveWorkspacePanel,
  normalizeWorkspacePanelLayout,
  placeWorkspacePanel,
  WORKSPACE_PANEL_IDS,
} from './workspacePanelLayout'

const GameAnalyticsDashboard = lazy(() =>
  import('./GameAnalyticsDashboard').then((module) => ({
    default: module.GameAnalyticsDashboard,
  })),
)

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
type PanelLayout = Omit<PanelLayoutPreferences, 'rail'> & {
  rail: WorkspacePanelLayoutPreferences
}

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
  management: DEFAULT_MANAGEMENT_PANEL_LAYOUT,
  rail: DEFAULT_WORKSPACE_PANEL_LAYOUT,
}
const PANEL_LAYOUT_STORAGE_PREFIX = 'business-game:panel-layout:v1:'
const TOKEN_APPEARANCE_STORAGE_PREFIX = 'business-game:token-appearance:v1:'
const VISUAL_EFFECTS_STORAGE_PREFIX = 'business-game:visual-effects:v1:'
const DEFAULT_VISUAL_EFFECTS: VisualEffectsPreferenceSettings = {
  intensity: 'full',
}
const DEFAULT_AUTOMATION_SETTINGS: AutomationPreferenceSettings = {
  auto_reject_trades: false,
  auto_roll_dice: false,
  auto_end_turns: false,
}

function readPanelLayout(userId: string): PanelLayout {
  try {
    const raw = localStorage.getItem(`${PANEL_LAYOUT_STORAGE_PREFIX}${userId}`)
    if (!raw) return DEFAULT_PANEL_LAYOUT
    return normalizePanelLayout(
      JSON.parse(raw) as Partial<PanelLayoutPreferences>,
    )
  } catch {
    return DEFAULT_PANEL_LAYOUT
  }
}

function normalizePanelLayout(
  stored: Partial<PanelLayoutPreferences>,
): PanelLayout {
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
  const management = normalizeManagementPanelLayout(stored.management)
  return {
    order,
    zones,
    heights,
    management,
    rail: normalizeWorkspacePanelLayout(stored.rail, {
      order,
      heights,
      management,
    }),
  }
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

function readVisualEffects(userId: string): VisualEffectsPreferenceSettings {
  try {
    const raw = localStorage.getItem(`${VISUAL_EFFECTS_STORAGE_PREFIX}${userId}`)
    return raw
      ? normalizeVisualEffects(JSON.parse(raw) as Partial<VisualEffectsPreferenceSettings>)
      : DEFAULT_VISUAL_EFFECTS
  } catch {
    return DEFAULT_VISUAL_EFFECTS
  }
}

function writeVisualEffects(
  userId: string,
  settings: VisualEffectsPreferenceSettings,
): void {
  try {
    localStorage.setItem(
      `${VISUAL_EFFECTS_STORAGE_PREFIX}${userId}`,
      JSON.stringify(settings),
    )
  } catch {
    // PostgreSQL remains authoritative when browser storage is unavailable.
  }
}

function normalizeVisualEffects(
  value: Partial<VisualEffectsPreferenceSettings> | null | undefined,
): VisualEffectsPreferenceSettings {
  return value?.intensity === 'full' ||
    value?.intensity === 'soft' ||
    value?.intensity === 'off'
    ? { intensity: value.intensity }
    : DEFAULT_VISUAL_EFFECTS
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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(() =>
    readPanelLayout(user.id),
  )
  const [tokenAppearance, setTokenAppearance] =
    useState<TokenAppearanceSettings | null>(() => readTokenAppearance(user.id))
  const tokenAppearanceRef = useRef(tokenAppearance)
  const tokenAppearanceChangeRef = useRef(0)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationPreferenceSettings>(DEFAULT_AUTOMATION_SETTINGS)
  const [automationSettingsReady, setAutomationSettingsReady] = useState(false)
  const automationSettingsRef = useRef(automationSettings)
  const automationSettingsChangeRef = useRef(0)
  const automationAttemptsRef = useRef(new Set<string>())
  const [visualEffects, setVisualEffects] =
    useState<VisualEffectsPreferenceSettings>(() => readVisualEffects(user.id))
  const visualEffectsRef = useRef(visualEffects)
  const visualEffectsChangeRef = useRef(0)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<
    string | null
  >(null)
  const panelLayoutRef = useRef(panelLayout)
  const panelLayoutChangeRef = useRef(0)
  const preferenceSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const audioSettingsChangeRef = useRef(0)
  const restoringAudioSettingsRef = useRef(false)
  const audioSaveTimerRef = useRef<number | null>(null)
  const audioSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [draggedWorkspacePanel, setDraggedWorkspacePanel] =
    useState<WorkspacePanelId | null>(null)
  const [draggedManagementPanel, setDraggedManagementPanel] =
    useState<ManagementPanelId | null>(null)
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
  const motionIntensity: VisualEffectsIntensity = prefersReducedMotion
    ? 'off'
    : visualEffects.intensity
  const [motionSettlement, setMotionSettlement] = useState<MotionSettlement>(
    () => ({
      gameId: game.id,
      sequence: latestMotionSequence(game),
      syncMotionKey: 0,
    }),
  )
  const motionPending =
    motionIntensity !== 'off' &&
    motionSettlement.gameId === game.id &&
    Object.is(motionSettlement.syncMotionKey, motionSyncKey) &&
    latestMotionSequence(game) > motionSettlement.sequence
  const visibleEvents = motionPending
    ? game.events.filter(
        (event) => event.sequence <= motionSettlement.sequence,
      )
    : game.events
  useGameEventAudio(
    game,
    visibleEvents,
    pack,
    user.id,
    connectionState === 'connected',
  )
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
    game.pending_card_draw === null &&
    game.pending_card_choice === null &&
    game.pending_card_choice_result === null &&
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

  const saveAutomationSettingsRemotely = useCallback(
    (settings: AutomationPreferenceSettings) => {
      preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.updateAutomationSettings(settings)
          } catch {
            // The current controls remain usable until a later change retries.
          }
        })
    },
    [],
  )

  const saveVisualEffectsRemotely = useCallback(
    (settings: VisualEffectsPreferenceSettings) => {
      preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.updateVisualEffects(settings)
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
    const automationChangesAtStart = automationSettingsChangeRef.current
    const visualEffectsChangesAtStart = visualEffectsChangeRef.current
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
        if (
          preferences.automation_settings &&
          automationSettingsChangeRef.current === automationChangesAtStart
        ) {
          automationSettingsRef.current = preferences.automation_settings
          setAutomationSettings(preferences.automation_settings)
        } else if (
          automationSettingsChangeRef.current !== automationChangesAtStart
        ) {
          saveAutomationSettingsRemotely(automationSettingsRef.current)
        }
        if (
          preferences.visual_effects &&
          visualEffectsChangeRef.current === visualEffectsChangesAtStart
        ) {
          const restored = normalizeVisualEffects(preferences.visual_effects)
          visualEffectsRef.current = restored
          setVisualEffects(restored)
          writeVisualEffects(user.id, restored)
        } else if (
          visualEffectsChangeRef.current !== visualEffectsChangesAtStart
        ) {
          saveVisualEffectsRemotely(visualEffectsRef.current)
        } else if (!preferences.visual_effects) {
          saveVisualEffectsRemotely(visualEffectsRef.current)
        }
        setAutomationSettingsReady(true)
      })
      .catch(() => {
        // The per-user browser cache keeps customization available offline.
        if (active) setAutomationSettingsReady(true)
      })
    return () => {
      active = false
    }
  }, [
    saveAudioSettingsRemotely,
    saveAutomationSettingsRemotely,
    savePanelLayoutRemotely,
    saveTokenAppearanceRemotely,
    saveVisualEffectsRemotely,
    user.id,
  ])

  const updateAutomationSettings = useCallback(
    (settings: AutomationPreferenceSettings) => {
      automationSettingsRef.current = settings
      automationSettingsChangeRef.current += 1
      setAutomationSettings(settings)
      setAutomationSettingsReady(true)
      saveAutomationSettingsRemotely(settings)
    },
    [saveAutomationSettingsRemotely],
  )

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

  const updateVisualEffects = useCallback(
    (intensity: VisualEffectsIntensity) => {
      const settings = { intensity }
      visualEffectsRef.current = settings
      visualEffectsChangeRef.current += 1
      setVisualEffects(settings)
      writeVisualEffects(user.id, settings)
      saveVisualEffectsRemotely(settings)
    },
    [saveVisualEffectsRemotely, user.id],
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

  const selectWorkspacePanels = useCallback(
    (nextVisible: unknown) => {
      updatePanelLayout((current) => ({
        ...current,
        rail: {
          ...current.rail,
          visible: keepWorkspaceSelection(current.rail.visible, nextVisible),
        },
      }))
    },
    [updatePanelLayout],
  )

  const startWorkspacePanelDrag = useCallback(
    (panelId: WorkspacePanelId, event: DragEvent<HTMLElement>) => {
      event.stopPropagation()
      setDraggedWorkspacePanel(panelId)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-workspace-panel', panelId)
    },
    [],
  )

  const dropWorkspacePanel = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      targetId: WorkspacePanelId | null,
      placement: Exclude<WorkspacePanelPlacement, 'floating'>,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const transferred = event.dataTransfer.getData(
        'application/x-workspace-panel',
      )
      const panelId =
        draggedWorkspacePanel ??
        (isWorkspacePanelId(transferred) ? transferred : null)
      if (
        panelId &&
        (panelId !== targetId ||
          panelLayoutRef.current.rail.placements[panelId] !== placement)
      ) {
        updatePanelLayout((current) => ({
          ...current,
          rail: placeWorkspacePanel(
            current.rail,
            panelId,
            placement,
            targetId,
          ),
        }))
      }
      setDraggedWorkspacePanel(null)
    },
    [draggedWorkspacePanel, updatePanelLayout],
  )

  const placeWorkspacePanelIn = useCallback(
    (panelId: WorkspacePanelId, placement: WorkspacePanelPlacement) => {
      updatePanelLayout((current) => ({
        ...current,
        rail: placeWorkspacePanel(current.rail, panelId, placement),
      }))
    },
    [updatePanelLayout],
  )

  const updateWorkspaceWindowGeometry = useCallback(
    (panelId: WorkspacePanelId, geometry: WorkspacePanelWindowGeometry) => {
      updatePanelLayout((current) => ({
        ...current,
        rail: {
          ...current.rail,
          windows: { ...current.rail.windows, [panelId]: geometry },
        },
      }))
    },
    [updatePanelLayout],
  )

  const bringWorkspaceWindowToFront = useCallback(
    (panelId: WorkspacePanelId) => {
      if (panelLayoutRef.current.rail.order.at(-1) === panelId) return
      updatePanelLayout((current) => ({
        ...current,
        rail: {
          ...current.rail,
          order: moveWorkspacePanel(current.rail.order, panelId, null),
        },
      }))
    },
    [updatePanelLayout],
  )

  const resizeWorkspacePanel = useCallback(
    (panelId: WorkspacePanelId, height: number) => {
      updatePanelLayout((current) => ({
        ...current,
        rail: {
          ...current.rail,
          heights: { ...current.rail.heights, [panelId]: height },
        },
      }))
    },
    [updatePanelLayout],
  )

  const redistributeWorkspacePanelHeights = useCallback(() => {
    updatePanelLayout((current) => ({
      ...current,
      rail: {
        ...current.rail,
        heights: clearWorkspacePanelHeights(
          current.rail.heights,
          current.rail.visible,
        ),
      },
    }))
  }, [updatePanelLayout])

  const selectManagementPanels = useCallback(
    (nextVisible: unknown) => {
      updatePanelLayout((current) => ({
        ...current,
        management: {
          ...current.management,
          visible: keepManagementSelection(
            current.management.visible,
            nextVisible,
          ),
        },
      }))
    },
    [updatePanelLayout],
  )

  const startManagementPanelDrag = useCallback(
    (panelId: ManagementPanelId, event: DragEvent<HTMLElement>) => {
      event.stopPropagation()
      setDraggedManagementPanel(panelId)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-management-panel', panelId)
    },
    [],
  )

  const dropManagementPanel = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      targetId: ManagementPanelId | null,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const transferred = event.dataTransfer.getData(
        'application/x-management-panel',
      )
      const panelId =
        draggedManagementPanel ??
        (isManagementPanelId(transferred) ? transferred : null)
      if (panelId && panelId !== targetId) {
        updatePanelLayout((current) => ({
          ...current,
          management: {
            ...current.management,
            order: moveManagementPanel(
              current.management.order,
              panelId,
              targetId,
            ),
          },
        }))
      }
      setDraggedManagementPanel(null)
    },
    [draggedManagementPanel, updatePanelLayout],
  )

  const resizeManagementPanel = useCallback(
    (panelId: ManagementPanelId, height: number) => {
      updatePanelLayout((current) => ({
        ...current,
        management: {
          ...current.management,
          heights: { ...current.management.heights, [panelId]: height },
        },
      }))
    },
    [updatePanelLayout],
  )

  const redistributeManagementPanelHeights = useCallback(() => {
    updatePanelLayout((current) => ({
      ...current,
      management: {
        ...current.management,
        heights: clearManagementPanelHeights(
          current.management.heights,
          current.management.visible,
        ),
      },
    }))
  }, [updatePanelLayout])

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

  const sendCommand = useCallback(
    async (command: GameCommand): Promise<boolean> => {
      const socket = socketRef.current
      if (!socket?.connected) {
        setBusy(true)
        setError(null)
        try {
          onChange(await api.executeCommand(game.id, command, game.event_sequence))
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
      const commandId = crypto.randomUUID()
      return new Promise<boolean>((resolve) => {
        socket.timeout(8000).emit(
          'game_command',
          {
            game_id: game.id,
            command,
            expected_sequence: game.event_sequence,
            command_id: commandId,
          },
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
    },
    [game.event_sequence, game.id, onChange, onSessionExpired, t],
  )

  useEffect(() => {
    if (!automationSettingsReady || busy) return
    const command = nextAutomationCommand({
      game,
      userId: user.id,
      autoRejectTrades: automationSettings.auto_reject_trades,
      autoRollDice: automationSettings.auto_roll_dice,
      autoEndTurns: automationSettings.auto_end_turns,
      motionPending,
    })
    if (!command) return
    const attemptKey = `${game.id}:${command.action}:${
      command.action === 'reject_trade' ? command.trade_id : ''
    }:${game.event_sequence}`
    if (automationAttemptsRef.current.has(attemptKey)) return
    automationAttemptsRef.current.add(attemptKey)
    void sendCommand(command)
  }, [
    automationSettings,
    automationSettingsReady,
    busy,
    game,
    motionPending,
    sendCommand,
    user.id,
  ])

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
        secondary_color: '#9d8cff',
        fill: 'solid',
        gradient_angle: 135,
        pattern: 'dots',
        shape: 'circle',
        icon: 'number',
        emoji: null,
      },
    [currentUserPlayerIndex, tokenAppearance],
  )
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
              <VisualEffectsControl
                value={visualEffects.intensity}
                systemReducedMotion={prefersReducedMotion}
                onChange={updateVisualEffects}
              />
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
            <Button
              size="small"
              color="secondary"
              startIcon={<AnalyticsRoundedIcon />}
              onClick={() => {
                setAnalyticsOpen(true)
                void run(() => api.getGame(game.id), true)
              }}
            >
              {t('analytics.open')}
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

          {isParticipant && (
            <Stack spacing={0}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={automationSettings.auto_reject_trades}
                    onChange={(event) =>
                      updateAutomationSettings({
                        ...automationSettings,
                        auto_reject_trades: event.target.checked,
                      })
                    }
                  />
                }
                label={t('autoRejectTrades')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={automationSettings.auto_roll_dice}
                    onChange={(event) =>
                      updateAutomationSettings({
                        ...automationSettings,
                        auto_roll_dice: event.target.checked,
                      })
                    }
                  />
                }
                label={t('autoRollDice')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={automationSettings.auto_end_turns}
                    onChange={(event) =>
                      updateAutomationSettings({
                        ...automationSettings,
                        auto_end_turns: event.target.checked,
                      })
                    }
                  />
                }
                label={t('autoEndTurns')}
              />
            </Stack>
          )}

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
      motionIntensity={motionIntensity}
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
      onHoveredPropertyChange={setHighlightedPropertyId}
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

  const bankContent = (
    <BankPanel
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      onCommand={sendCommand}
    />
  )

  const marketContent = (
    <MarketPanel
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      onCommand={sendCommand}
    />
  )

  const debtsContent = (
    <DebtAccountsPanel
      game={game}
      user={user}
      busy={busy}
      onCommand={sendCommand}
    />
  )

  const managementPanelTitle = (panelId: ManagementPanelId) =>
    panelId === 'properties'
      ? t('properties')
      : panelId === 'trades'
        ? t('trades')
        : panelId === 'debts'
          ? t('debts')
          : panelId === 'bank'
            ? t('bank')
            : t('market')

  const managementPanelIcon = (panelId: ManagementPanelId) =>
    panelId === 'properties' ? (
      <HomeWorkRoundedIcon fontSize="small" />
    ) : panelId === 'trades' ? (
      <SwapHorizRoundedIcon fontSize="small" />
    ) : panelId === 'debts' ? (
      <ReceiptLongRoundedIcon fontSize="small" />
    ) : panelId === 'bank' ? (
      <AccountBalanceRoundedIcon fontSize="small" />
    ) : (
      <TrendingUpRoundedIcon fontSize="small" />
    )

  const managementPanelContent = (panelId: ManagementPanelId) =>
    panelId === 'properties'
      ? propertiesContent
      : panelId === 'trades'
        ? tradesContent
        : panelId === 'debts'
          ? debtsContent
          : panelId === 'bank'
            ? bankContent
            : marketContent

  const visibleManagementPanels = panelLayout.management.order.filter((panelId) =>
    panelLayout.management.visible.includes(panelId),
  )
  const hasCustomManagementHeights = visibleManagementPanels.some(
    (panelId) => panelLayout.management.heights[panelId] !== undefined,
  )

  const managementContent = (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0, height: '100%' }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <ToggleButtonGroup
          value={panelLayout.management.visible}
          onChange={(_, nextVisible) => selectManagementPanels(nextVisible)}
          size="small"
          aria-label={t('layout.managementViews')}
          sx={{
            flex: 1,
            minWidth: 0,
            '& .MuiToggleButton-root': { flex: 1 },
            '& .MuiToggleButton-root.Mui-selected': {
              color: 'primary.main',
              bgcolor: 'rgba(184,255,61,.12)',
            },
          }}
        >
          {MANAGEMENT_PANEL_IDS.map((panelId) => {
            const title = managementPanelTitle(panelId)
            return (
              <ToggleButton
                key={panelId}
                value={panelId}
                aria-label={title}
                title={title}
              >
                {managementPanelIcon(panelId)}
              </ToggleButton>
            )
          })}
        </ToggleButtonGroup>
        <Tooltip title={t('layout.redistributeHeights')}>
          <span>
            <IconButton
              size="small"
              disabled={!hasCustomManagementHeights}
              aria-label={t('layout.redistributeHeights')}
              onClick={redistributeManagementPanelHeights}
            >
              <VerticalAlignCenterRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack
        spacing={1}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => dropManagementPanel(event, null)}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {visibleManagementPanels.map((panelId) => {
          const title = managementPanelTitle(panelId)
          return (
            <PersonalizablePanel
              key={panelId}
              id={`management-panel-${panelId}`}
              title={title}
              personalizable={isTablet}
              height={
                isTablet ? panelLayout.management.heights[panelId] : undefined
              }
              fillAvailableHeight={isTablet}
              dragging={draggedManagementPanel === panelId}
              dragLabel={t('layout.dragPanel', { panel: title })}
              resizeLabel={t('layout.resizePanel', { panel: title })}
              onDragStart={(event) => startManagementPanelDrag(panelId, event)}
              onDragEnd={() => setDraggedManagementPanel(null)}
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => dropManagementPanel(event, panelId)}
              onHeightChange={(height) =>
                resizeManagementPanel(panelId, height)
              }
              motionIntensity={motionIntensity}
            >
              {managementPanelContent(panelId)}
            </PersonalizablePanel>
          )
        })}
      </Stack>
    </Stack>
  )

  const criticalAlerts = (
    <>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
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
        >
          <RentDebtResolutionPanel
            game={game}
            pack={pack}
            user={user}
            busy={busy}
            playerName={playerName}
            onCommand={sendCommand}
          />
        </Alert>
      )}
    </>
  )

  const panelTitle = (panelId: PanelId) =>
    panelId === 'room'
      ? t('room')
      : panelId === 'heatmap'
        ? t('heatmap.title')
        : panelId === 'players'
          ? t('playersPanel')
          : panelId === 'management'
            ? t('manage')
            : t('chat.title')

  const workspacePanelTitle = (panelId: WorkspacePanelId) =>
    panelId === 'room'
      ? t('room')
      : panelId === 'heatmap'
        ? t('heatmap.title')
        : panelId === 'players'
          ? t('playersPanel')
          : panelId === 'chat'
            ? t('chat.title')
            : managementPanelTitle(panelId)

  const workspacePanelIcon = (panelId: WorkspacePanelId) =>
    panelId === 'room' ? (
      <MenuRoundedIcon fontSize="small" />
    ) : panelId === 'heatmap' ? (
      <LayersRoundedIcon fontSize="small" />
    ) : panelId === 'players' ? (
      <GroupsRoundedIcon fontSize="small" />
    ) : panelId === 'chat' ? (
      <ForumRoundedIcon fontSize="small" />
    ) : (
      managementPanelIcon(panelId)
    )

  const workspacePanelContent = (panelId: WorkspacePanelId) =>
    panelId === 'room'
      ? roomContent
      : panelId === 'heatmap'
        ? heatmapContent
        : panelId === 'players'
          ? playersContent
          : panelId === 'chat'
            ? (
                <GameChatPanel
                  game={game}
                  user={user}
                  chat={chat}
                  showHeader={false}
                  fillAvailableHeight
                  onSend={sendChatMessage}
                />
              )
            : managementPanelContent(panelId)

  const visibleWorkspacePanels = panelLayout.rail.order.filter((panelId) =>
    panelLayout.rail.visible.includes(panelId),
  )
  const leftWorkspacePanels = visibleWorkspacePanels.filter(
    (panelId) => panelLayout.rail.placements[panelId] === 'left',
  )
  const rightWorkspacePanels = visibleWorkspacePanels.filter(
    (panelId) => panelLayout.rail.placements[panelId] === 'right',
  )
  const floatingWorkspacePanels = visibleWorkspacePanels.filter(
    (panelId) => panelLayout.rail.placements[panelId] === 'floating',
  )
  const dockedWorkspacePanels = [
    ...leftWorkspacePanels,
    ...rightWorkspacePanels,
  ]
  const hasCustomWorkspaceHeights = dockedWorkspacePanels.some(
    (panelId) => panelLayout.rail.heights[panelId] !== undefined,
  )

  const renderDockedWorkspacePanel = (
    panelId: WorkspacePanelId,
    placement: Exclude<WorkspacePanelPlacement, 'floating'>,
  ) => {
    const title = workspacePanelTitle(panelId)
    return (
      <PersonalizablePanel
        key={panelId}
        id={`workspace-panel-${panelId}`}
        title={title}
        personalizable
        height={panelLayout.rail.heights[panelId]}
        fillAvailableHeight
        dragging={draggedWorkspacePanel === panelId}
        dragLabel={t('layout.dragPanel', { panel: title })}
        resizeLabel={t('layout.resizePanel', { panel: title })}
        headerActions={
          <Tooltip title={t('layout.floatPanel', { panel: title })}>
            <IconButton
              size="small"
              aria-label={t('layout.floatPanel', { panel: title })}
              onClick={() => placeWorkspacePanelIn(panelId, 'floating')}
            >
              <OpenInNewRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
        onDragStart={(event) => startWorkspacePanelDrag(panelId, event)}
        onDragEnd={() => setDraggedWorkspacePanel(null)}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => dropWorkspacePanel(event, panelId, placement)}
        onHeightChange={(height) => resizeWorkspacePanel(panelId, height)}
        motionIntensity={motionIntensity}
      >
        {workspacePanelContent(panelId)}
      </PersonalizablePanel>
    )
  }

  const renderFloatingWorkspacePanel = (panelId: WorkspacePanelId) => {
    const title = workspacePanelTitle(panelId)
    const geometry = panelLayout.rail.windows[panelId]
    if (!geometry) return null
    return (
      <FloatingWorkspacePanel
        key={panelId}
        title={title}
        geometry={geometry}
        zIndex={100 + panelLayout.rail.order.indexOf(panelId)}
        moveLabel={t('layout.moveWindow', { panel: title })}
        resizeLabel={t('layout.resizeWindow', { panel: title })}
        dockLeftLabel={t('layout.dockLeft', { panel: title })}
        dockRightLabel={t('layout.dockRight', { panel: title })}
        closeLabel={t('layout.closePanel', { panel: title })}
        closeDisabled={panelLayout.rail.visible.length === 1}
        onActivate={() => bringWorkspaceWindowToFront(panelId)}
        onGeometryChange={(nextGeometry) =>
          updateWorkspaceWindowGeometry(panelId, nextGeometry)
        }
        onDockLeft={() => placeWorkspacePanelIn(panelId, 'left')}
        onDockRight={() => placeWorkspacePanelIn(panelId, 'right')}
        onClose={() =>
          selectWorkspacePanels(
            panelLayout.rail.visible.filter((candidate) => candidate !== panelId),
          )
        }
      >
        {workspacePanelContent(panelId)}
      </FloatingWorkspacePanel>
    )
  }

  const renderMobilePanel = (panelId: PanelId) => {
    const title = panelTitle(panelId)
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
                  fillAvailableHeight={false}
                  onSend={sendChatMessage}
                  />
                )

    return (
      <PersonalizablePanel
        key={panelId}
        id={`mobile-panel-${panelId}`}
        title={title}
        motionIntensity={motionIntensity}
      >
        {content}
      </PersonalizablePanel>
    )
  }

  const leftDockColumn =
    leftWorkspacePanels.length > 0
      ? 'clamp(260px, 24vw, 380px)'
      : draggedWorkspacePanel
        ? '96px'
        : '0px'
  const rightDockColumn =
    rightWorkspacePanels.length > 0
      ? 'clamp(260px, 24vw, 380px)'
      : draggedWorkspacePanel
        ? '96px'
        : '0px'

  const renderWorkspaceDock = (
    placement: Exclude<WorkspacePanelPlacement, 'floating'>,
    panelIds: WorkspacePanelId[],
  ) => (
    <Stack
      gridArea={placement}
      spacing={1}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => dropWorkspacePanel(event, null, placement)}
      sx={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
        p: panelIds.length > 0 || draggedWorkspacePanel ? 1 : 0,
        borderRight:
          placement === 'left' && (panelIds.length > 0 || draggedWorkspacePanel)
            ? '1px solid rgba(255,255,255,.08)'
            : undefined,
        borderLeft:
          placement === 'right' && (panelIds.length > 0 || draggedWorkspacePanel)
            ? '1px solid rgba(255,255,255,.08)'
            : undefined,
        bgcolor:
          panelIds.length === 0 && draggedWorkspacePanel
            ? 'rgba(184,255,61,.06)'
            : undefined,
        transition: 'background-color 120ms ease',
      }}
    >
      {panelIds.length === 0 && draggedWorkspacePanel && (
        <Typography
          variant="caption"
          color="primary.main"
          textAlign="center"
          sx={{ m: 'auto', writingMode: 'vertical-rl' }}
        >
          {placement === 'left'
            ? t('layout.dropLeft')
            : t('layout.dropRight')}
        </Typography>
      )}
      {panelIds.map((panelId) =>
        renderDockedWorkspacePanel(panelId, placement),
      )}
    </Stack>
  )

  return (
    <Box
      data-testid="game-workspace"
      data-motion-intensity={motionIntensity}
      sx={{
        width: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        position: 'relative',
        '& .MuiButton-root, & .MuiIconButton-root, & .MuiToggleButton-root': {
          transition:
            motionIntensity === 'off'
              ? 'none'
              : `transform ${motionIntensity === 'soft' ? 90 : 130}ms ease, box-shadow ${motionIntensity === 'soft' ? 90 : 130}ms ease, background-color 140ms ease`,
        },
        '& .MuiButton-root:active:not(:disabled), & .MuiIconButton-root:active:not(:disabled), & .MuiToggleButton-root:active:not(:disabled)': {
          transform: motionIntensity === 'off' ? 'none' : 'translateY(1px) scale(.98)',
        },
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
            md: `${leftDockColumn} minmax(0, 1fr) ${rightDockColumn} 56px`,
          },
          gridTemplateAreas: {
            xs: '"board"',
            md: '"left board right rail"',
          },
          gap: 0,
          alignItems: 'stretch',
        }}
      >
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
              actionEvents={visibleEvents}
              motionIntensity={motionIntensity}
              highlightedTileId={highlightedPropertyId}
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
                  motionIntensity={motionIntensity}
                />
              }
            />
          </Box>
        </Stack>

        {isTablet && (
          <>
            {renderWorkspaceDock('left', leftWorkspacePanels)}
            {renderWorkspaceDock('right', rightWorkspacePanels)}
            <Stack
              gridArea="rail"
              alignItems="center"
              sx={{
                height: '100%',
                minHeight: 0,
                py: 1,
                px: 0.5,
                borderLeft: '1px solid rgba(255,255,255,.1)',
                bgcolor: 'rgba(10,8,18,.96)',
                position: 'relative',
                zIndex: 500,
              }}
            >
              <ToggleButtonGroup
                orientation="vertical"
                value={panelLayout.rail.visible}
                onChange={(_, nextVisible) =>
                  selectWorkspacePanels(nextVisible)
                }
                size="small"
                aria-label={t('layout.workspaceViews')}
                sx={{
                  width: '100%',
                  '& .MuiToggleButton-root': {
                    width: '100%',
                    minWidth: 0,
                    minHeight: 42,
                    px: 0.5,
                  },
                  '& .MuiToggleButton-root.Mui-selected': {
                    color: 'primary.main',
                    bgcolor: 'rgba(184,255,61,.14)',
                  },
                }}
              >
                {WORKSPACE_PANEL_IDS.map((panelId) => {
                  const title = workspacePanelTitle(panelId)
                  return (
                    <ToggleButton
                      key={panelId}
                      value={panelId}
                      aria-label={title}
                      title={title}
                    >
                      {workspacePanelIcon(panelId)}
                    </ToggleButton>
                  )
                })}
              </ToggleButtonGroup>
              <Box sx={{ flex: 1 }} />
              <Tooltip title={t('layout.redistributeHeights')} placement="left">
                <span>
                  <IconButton
                    size="small"
                    disabled={!hasCustomWorkspaceHeights}
                    aria-label={t('layout.redistributeHeights')}
                    onClick={redistributeWorkspacePanelHeights}
                  >
                    <VerticalAlignCenterRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </>
        )}
      </Box>

      {isTablet && floatingWorkspacePanels.map(renderFloatingWorkspacePanel)}

      {analyticsOpen && (
        <Suspense fallback={null}>
          <GameAnalyticsDashboard
            open
            game={game}
            pack={pack}
            onClose={() => setAnalyticsOpen(false)}
          />
        </Suspense>
      )}

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
            transitionDuration={
              motionIntensity === 'off'
                ? 0
                : motionIntensity === 'soft'
                  ? 140
                  : 240
            }
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
                renderMobilePanel('room')}
              {mobilePanel === 'players' &&
                renderMobilePanel('players')}
              {mobilePanel === 'manage' &&
                renderMobilePanel('management')}
              {mobilePanel === 'heatmap' &&
                renderMobilePanel('heatmap')}
              {mobilePanel === 'chat' &&
                renderMobilePanel('chat')}
            </Box>
          </Drawer>
        </>
      )}

      <GameVisualEffects
        game={game}
        events={visibleEvents}
        pack={pack}
        intensity={motionIntensity}
        synchronized={connectionState === 'connected'}
      />

      {!motionPending && !game.pending_card_choice_result && (
        <GameCardDrawDialog
          game={game}
          pack={pack}
          user={user}
          busy={busy}
          error={error}
          onCommand={sendCommand}
          motionIntensity={motionIntensity}
        />
      )}

      <GameCardChoiceDialog
        game={game}
        pack={pack}
        user={user}
        busy={busy}
        error={error}
        onCommand={sendCommand}
        motionIntensity={motionIntensity}
        visible={
          !motionPending &&
          (!game.pending_card_draw || game.pending_card_choice_result !== null)
        }
      />

      {!motionPending &&
        !game.pending_card_draw &&
        !game.pending_card_choice &&
        !game.pending_card_choice_result && (
        <GameAuctionDialog
          game={game}
          pack={pack}
          user={user}
          busy={busy}
          error={error}
          onCommand={sendCommand}
          onCountdownWarning={handleAuctionCountdown}
          motionIntensity={motionIntensity}
        />
      )}

      <GameFinishedDialog
        open={gameResultOpen}
        game={game}
        currentUserId={user.id}
        busy={busy}
        onClose={() => setGameResultOpen(false)}
        onExit={() => void leaveGame()}
        motionIntensity={motionIntensity}
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
