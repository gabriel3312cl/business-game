import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded'
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded'
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'
import FastForwardRoundedIcon from '@mui/icons-material/FastForwardRounded'
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
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import VerticalAlignCenterRoundedIcon from '@mui/icons-material/VerticalAlignCenterRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import {
  Alert,
  Badge,
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
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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
import { createCommandId } from '../commandId'
import { mergeGameState } from '../gameState'
import type {
  AutomationPreferenceSettings,
  BoardHistoricalStats,
  BotController,
  BotPersonality,
  ContentPack,
  GameCommand,
  GameState,
  GameViewPreferenceSettings,
  AudioPreferenceSettings,
  ManagementPanelId,
  PanelId,
  PanelLayoutPreferences,
  PlayerSortOption,
  TokenAppearanceSettings,
  User,
  VisualEffectsIntensity,
  VisualEffectsPreferenceSettings,
  WorkspacePanelId,
  WorkspacePanelLayoutPreferences,
  WorkspacePanelPlacement,
  WorkspacePanelWindowGeometry,
  MobileWorkspacePanel,
} from '../types'
import { nextAutomationCommand } from '../gameAutomation'
import { shouldBufferParticipantPresentation } from './botPresentation'
import { BotManagementPanel } from './BotManagementPanel'
import { BankPanel } from './BankPanel'
import { GameActionCenter } from './GameActionCenter'
import { GameAuctionDialog } from './GameAuctionDialog'
import { GameBoard } from './GameBoard'
import { GameCardChoiceDialog } from './GameCardChoiceDialog'
import { GameCardDrawDialog } from './GameCardDrawDialog'
import { GameFinishedDialog } from './GameFinishedDialog'
import { GameVisualEffects } from './GameVisualEffects'
import {
  BoardHeatmapControls,
  type BoardHeatmapSource,
} from './BoardHeatmapControls'
import { DebtAccountsPanel } from './DebtAccountsPanel'
import {
  buildBoardHistoricalHeatmap,
  buildHistoryHeatmap,
  buildProbabilityHeatmap,
  type BoardHeatmapMode,
} from './boardHeatmap'
import {
  latestMotionSequence,
  type MotionAudioCue,
  type MotionSettlement,
} from './gameMotion'
import { presentedGameSnapshot } from './gamePresentation'
import {
  DEFAULT_GAME_VIEW_PREFERENCES,
  normalizeGameViewPreferences,
} from './gameViewPreferences'
import { GamePlayersPanel } from './GamePlayersPanel'
import { FloatingWorkspacePanel } from './FloatingWorkspacePanel'
import { automaticPlayerAppearance } from './playerAppearance'
import { shouldShowPlayerModal } from './playerModalVisibility'
import { GameTradePanel, type TradeDraft } from './GameTradePanel'
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
} from './workspacePanelLayout'
import {
  countWorkspaceEventNotifications,
  EMPTY_WORKSPACE_NOTIFICATION_COUNTS,
  type WorkspaceNotificationCounts,
  type WorkspaceNotificationPanel,
} from './workspaceNotifications'

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

type MobilePanel = MobileWorkspacePanel
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
const PLAYER_SORT_STORAGE_PREFIX = 'business-game:player-sort:v1:'
const GAME_VIEW_STORAGE_PREFIX = 'business-game:game-view:v1:'
const WORKSPACE_PANEL_GROUPS = [
  { id: 'status', panelIds: ['room', 'players', 'chat'] },
  {
    id: 'management',
    panelIds: ['properties', 'trades', 'debts', 'bank', 'market'],
  },
  { id: 'analysis', panelIds: ['heatmap'] },
] satisfies Array<{
  id: 'status' | 'management' | 'analysis'
  panelIds: WorkspacePanelId[]
}>
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

function readPlayerSort(userId: string): PlayerSortOption {
  try {
    const stored = localStorage.getItem(`${PLAYER_SORT_STORAGE_PREFIX}${userId}`)
    return isPlayerSortOption(stored) ? stored : 'turnOrder'
  } catch {
    return 'turnOrder'
  }
}

function writePlayerSort(userId: string, sortOption: PlayerSortOption): void {
  try {
    localStorage.setItem(`${PLAYER_SORT_STORAGE_PREFIX}${userId}`, sortOption)
  } catch {
    // PostgreSQL remains authoritative when browser storage is unavailable.
  }
}

function isPlayerSortOption(value: unknown): value is PlayerSortOption {
  return (
    value === 'turnOrder' ||
    value === 'netWorth' ||
    value === 'cash' ||
    value === 'name'
  )
}

function readGameView(userId: string): GameViewPreferenceSettings {
  try {
    const raw = localStorage.getItem(`${GAME_VIEW_STORAGE_PREFIX}${userId}`)
    return raw
      ? normalizeGameViewPreferences(
          JSON.parse(raw) as Partial<GameViewPreferenceSettings>,
        )
      : DEFAULT_GAME_VIEW_PREFERENCES
  } catch {
    return DEFAULT_GAME_VIEW_PREFERENCES
  }
}

function writeGameView(
  userId: string,
  preferences: GameViewPreferenceSettings,
): void {
  try {
    localStorage.setItem(
      `${GAME_VIEW_STORAGE_PREFIX}${userId}`,
      JSON.stringify(preferences),
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
  const isWideWorkspace = useMediaQuery(theme.breakpoints.up('lg'))
  const socketRef = useRef<Socket | null>(null)
  const refreshingSocketRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const debtAlertRef = useRef<HTMLDivElement | null>(null)
  const debtAlertDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startLeft: number
    startTop: number
    width: number
    height: number
  } | null>(null)
  const [debtAlertPosition, setDebtAlertPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const [confirmResignation, setConfirmResignation] = useState(false)
  const [gameResultOpen, setGameResultOpen] = useState(
    game.status === 'finished',
  )
  const [gameView, setGameView] = useState<GameViewPreferenceSettings>(() =>
    readGameView(user.id),
  )
  const gameViewRef = useRef(gameView)
  const gameViewChangeRef = useRef(0)
  const latestAuthoritativeGameRef = useRef(game)
  const bufferedPresentationGameRef = useRef<GameState | null>(null)
  const presentationOmissionActiveRef = useRef(false)
  const suppressNextOwnPresentationRef = useRef(false)
  const [presentationOmissionActive, setPresentationOmissionActive] =
    useState(false)
  const [presentationSettingsOpen, setPresentationSettingsOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(gameView.mobile_panel)
  const [mobileManagementPanel, setMobileManagementPanel] =
    useState<ManagementPanelId>(gameView.mobile_management_panel)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(() =>
    readPanelLayout(user.id),
  )
  const [tabletWorkspacePanel, setTabletWorkspacePanel] =
    useState<WorkspacePanelId>(gameView.tablet_workspace_panel)
  const [layoutEditing, setLayoutEditing] = useState(false)
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
  const [playerSort, setPlayerSort] = useState<PlayerSortOption>(() =>
    readPlayerSort(user.id),
  )
  const playerSortRef = useRef(playerSort)
  const playerSortChangeRef = useRef(0)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(gameView.analytics_open)
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<
    string | null
  >(null)
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(
    null,
  )
  const [tradeDraft, setTradeDraft] = useState<TradeDraft | null>(null)
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
  const [workspaceNotificationCounts, setWorkspaceNotificationCounts] =
    useState<WorkspaceNotificationCounts>(() => ({
      ...EMPTY_WORKSPACE_NOTIFICATION_COUNTS,
    }))
  const workspaceNotificationCursorRef = useRef({
    gameId: game.id,
    sequence: game.event_sequence,
  })
  const workspaceChatNotificationCursorRef = useRef({
    gameId: game.id,
    messageId: 0,
  })
  const bufferedPresentationChatMessagesRef = useRef<ChatMessage[]>([])
  const clampDebtAlertPosition = useCallback(
    (x: number, y: number, width: number, height: number) => ({
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    }),
    [],
  )
  const startDebtAlertDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isTablet || !debtAlertRef.current) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = debtAlertRef.current.getBoundingClientRect()
      event.currentTarget.setPointerCapture(event.pointerId)
      debtAlertDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: bounds.left,
        startTop: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }
      setDebtAlertPosition({ x: bounds.left, y: bounds.top })
    },
    [isTablet],
  )
  const moveDebtAlert = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = debtAlertDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      setDebtAlertPosition(
        clampDebtAlertPosition(
          drag.startLeft + event.clientX - drag.startX,
          drag.startTop + event.clientY - drag.startY,
          drag.width,
          drag.height,
        ),
      )
    },
    [clampDebtAlertPosition],
  )
  const finishDebtAlertDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = debtAlertDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      debtAlertDragRef.current = null
    },
    [],
  )
  const moveDebtAlertWithKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!isTablet || !debtAlertRef.current) return
      const delta = event.shiftKey ? 64 : 24
      const horizontal =
        event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0
      const vertical =
        event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0
      if (horizontal === 0 && vertical === 0) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = debtAlertRef.current.getBoundingClientRect()
      setDebtAlertPosition(
        clampDebtAlertPosition(
          bounds.left + horizontal,
          bounds.top + vertical,
          bounds.width,
          bounds.height,
        ),
      )
    },
    [clampDebtAlertPosition, isTablet],
  )
  useEffect(() => {
    if (!layoutEditing) {
      setDraggedWorkspacePanel(null)
      setDraggedManagementPanel(null)
    }
  }, [layoutEditing])
  useEffect(() => {
    setDebtAlertPosition(null)
    debtAlertDragRef.current = null
  }, [game.active_debt?.debtor_id, game.active_debt?.tile_id, game.id])
  const chat = useGameChat(game.id)
  const receiveChatMessage = chat.receive
  const flushBufferedPresentationChatMessages = useCallback(() => {
    const messages = bufferedPresentationChatMessagesRef.current
    if (messages.length === 0) return
    bufferedPresentationChatMessagesRef.current = []
    let notificationCount = 0
    const cursor = workspaceChatNotificationCursorRef.current
    for (const message of messages) {
      receiveChatMessage(message)
      if (cursor.gameId !== message.game_id) {
        cursor.gameId = message.game_id
        cursor.messageId = 0
      }
      if (message.id <= cursor.messageId) continue
      cursor.messageId = message.id
      notificationCount += 1
    }
    if (notificationCount > 0) {
      setWorkspaceNotificationCounts((current) => ({
        ...current,
        chat: current.chat + notificationCount,
      }))
    }
  }, [receiveChatMessage])
  const receiveChatMessageWithAudio = useCallback(
    (message: ChatMessage) => {
      const author = latestAuthoritativeGameRef.current.players.find(
        (player) => player.user_id === message.author_id,
      )
      const authorPresentationOmitted = author?.is_bot
        ? gameViewRef.current.omit_bot_presentations
        : author?.user_id !== user.id &&
          gameViewRef.current.omit_other_human_presentations
      if (presentationOmissionActiveRef.current && authorPresentationOmitted) {
        bufferedPresentationChatMessagesRef.current.push(message)
        return
      }
      receiveChatMessage(message)
      if (message.author_id === user.id) return
      const cursor = workspaceChatNotificationCursorRef.current
      if (cursor.gameId !== message.game_id) {
        cursor.gameId = message.game_id
        cursor.messageId = 0
      }
      if (message.id <= cursor.messageId) return
      cursor.messageId = message.id
      setWorkspaceNotificationCounts((current) => ({
        ...current,
        chat: current.chat + 1,
      }))
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
  useEffect(() => {
    const openPanels = new Set<WorkspaceNotificationPanel>()
    if (isWideWorkspace) {
      for (const panelId of panelLayout.rail.visible) {
        if (panelId === 'trades' || panelId === 'debts' || panelId === 'chat') {
          openPanels.add(panelId)
        }
      }
    } else if (isTablet) {
      if (
        tabletWorkspacePanel === 'trades' ||
        tabletWorkspacePanel === 'debts' ||
        tabletWorkspacePanel === 'chat'
      ) {
        openPanels.add(tabletWorkspacePanel)
      }
    } else if (mobilePanel === 'chat') {
      openPanels.add('chat')
    } else if (
      mobilePanel === 'manage' &&
      (mobileManagementPanel === 'trades' || mobileManagementPanel === 'debts')
    ) {
      openPanels.add(mobileManagementPanel)
    }
    if (openPanels.size === 0) return
    setWorkspaceNotificationCounts((current) => {
      if ([...openPanels].every((panelId) => current[panelId] === 0)) {
        return current
      }
      const next = { ...current }
      for (const panelId of openPanels) next[panelId] = 0
      return next
    })
  }, [
    chat.messages.length,
    game.event_sequence,
    isTablet,
    isWideWorkspace,
    mobileManagementPanel,
    mobilePanel,
    panelLayout.rail.visible,
    tabletWorkspacePanel,
    workspaceNotificationCounts.chat,
    workspaceNotificationCounts.debts,
    workspaceNotificationCounts.trades,
  ])
  const [heatmapMode, setHeatmapMode] = useState<BoardHeatmapMode>('off')
  const [heatmapSource, setHeatmapSource] = useState<BoardHeatmapSource>('current')
  const [heatmapPlayerId, setHeatmapPlayerId] = useState<string | null>(null)
  const [boardHistory, setBoardHistory] = useState<BoardHistoricalStats | null>(null)
  const [boardHistoryLoading, setBoardHistoryLoading] = useState(true)
  const [heatmapRange, setHeatmapRange] = useState<{
    gameId: string
    from: number
    to: number | null
  }>(() => ({ gameId: game.id, from: 1, to: null }))
  const [motionSyncKey, setMotionSyncKey] = useState(0)
  const [suppressedPresentation, setSuppressedPresentation] = useState<{
    gameId: string
    sequence: number
  } | null>(null)
  const flushBufferedPresentation = useCallback(() => {
    const buffered = bufferedPresentationGameRef.current
    if (!buffered) return
    bufferedPresentationGameRef.current = null
    latestAuthoritativeGameRef.current = buffered
    presentationOmissionActiveRef.current = false
    setPresentationOmissionActive(false)
    setSuppressedPresentation({
      gameId: buffered.id,
      sequence: buffered.event_sequence,
    })
    setMotionSyncKey((value) => value + 1)
    flushBufferedPresentationChatMessages()
    onChange(buffered)
  }, [flushBufferedPresentationChatMessages, onChange])
  const applyIncomingGameState = useCallback(
    (nextGame: GameState, suppressTransition = false) => {
      const merged = mergeGameState(
        latestAuthoritativeGameRef.current,
        nextGame,
      )
      latestAuthoritativeGameRef.current = merged
      const suppressOwnPresentation =
        suppressTransition || suppressNextOwnPresentationRef.current
      suppressNextOwnPresentationRef.current = false
      if (
        shouldBufferParticipantPresentation(merged, user.id, {
          bots: gameViewRef.current.omit_bot_presentations,
          otherHumans: gameViewRef.current.omit_other_human_presentations,
        })
      ) {
        const startsPresentation = bufferedPresentationGameRef.current === null
        bufferedPresentationGameRef.current = merged
        presentationOmissionActiveRef.current = true
        setPresentationOmissionActive(true)
        if (startsPresentation) {
          setMotionSyncKey((value) => value + 1)
        }
        return
      }
      const skippedPresentation = bufferedPresentationGameRef.current !== null
      bufferedPresentationGameRef.current = null
      presentationOmissionActiveRef.current = false
      setPresentationOmissionActive(false)
      if (skippedPresentation || suppressOwnPresentation) {
        setSuppressedPresentation({
          gameId: merged.id,
          sequence: merged.event_sequence,
        })
        setMotionSyncKey((value) => value + 1)
      }
      if (skippedPresentation) {
        flushBufferedPresentationChatMessages()
      }
      onChange(merged)
    },
    [flushBufferedPresentationChatMessages, onChange, user.id],
  )
  useEffect(() => {
    if (latestAuthoritativeGameRef.current.id !== game.id) {
      latestAuthoritativeGameRef.current = game
      bufferedPresentationGameRef.current = null
      bufferedPresentationChatMessagesRef.current = []
      presentationOmissionActiveRef.current = false
      setPresentationOmissionActive(false)
      return
    }
    if (bufferedPresentationGameRef.current === null) {
      latestAuthoritativeGameRef.current = mergeGameState(
        latestAuthoritativeGameRef.current,
        game,
      )
    }
  }, [game])
  useEffect(() => {
    let active = true
    setBoardHistory(null)
    setBoardHistoryLoading(true)
    void api
      .getBoardHistory(game.id)
      .then((history) => {
        if (active) setBoardHistory(history)
      })
      .catch(() => {
        if (active) setBoardHistory(null)
      })
      .finally(() => {
        if (active) setBoardHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [game.id])
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  )
  const motionIntensity: VisualEffectsIntensity = prefersReducedMotion
    ? 'off'
    : visualEffects.intensity
  const [motionSettlement, setMotionSettlement] = useState<MotionSettlement>(
    () => ({
      gameId: game.id,
      sequence: game.event_sequence,
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
  const presentedGameRef = useRef(game)
  const presentedGame = presentedGameSnapshot(
    presentedGameRef.current,
    game,
    motionPending,
  )
  presentedGameRef.current = presentedGame
  const presentationBusy = busy || motionPending || presentationOmissionActive
  const presentationMotionIntensity =
    suppressedPresentation?.gameId === game.id &&
    suppressedPresentation.sequence === game.event_sequence
      ? 'off'
      : motionIntensity
  const allParticipantPresentationsOmitted =
    gameView.omit_bot_presentations &&
    gameView.omit_other_human_presentations &&
    gameView.omit_own_presentations
  const anyParticipantPresentationOmitted =
    gameView.omit_bot_presentations ||
    gameView.omit_other_human_presentations ||
    gameView.omit_own_presentations
  useEffect(() => {
    const cursor = workspaceNotificationCursorRef.current
    if (cursor.gameId !== game.id) {
      workspaceNotificationCursorRef.current = {
        gameId: game.id,
        sequence: game.event_sequence,
      }
      workspaceChatNotificationCursorRef.current = {
        gameId: game.id,
        messageId: 0,
      }
      setWorkspaceNotificationCounts({
        ...EMPTY_WORKSPACE_NOTIFICATION_COUNTS,
      })
      return
    }
    const incoming = countWorkspaceEventNotifications(
      visibleEvents,
      cursor.sequence,
      user.id,
    )
    const visibleSequence = visibleEvents.reduce(
      (latest, event) => Math.max(latest, event.sequence),
      cursor.sequence,
    )
    cursor.sequence = visibleSequence
    if (incoming.trades === 0 && incoming.debts === 0) return
    setWorkspaceNotificationCounts((current) => ({
      ...current,
      trades: current.trades + incoming.trades,
      debts: current.debts + incoming.debts,
    }))
  }, [game.event_sequence, game.id, user.id, visibleEvents])
  useGameEventAudio(
    game,
    visibleEvents,
    pack,
    user.id,
    connectionState === 'connected',
    motionSyncKey,
  )
  const maximumHeatmapSequence =
    visibleEvents[visibleEvents.length - 1]?.sequence ?? 1
  const selectedHeatmapPlayerId = presentedGame.players.some(
    (player) => player.user_id === heatmapPlayerId,
  )
    ? heatmapPlayerId
    : null
  const currentPlayer =
    presentedGame.players[presentedGame.current_player_index]
  const showCardDrawModal = shouldShowPlayerModal(
    gameView.show_other_player_modals,
    user.id,
    [presentedGame.pending_card_draw?.player_id],
  )
  const showCardChoiceModal = shouldShowPlayerModal(
    gameView.show_other_player_modals,
    user.id,
    [
      presentedGame.pending_card_choice?.player_id,
      presentedGame.pending_card_choice_result?.player_id,
    ],
  )
  const activeAuctionPlayerIds = presentedGame.active_auction
    ? presentedGame.active_auction.eligible_player_ids.filter(
        (playerId) =>
          !presentedGame.active_auction?.passed_player_ids.includes(playerId),
      )
    : []
  const showAuctionModal = shouldShowPlayerModal(
    gameView.show_other_player_modals,
    user.id,
    [presentedGame.pending_auction_selector_id, ...activeAuctionPlayerIds],
  )
  const probabilityHeatmapAvailable =
    presentedGame.status === 'playing' &&
    presentedGame.phase === 'waiting_for_roll' &&
    presentedGame.pending_auction_selector_id === null &&
    presentedGame.active_auction === null &&
    presentedGame.active_debt === null &&
    presentedGame.pending_card_draw === null &&
    presentedGame.pending_card_choice === null &&
    presentedGame.pending_card_choice_result === null &&
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
      if (heatmapSource === 'historical' && boardHistory) {
        return buildBoardHistoricalHeatmap(
          boardHistory,
          pack.manifest.tile_count,
        )
      }
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
      return buildProbabilityHeatmap(presentedGame, pack, currentPlayer)
    }
    return null
  }, [
    boardHistory,
    currentPlayer,
    heatmapMode,
    heatmapSource,
    pack,
    probabilityHeatmapAvailable,
    presentedGame,
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
    if (!motionPending && presentedGame.status === 'finished') {
      setGameResultOpen(true)
    }
  }, [motionPending, presentedGame.id, presentedGame.status])

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

  const savePlayerSortRemotely = useCallback((sortOption: PlayerSortOption) => {
    preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.updatePlayerSort(sortOption)
        } catch {
          // The per-user browser cache remains available until a later change retries.
        }
      })
  }, [])

  const saveGameViewRemotely = useCallback(
    (preferences: GameViewPreferenceSettings) => {
      preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await api.updateGameView(preferences)
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
    const playerSortChangesAtStart = playerSortChangeRef.current
    const gameViewChangesAtStart = gameViewChangeRef.current
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
        if (
          preferences.player_sort &&
          playerSortChangeRef.current === playerSortChangesAtStart
        ) {
          playerSortRef.current = preferences.player_sort
          setPlayerSort(preferences.player_sort)
          writePlayerSort(user.id, preferences.player_sort)
        } else if (
          playerSortChangeRef.current !== playerSortChangesAtStart ||
          !preferences.player_sort
        ) {
          savePlayerSortRemotely(playerSortRef.current)
        }
        if (
          preferences.game_view &&
          gameViewChangeRef.current === gameViewChangesAtStart
        ) {
          const restored = normalizeGameViewPreferences(preferences.game_view)
          gameViewRef.current = restored
          setGameView(restored)
          setMobilePanel(restored.mobile_panel)
          setMobileManagementPanel(restored.mobile_management_panel)
          setTabletWorkspacePanel(restored.tablet_workspace_panel)
          setAnalyticsOpen(restored.analytics_open)
          writeGameView(user.id, restored)
        } else if (
          gameViewChangeRef.current !== gameViewChangesAtStart ||
          !preferences.game_view
        ) {
          saveGameViewRemotely(gameViewRef.current)
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
    savePlayerSortRemotely,
    saveGameViewRemotely,
    saveTokenAppearanceRemotely,
    saveVisualEffectsRemotely,
    user.id,
  ])

  const updateGameView = useCallback(
    (update: Partial<GameViewPreferenceSettings>) => {
      const next = normalizeGameViewPreferences({
        ...gameViewRef.current,
        ...update,
      })
      gameViewRef.current = next
      gameViewChangeRef.current += 1
      setGameView(next)
      if ('mobile_panel' in update) setMobilePanel(next.mobile_panel)
      if ('mobile_management_panel' in update) {
        setMobileManagementPanel(next.mobile_management_panel)
      }
      if ('tablet_workspace_panel' in update) {
        setTabletWorkspacePanel(next.tablet_workspace_panel)
      }
      if ('analytics_open' in update) setAnalyticsOpen(next.analytics_open)
      const presentationScopeChanged =
        'omit_bot_presentations' in update ||
        'omit_other_human_presentations' in update
      const buffered = bufferedPresentationGameRef.current
      if (
        presentationScopeChanged &&
        buffered &&
        !shouldBufferParticipantPresentation(buffered, user.id, {
          bots: next.omit_bot_presentations,
          otherHumans: next.omit_other_human_presentations,
        })
      ) {
        flushBufferedPresentation()
      }
      writeGameView(user.id, next)
      saveGameViewRemotely(next)
    },
    [flushBufferedPresentation, saveGameViewRemotely, user.id],
  )

  const selectMobilePanel = useCallback(
    (panel: MobilePanel) => updateGameView({ mobile_panel: panel }),
    [updateGameView],
  )
  const selectMobileManagementPanel = useCallback(
    (panel: ManagementPanelId) =>
      updateGameView({ mobile_management_panel: panel }),
    [updateGameView],
  )
  const selectTabletWorkspacePanel = useCallback(
    (panel: WorkspacePanelId) =>
      updateGameView({ tablet_workspace_panel: panel }),
    [updateGameView],
  )

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

  const updatePlayerSort = useCallback(
    (sortOption: PlayerSortOption) => {
      playerSortRef.current = sortOption
      playerSortChangeRef.current += 1
      setPlayerSort(sortOption)
      writePlayerSort(user.id, sortOption)
      savePlayerSortRemotely(sortOption)
    },
    [savePlayerSortRemotely, user.id],
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

  const toggleWorkspacePanel = useCallback(
    (panelId: WorkspacePanelId) => {
      if (!isWideWorkspace) {
        selectTabletWorkspacePanel(panelId)
        return
      }
      updatePanelLayout((current) => {
        const isVisible = current.rail.visible.includes(panelId)
        const visible = isVisible
          ? current.rail.visible.length > 1
            ? current.rail.visible.filter((candidate) => candidate !== panelId)
            : current.rail.visible
          : [...current.rail.visible, panelId]
        return {
          ...current,
          rail: { ...current.rail, visible },
        }
      })
    },
    [isWideWorkspace, selectTabletWorkspacePanel, updatePanelLayout],
  )

  const toggleWorkspaceRail = useCallback(() => {
    updatePanelLayout((current) => ({
      ...current,
      rail: {
        ...current.rail,
        compact: !current.rail.compact,
      },
    }))
  }, [updatePanelLayout])

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
      event: DragEvent<HTMLElement>,
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
      applyIncomingGameState(nextGame)
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
  }, [
    applyIncomingGameState,
    game.id,
    onSessionExpired,
    receiveChatMessageWithAudio,
    t,
  ])

  const playerName = (playerId: string | null) =>
    presentedGame.players.find((player) => player.user_id === playerId)
      ?.display_name ??
    t('bank')

  const run = async (
    operation: () => Promise<GameState>,
    snapToSnapshot = false,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const nextGame = await operation()
      applyIncomingGameState(nextGame)
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

  const openAnalytics = () => {
    updateGameView({ mobile_panel: null, analytics_open: true })
    void run(() => api.getGame(game.id), true)
  }

  const sendCommand = useCallback(
    async (command: GameCommand): Promise<boolean> => {
      const socket = socketRef.current
      if (!socket?.connected) {
        setBusy(true)
        setError(null)
        try {
          applyIncomingGameState(
            await api.executeCommand(game.id, command, game.event_sequence),
            gameViewRef.current.omit_own_presentations,
          )
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
      const commandId = createCommandId()
      suppressNextOwnPresentationRef.current =
        gameViewRef.current.omit_own_presentations
      setBusy(true)
      setError(null)
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
              suppressNextOwnPresentationRef.current = false
              gameAudio.play('action-rejected', { gain: 0.72 })
              setError(t('realtimeError'))
              setConnectionState('reconnecting')
              setBusy(false)
              resolve(false)
              return
            }
            if (!ack) {
              suppressNextOwnPresentationRef.current = false
              gameAudio.play('action-rejected', { gain: 0.72 })
              setError(t('commandRejected'))
              setBusy(false)
              resolve(false)
              return
            }
            if (!ack.ok) {
              suppressNextOwnPresentationRef.current = false
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
    [
      applyIncomingGameState,
      game.event_sequence,
      game.id,
      onSessionExpired,
      t,
    ],
  )

  useEffect(() => {
    if (!automationSettingsReady || busy || presentationOmissionActive) return
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
    presentationOmissionActive,
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

  const isParticipant = presentedGame.players.some(
    (player) => player.user_id === user.id,
  )
  const isSpectator = presentedGame.spectators.some(
    (spectator) => spectator.user_id === user.id,
  )
  const isHost = presentedGame.host_user_id === user.id
  const currentUserPlayerIndex = presentedGame.players.findIndex(
    (player) => player.user_id === user.id,
  )
  const currentUserPlayer = presentedGame.players[currentUserPlayerIndex]
  const tokenDialogValue = useMemo<TokenAppearanceSettings>(
    () =>
      tokenAppearance ??
      automaticPlayerAppearance(
        currentUserPlayer ?? { appearance_slot: null },
        Math.max(0, currentUserPlayerIndex),
      ),
    [currentUserPlayer, currentUserPlayerIndex, tokenAppearance],
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
              label={t(`gameStatus.${presentedGame.status}`)}
              color={presentedGame.status === 'playing' ? 'success' : 'default'}
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
              disabled={presentationBusy}
              onClick={() => void run(() => api.getGame(game.id), true)}
            >
              {t('refresh')}
            </Button>
            <Button
              size="small"
              color="secondary"
              startIcon={<AnalyticsRoundedIcon />}
              disabled={presentationBusy}
              onClick={openAnalytics}
            >
              {t('analytics.open')}
            </Button>
            {(isParticipant || isSpectator) && (
              <Button
                size="small"
                color={
                  presentedGame.status === 'playing' && isParticipant
                    ? 'error'
                    : 'inherit'
                }
                startIcon={<LogoutRoundedIcon />}
                disabled={presentationBusy}
                onClick={() => {
                  if (presentedGame.status === 'playing' && isParticipant) {
                    setConfirmResignation(true)
                  } else {
                    void leaveGame()
                  }
                }}
              >
                {presentedGame.status === 'playing' && isParticipant
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
              label={t('houseSupply', {
                count: presentedGame.houses_remaining,
              })}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t('hotelSupply', {
                count: presentedGame.hotels_remaining,
              })}
            />
            {presentedGame.settings.rules.free_parking_jackpot && (
              <Chip
                size="small"
                color={presentedGame.bank_pot > 0 ? 'secondary' : 'default'}
                variant="outlined"
                label={t('bankPot', { amount: presentedGame.bank_pot })}
              />
            )}
          </Stack>

          {presentedGame.status === 'lobby' && (
            <Stack spacing={2}>
              <LobbySettingsPanel
                game={presentedGame}
                pack={pack}
                isHost={isHost}
                busy={presentationBusy}
                onUpdate={(data) =>
                  void run(() => api.updateGameSettings(game.id, data))
                }
              />
              <BotManagementPanel
                game={presentedGame}
                maximumPlayers={
                  game.settings.max_players ?? pack.manifest.max_players
                }
                isHost={isHost}
                busy={presentationBusy}
                onAdd={(
                  controller: BotController,
                  personality: BotPersonality,
                  displayName?: string,
                ) =>
                  run(() =>
                    api.addBot(game.id, controller, personality, displayName),
                  )
                }
                onFill={() => run(() => api.fillWithRandomBots(game.id))}
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
      players={presentedGame.players}
      range={resolvedHeatmapRange}
      maximumSequence={maximumHeatmapSequence}
      probabilityAvailable={probabilityHeatmapAvailable}
      source={heatmapSource}
      historicalAvailable={boardHistory !== null}
      historicalGameCount={boardHistory?.game_count ?? 0}
      historicalLoading={boardHistoryLoading}
      showTitle={false}
      onModeChange={setHeatmapMode}
      onSourceChange={setHeatmapSource}
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
      game={presentedGame}
      pack={pack}
      user={user}
      currentUserTokenAppearance={tokenAppearance}
      sortOption={playerSort}
      showTitle={false}
      motionIntensity={presentationMotionIntensity}
      onSortOptionChange={updatePlayerSort}
      onHoveredPlayerChange={setHighlightedPlayerId}
    />
  )

  const startTradeFromProperty = useCallback(
    (recipientId: string, requestedPropertyId: string) => {
      setTradeDraft({ recipientId, requestedPropertyId })
      selectMobileManagementPanel('trades')
      if (isTablet) {
        selectTabletWorkspacePanel('trades')
        updatePanelLayout((current) => ({
          ...current,
          rail: {
            ...current.rail,
            visible: current.rail.visible.includes('trades')
              ? current.rail.visible
              : [...current.rail.visible, 'trades'],
          },
        }))
        return
      }
      updatePanelLayout((current) => ({
        ...current,
        management: {
          ...current.management,
          visible: current.management.visible.includes('trades')
            ? current.management.visible
            : [...current.management.visible, 'trades'],
        },
      }))
      selectMobilePanel('manage')
    },
    [
      isTablet,
      selectMobileManagementPanel,
      selectMobilePanel,
      selectTabletWorkspacePanel,
      updatePanelLayout,
    ],
  )
  const consumeTradeDraft = useCallback(() => setTradeDraft(null), [])

  const propertiesContent = (
    <PropertyManagementPanel
      embedded
      game={presentedGame}
      pack={pack}
      user={user}
      busy={presentationBusy}
      onCommand={sendCommand}
      onTrade={startTradeFromProperty}
      onHoveredPropertyChange={setHighlightedPropertyId}
      filter={gameView.property_filter}
      onFilterChange={(property_filter) => updateGameView({ property_filter })}
    />
  )

  const tradesContent = (
    <GameTradePanel
      game={presentedGame}
      pack={pack}
      user={user}
      busy={presentationBusy}
      error={error}
      boardHistory={boardHistory}
      draft={tradeDraft}
      onDraftConsumed={consumeTradeDraft}
      onCommand={sendCommand}
    />
  )

  const bankContent = (
    <BankPanel
      game={presentedGame}
      pack={pack}
      user={user}
      busy={presentationBusy}
      onCommand={sendCommand}
      tab={gameView.bank_tab}
      onTabChange={(bank_tab) => updateGameView({ bank_tab })}
    />
  )

  const marketContent = (
    <MarketPanel
      game={presentedGame}
      pack={pack}
      user={user}
      busy={presentationBusy}
      onCommand={sendCommand}
      activeTab={gameView.market_tab}
      onTabChange={(market_tab) => updateGameView({ market_tab })}
    />
  )

  const debtsContent = (
    <DebtAccountsPanel
      game={presentedGame}
      user={user}
      busy={presentationBusy}
      onCommand={sendCommand}
    />
  )

  const notificationCount = (panelId: WorkspaceNotificationPanel) =>
    workspaceNotificationCounts[panelId]

  const notificationLabel = (label: string, count: number) =>
    count > 0 ? t('notifications.unread', { panel: label, count }) : label

  const iconWithNotifications = (
    panelId: WorkspaceNotificationPanel,
    icon: React.ReactElement,
  ) => (
    <Badge
      badgeContent={notificationCount(panelId)}
      color="error"
      max={99}
      overlap="circular"
    >
      {icon}
    </Badge>
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
      iconWithNotifications('trades', <SwapHorizRoundedIcon fontSize="small" />)
    ) : panelId === 'debts' ? (
      iconWithNotifications('debts', <ReceiptLongRoundedIcon fontSize="small" />)
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
                aria-label={notificationLabel(
                  title,
                  panelId === 'trades' || panelId === 'debts'
                    ? notificationCount(panelId)
                    : 0,
                )}
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
              motionIntensity={presentationMotionIntensity}
            >
              {managementPanelContent(panelId)}
            </PersonalizablePanel>
          )
        })}
      </Stack>
    </Stack>
  )

  const mobileManagementContent = (
    <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <Tabs
        value={mobileManagementPanel}
        onChange={(_, panelId: ManagementPanelId) =>
          selectMobileManagementPanel(panelId)
        }
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label={t('layout.managementViews')}
        sx={{
          minHeight: 48,
          borderBottom: '1px solid rgba(255,255,255,.1)',
          '& .MuiTab-root': {
            minHeight: 48,
            minWidth: 'auto',
            px: 1.5,
          },
        }}
      >
        {MANAGEMENT_PANEL_IDS.map((panelId) => {
          const title = managementPanelTitle(panelId)
          return (
            <Tab
              key={panelId}
              id={`mobile-management-tab-${panelId}`}
              value={panelId}
              icon={managementPanelIcon(panelId)}
              iconPosition="start"
              label={title}
              aria-label={notificationLabel(
                title,
                panelId === 'trades' || panelId === 'debts'
                  ? notificationCount(panelId)
                  : 0,
              )}
              aria-controls={`mobile-management-panel-${panelId}`}
            />
          )
        })}
      </Tabs>
      <Box
        id={`mobile-management-panel-${mobileManagementPanel}`}
        role="tabpanel"
        aria-labelledby={`mobile-management-tab-${mobileManagementPanel}`}
        sx={{ minWidth: 0 }}
      >
        {managementPanelContent(mobileManagementPanel)}
      </Box>
    </Stack>
  )
  const responsiveManagementContent = isTablet
    ? managementContent
    : mobileManagementContent

  const criticalAlerts = (
    <>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {presentationOmissionActive && (
        <Alert severity="info">{t('boardView.participantsResolving')}</Alert>
      )}
      {!presentationOmissionActive &&
        !motionPending &&
        presentedGame.active_debt && (
        <Alert
          severity="error"
          sx={{
            flexDirection: { xs: 'column', sm: 'row' },
            maxHeight: 'min(72dvh, 620px)',
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            touchAction: { xs: 'pan-y', md: 'auto' },
            WebkitOverflowScrolling: 'touch',
            '& .MuiAlert-action': {
              ml: { xs: 0, sm: 2 },
              mt: { xs: 1, sm: 0 },
              alignSelf: { xs: 'stretch', sm: 'center' },
            },
          }}
        >
          <Stack spacing={0.75} sx={{ width: '100%', minWidth: 0 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              tabIndex={isTablet ? 0 : -1}
              aria-label={t('rentDebt.moveNotification')}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
              onPointerDown={startDebtAlertDrag}
              onPointerMove={moveDebtAlert}
              onPointerUp={finishDebtAlertDrag}
              onPointerCancel={finishDebtAlertDrag}
              onKeyDown={moveDebtAlertWithKeyboard}
              sx={{
                width: 'fit-content',
                maxWidth: '100%',
                cursor: { xs: 'default', md: 'grab' },
                touchAction: { xs: 'auto', md: 'none' },
                userSelect: 'none',
                '&:active': { cursor: { md: 'grabbing' } },
                '&:focus-visible': {
                  outline: '2px solid currentColor',
                  outlineOffset: 3,
                  borderRadius: 0.5,
                },
              }}
            >
              <DragIndicatorRoundedIcon fontSize="small" />
              <Typography variant="caption" fontWeight={800}>
                {t('rentDebt.moveNotification')}
              </Typography>
            </Stack>
            <RentDebtResolutionPanel
              game={presentedGame}
              pack={pack}
              user={user}
              busy={presentationBusy}
              playerName={playerName}
              onCommand={sendCommand}
            />
          </Stack>
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
      iconWithNotifications('chat', <ForumRoundedIcon fontSize="small" />)
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
        personalizable={layoutEditing}
        height={layoutEditing ? panelLayout.rail.heights[panelId] : undefined}
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
        onDragStart={
          layoutEditing
            ? (event) => startWorkspacePanelDrag(panelId, event)
            : undefined
        }
        onDragEnd={
          layoutEditing ? () => setDraggedWorkspacePanel(null) : undefined
        }
        onDragOver={
          layoutEditing
            ? (event) => {
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
              }
            : undefined
        }
        onDrop={
          layoutEditing
            ? (event) => dropWorkspacePanel(event, panelId, placement)
            : undefined
        }
        onHeightChange={
          layoutEditing
            ? (height) => resizeWorkspacePanel(panelId, height)
            : undefined
        }
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
              ? responsiveManagementContent
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
      <Box
        key={panelId}
        component="section"
        aria-label={title}
        sx={{ minWidth: 0 }}
      >
        {content}
      </Box>
    )
  }

  const mobilePanelTitle =
    mobilePanel === null
      ? ''
      : panelTitle(mobilePanel === 'manage' ? 'management' : mobilePanel)

  const leftDockColumn =
    leftWorkspacePanels.length > 0
      ? 'clamp(240px, 20vw, 340px)'
      : draggedWorkspacePanel
        ? '96px'
        : '0px'
  const rightDockColumn =
    rightWorkspacePanels.length > 0
      ? 'clamp(240px, 20vw, 340px)'
      : draggedWorkspacePanel
        ? '96px'
        : '0px'
  const tabletDockColumn = 'clamp(280px, 34vw, 360px)'
  const showWorkspaceRailLabels =
    isWideWorkspace && !panelLayout.rail.compact

  const renderWorkspaceDock = (
    placement: Exclude<WorkspacePanelPlacement, 'floating'>,
    panelIds: WorkspacePanelId[],
  ) => (
    <Stack
      component="aside"
      aria-label={t('layout.dockLabel', {
        side:
          placement === 'left'
            ? t('layout.leftSide')
            : t('layout.rightSide'),
      })}
      gridArea={placement}
      spacing={1}
      onDragOver={
        layoutEditing
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'move'
            }
          : undefined
      }
      onDrop={
        layoutEditing
          ? (event) => dropWorkspacePanel(event, null, placement)
          : undefined
      }
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
        p: panelIds.length > 0 || (layoutEditing && draggedWorkspacePanel) ? 1 : 0,
        borderRight:
          placement === 'left' &&
          (panelIds.length > 0 || (layoutEditing && draggedWorkspacePanel))
            ? '1px solid rgba(255,255,255,.08)'
            : undefined,
        borderLeft:
          placement === 'right' &&
          (panelIds.length > 0 || (layoutEditing && draggedWorkspacePanel))
            ? '1px solid rgba(255,255,255,.08)'
            : undefined,
        bgcolor:
          panelIds.length === 0 && layoutEditing && draggedWorkspacePanel
            ? 'rgba(184,255,61,.06)'
            : undefined,
        transition: 'background-color 120ms ease',
      }}
    >
      {panelIds.length === 0 && layoutEditing && draggedWorkspacePanel && (
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
      component="main"
      aria-label={t('layout.gameWorkspace')}
      data-testid="game-workspace"
      data-workspace-mode={
        !isTablet ? 'mobile' : isWideWorkspace ? 'desktop' : 'tablet'
      }
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
        component="a"
        href="#turn-actions"
        sx={{
          position: 'fixed',
          top: 8,
          left: 8,
          zIndex: 2000,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontWeight: 850,
          textDecoration: 'none',
          transform: 'translateY(-160%)',
          transition: 'transform 120ms ease',
          '&:focus': { transform: 'translateY(0)' },
        }}
      >
        {t('layout.skipToTurnActions')}
      </Box>
      <Box
        sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          minHeight: 0,
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns:
            gameView.workspace_mode === 'focus'
              ? { xs: 'minmax(0, 1fr)' }
              : {
                  xs: 'minmax(0, 1fr)',
                  md: `minmax(0, 1fr) ${tabletDockColumn} 64px`,
                  lg: `${leftDockColumn} minmax(0, 1fr) ${rightDockColumn} ${showWorkspaceRailLabels ? 'clamp(148px, 12vw, 176px)' : '64px'}`,
                  xl: `${leftDockColumn} minmax(0, 1fr) ${rightDockColumn} ${showWorkspaceRailLabels ? 'clamp(176px, 12vw, 204px)' : '64px'}`,
                },
          gridTemplateAreas:
            gameView.workspace_mode === 'focus'
              ? { xs: '"board"' }
              : {
                  xs: '"board"',
                  md: '"board tablet rail"',
                  lg: '"left board right rail"',
                },
          gap: 0,
          alignItems: 'stretch',
          transition:
            motionIntensity === 'off'
              ? 'none'
              : 'grid-template-columns 180ms ease',
        }}
      >
        <Stack
          component="section"
          aria-label={t('layout.boardArea')}
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
          <Paper
            component="section"
            aria-label={t('boardView.controls')}
            elevation={8}
            sx={{
              position: 'relative',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              p: 0.5,
              width: '100%',
              maxWidth: '100%',
              flexShrink: 0,
              overflowX: 'auto',
              bgcolor: 'rgba(17,13,29,.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,.12)',
            }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={gameView.tile_mode}
              onChange={(_, tile_mode) => {
                if (tile_mode) updateGameView({ tile_mode })
              }}
              aria-label={t('boardView.tileMode')}
            >
              <ToggleButton value="detailed" aria-label={t('boardView.detailed')}>
                <TextFieldsRoundedIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="visual" aria-label={t('boardView.visual')}>
                <GridViewRoundedIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title={t('boardView.fit')}>
              <ToggleButton
                value="fit"
                selected={gameView.camera_mode === 'fit'}
                aria-label={t('boardView.fit')}
                onClick={() =>
                  updateGameView({
                    camera_mode:
                      gameView.camera_mode === 'fit' ? 'detail' : 'fit',
                  })
                }
                sx={{ minWidth: 44, minHeight: 44, p: 0.75 }}
              >
                <FitScreenRoundedIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={
                gameView.workspace_mode === 'focus'
                  ? t('boardView.exitFocus')
                  : t('boardView.focus')
              }
            >
              <ToggleButton
                value="focus"
                selected={gameView.workspace_mode === 'focus'}
                aria-label={
                  gameView.workspace_mode === 'focus'
                    ? t('boardView.exitFocus')
                    : t('boardView.focus')
                }
                onClick={() =>
                  updateGameView({
                    workspace_mode:
                      gameView.workspace_mode === 'focus' ? 'normal' : 'focus',
                    mobile_panel: null,
                  })
                }
                sx={{ minWidth: 44, minHeight: 44, p: 0.75 }}
              >
                <CenterFocusStrongRoundedIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={
                gameView.show_other_player_modals
                  ? t('boardView.hideOtherPlayerModals')
                  : t('boardView.showOtherPlayerModals')
              }
            >
              <ToggleButton
                value="other-player-modals"
                selected={gameView.show_other_player_modals}
                aria-label={
                  gameView.show_other_player_modals
                    ? t('boardView.hideOtherPlayerModals')
                    : t('boardView.showOtherPlayerModals')
                }
                aria-pressed={gameView.show_other_player_modals}
                onClick={() =>
                  updateGameView({
                    show_other_player_modals:
                      !gameView.show_other_player_modals,
                  })
                }
                sx={{ minWidth: 44, minHeight: 44, p: 0.75 }}
              >
                {gameView.show_other_player_modals ? (
                  <VisibilityRoundedIcon fontSize="small" />
                ) : (
                  <VisibilityOffRoundedIcon fontSize="small" />
                )}
              </ToggleButton>
            </Tooltip>
            <Tooltip title={t('boardView.transitionSettings')}>
              <ToggleButton
                value="presentation-settings"
                selected={anyParticipantPresentationOmitted}
                aria-label={t('boardView.transitionSettings')}
                aria-pressed={anyParticipantPresentationOmitted}
                onClick={() => setPresentationSettingsOpen(true)}
                sx={{ minWidth: 44, minHeight: 44, p: 0.75 }}
              >
                <FastForwardRoundedIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <FormControl size="small" sx={{ minWidth: 104 }}>
              <Select
                value={gameView.movement_preview}
                onChange={(event) =>
                  updateGameView({
                    movement_preview: event.target
                      .value as GameViewPreferenceSettings['movement_preview'],
                  })
                }
                aria-label={t('boardView.movementPreview')}
                sx={{ minHeight: 44, fontSize: '0.78rem' }}
              >
                <MenuItem value="steps">{t('boardView.previewSteps')}</MenuItem>
                <MenuItem value="landing">{t('boardView.previewLanding')}</MenuItem>
                <MenuItem value="off">{t('boardView.previewOff')}</MenuItem>
              </Select>
            </FormControl>
          </Paper>
          <Stack
            ref={debtAlertRef}
            spacing={0.75}
            sx={{
              position: { xs: 'absolute', md: 'fixed' },
              top: {
                xs: 8,
                md: presentedGame.active_debt
                  ? (debtAlertPosition?.y ?? 'clamp(150px, 18dvh, 210px)')
                  : 8,
              },
              left: {
                xs: '50%',
                md: debtAlertPosition?.x ?? '50%',
              },
              transform: {
                xs: 'translateX(-50%)',
                md: debtAlertPosition ? 'none' : 'translateX(-50%)',
              },
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
              height: 'auto',
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'auto',
              pb: {
                xs: 'calc(72px + env(safe-area-inset-bottom))',
                md: 0,
              },
              scrollPaddingBottom: {
                xs: 'calc(72px + env(safe-area-inset-bottom))',
                md: 0,
              },
              display: 'flex',
              justifyContent:
                gameView.camera_mode === 'fit' || zoom <= 1
                  ? 'center'
                  : 'flex-start',
              alignItems: 'flex-start',
            }}
          >
            <GameBoard
              pack={pack}
              zoom={zoom}
              game={presentedGame}
              motionGame={game}
              currentUserId={user.id}
              currentUserTokenAppearance={tokenAppearance}
              syncMotionKey={motionSyncKey}
              onMotionSettled={handleMotionSettled}
              onTokenStep={handleTokenStep}
              onTokenTeleport={handleTokenTeleport}
              motionPending={motionPending}
              fitAvailableHeight={gameView.camera_mode === 'fit'}
              tileViewMode={gameView.tile_mode}
              movementPreviewMode={gameView.movement_preview}
              busy={presentationBusy}
              onCommand={sendCommand}
              onTrade={startTradeFromProperty}
              heatmap={boardHeatmap}
              actionEvents={visibleEvents}
              motionIntensity={presentationMotionIntensity}
              highlightedTileId={highlightedPropertyId}
              highlightedPlayerId={highlightedPlayerId}
              centerContent={
                <GameActionCenter
                  game={presentedGame}
                  diceGame={game}
                  pack={pack}
                  user={user}
                  busy={presentationBusy}
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
                  motionIntensity={presentationMotionIntensity}
                />
              }
            />
          </Box>
        </Stack>

        {gameView.workspace_mode !== 'focus' && isTablet && !isWideWorkspace && (
          <Box
            component="aside"
            aria-label={t('layout.activePanel', {
              panel: workspacePanelTitle(tabletWorkspacePanel),
            })}
            gridArea="tablet"
            sx={{
              height: '100%',
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
              p: 1,
              borderLeft: '1px solid rgba(255,255,255,.08)',
              bgcolor: 'rgba(12,10,21,.94)',
            }}
          >
            <PersonalizablePanel
              id={`tablet-workspace-panel-${tabletWorkspacePanel}`}
              title={workspacePanelTitle(tabletWorkspacePanel)}
              fillAvailableHeight
              motionIntensity={motionIntensity}
            >
              {workspacePanelContent(tabletWorkspacePanel)}
            </PersonalizablePanel>
          </Box>
        )}

        {gameView.workspace_mode !== 'focus' && isWideWorkspace && (
          <>
            {renderWorkspaceDock('left', leftWorkspacePanels)}
            {renderWorkspaceDock('right', rightWorkspacePanels)}
          </>
        )}

        {gameView.workspace_mode !== 'focus' && isTablet && (
          <Stack
            component="nav"
            aria-label={t('layout.workspaceViews')}
            data-compact={!showWorkspaceRailLabels}
            gridArea="rail"
            sx={{
              height: '100%',
              minHeight: 0,
              py: 1,
              px: 0.75,
              borderLeft: '1px solid rgba(255,255,255,.1)',
              bgcolor: 'rgba(10,8,18,.97)',
              position: 'relative',
              zIndex: 500,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'thin',
            }}
          >
            {isWideWorkspace && (
              <Tooltip
                title={
                  panelLayout.rail.compact
                    ? t('layout.expandNavigation')
                    : t('layout.collapseNavigation')
                }
                placement="left"
              >
                <IconButton
                  aria-label={
                    panelLayout.rail.compact
                      ? t('layout.expandNavigation')
                      : t('layout.collapseNavigation')
                  }
                  aria-expanded={!panelLayout.rail.compact}
                  aria-controls="workspace-navigation-groups"
                  onClick={toggleWorkspaceRail}
                  sx={{
                    width: 48,
                    height: 48,
                    mb: 0.5,
                    alignSelf: showWorkspaceRailLabels ? 'flex-end' : 'center',
                    color: 'text.secondary',
                    border: '1px solid rgba(255,255,255,.08)',
                    borderRadius: 2,
                  }}
                >
                  {panelLayout.rail.compact ? (
                    <ChevronLeftRoundedIcon />
                  ) : (
                    <ChevronRightRoundedIcon />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <Stack
              id="workspace-navigation-groups"
              spacing={1}
              sx={{ width: '100%' }}
            >
              {WORKSPACE_PANEL_GROUPS.map((group, groupIndex) => (
                <Box
                  component="section"
                  key={group.id}
                  aria-label={t(`layout.groups.${group.id}`)}
                  sx={{
                    pt: groupIndex === 0 ? 0 : 1,
                    borderTop:
                      groupIndex === 0
                        ? 'none'
                        : '1px solid rgba(255,255,255,.08)',
                  }}
                >
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{
                      display: showWorkspaceRailLabels ? 'block' : 'none',
                      px: 0.75,
                      pb: 0.35,
                      fontSize: '0.68rem',
                      letterSpacing: '.09em',
                    }}
                  >
                    {t(`layout.groups.${group.id}`)}
                  </Typography>
                  <Stack
                    role="group"
                    aria-label={t(`layout.groups.${group.id}`)}
                    spacing={0.5}
                  >
                    {group.panelIds.map((panelId) => {
                      const title = workspacePanelTitle(panelId)
                      const selected = isWideWorkspace
                        ? panelLayout.rail.visible.includes(panelId)
                        : tabletWorkspacePanel === panelId
                      const count =
                        panelId === 'trades' ||
                        panelId === 'debts' ||
                        panelId === 'chat'
                          ? notificationCount(panelId)
                          : 0
                      return (
                        <Tooltip key={panelId} title={title} placement="left">
                          <ToggleButton
                            value={panelId}
                            selected={selected}
                            aria-label={notificationLabel(title, count)}
                            aria-pressed={selected}
                            onClick={() => toggleWorkspacePanel(panelId)}
                            sx={{
                              width: '100%',
                              minWidth: 0,
                              minHeight: 48,
                              px: showWorkspaceRailLabels ? 1 : 0.5,
                              gap: 1,
                              justifyContent: showWorkspaceRailLabels
                                ? 'flex-start'
                                : 'center',
                              border: '1px solid transparent',
                              borderRadius: '10px !important',
                              '&.Mui-selected': {
                                color: 'primary.main',
                                bgcolor: 'rgba(184,255,61,.14)',
                                borderColor: 'rgba(184,255,61,.32)',
                              },
                            }}
                          >
                            {workspacePanelIcon(panelId)}
                            <Typography
                              component="span"
                              variant="body2"
                              fontWeight={750}
                              noWrap
                              sx={{
                                display: showWorkspaceRailLabels
                                  ? 'block'
                                  : 'none',
                              }}
                            >
                              {title}
                            </Typography>
                          </ToggleButton>
                        </Tooltip>
                      )
                    })}
                  </Stack>
                </Box>
              ))}

              <Box
                component="section"
                aria-label={t('layout.groups.tools')}
                sx={{
                  pt: 1,
                  borderTop: '1px solid rgba(255,255,255,.08)',
                }}
              >
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{
                    display: showWorkspaceRailLabels ? 'block' : 'none',
                    px: 0.75,
                    pb: 0.35,
                    fontSize: '0.68rem',
                  }}
                >
                  {t('layout.groups.tools')}
                </Typography>
                <Stack spacing={0.5}>
                  <Tooltip title={t('analytics.open')} placement="left">
                    <Button
                      color="secondary"
                      aria-label={t('analytics.open')}
                      onClick={openAnalytics}
                      startIcon={<AnalyticsRoundedIcon fontSize="small" />}
                      sx={{
                        width: '100%',
                        minWidth: 0,
                        minHeight: 48,
                        px: showWorkspaceRailLabels ? 1 : 0.5,
                        justifyContent: showWorkspaceRailLabels
                          ? 'flex-start'
                          : 'center',
                        border: '1px solid rgba(167,139,250,.34)',
                        bgcolor: 'rgba(167,139,250,.1)',
                        '& .MuiButton-startIcon': {
                          m: showWorkspaceRailLabels ? '0 8px 0 0' : 0,
                        },
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          display: showWorkspaceRailLabels ? 'inline' : 'none',
                        }}
                      >
                        {t('analytics.open')}
                      </Box>
                    </Button>
                  </Tooltip>
                  {isWideWorkspace && (
                    <Tooltip
                      title={
                        layoutEditing
                          ? t('layout.finishEditing')
                          : t('layout.editLayout')
                      }
                      placement="left"
                    >
                      <Button
                        color={layoutEditing ? 'primary' : 'inherit'}
                        variant={layoutEditing ? 'outlined' : 'text'}
                        aria-pressed={layoutEditing}
                        onClick={() => setLayoutEditing((editing) => !editing)}
                        startIcon={<TuneRoundedIcon fontSize="small" />}
                        sx={{
                          width: '100%',
                          minWidth: 0,
                          minHeight: 48,
                          px: showWorkspaceRailLabels ? 1 : 0.5,
                          justifyContent: showWorkspaceRailLabels
                            ? 'flex-start'
                            : 'center',
                          '& .MuiButton-startIcon': {
                            m: showWorkspaceRailLabels ? '0 8px 0 0' : 0,
                          },
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            display: showWorkspaceRailLabels ? 'inline' : 'none',
                          }}
                        >
                          {layoutEditing
                            ? t('layout.finishEditing')
                            : t('layout.editLayout')}
                        </Box>
                      </Button>
                    </Tooltip>
                  )}
                  {isWideWorkspace && layoutEditing && (
                    <Tooltip
                      title={t('layout.redistributeHeights')}
                      placement="left"
                    >
                      <Box component="span" sx={{ display: 'block', width: '100%' }}>
                        <Button
                          disabled={!hasCustomWorkspaceHeights}
                          aria-label={t('layout.redistributeHeights')}
                          onClick={redistributeWorkspacePanelHeights}
                          startIcon={
                            <VerticalAlignCenterRoundedIcon fontSize="small" />
                          }
                          sx={{
                            width: '100%',
                            minWidth: 0,
                            minHeight: 48,
                            px: showWorkspaceRailLabels ? 1 : 0.5,
                            justifyContent: showWorkspaceRailLabels
                              ? 'flex-start'
                              : 'center',
                            '& .MuiButton-startIcon': {
                              m: showWorkspaceRailLabels ? '0 8px 0 0' : 0,
                            },
                          }}
                        >
                          <Box
                            component="span"
                            sx={{
                              display: showWorkspaceRailLabels
                                ? 'inline'
                                : 'none',
                            }}
                          >
                            {t('layout.redistributeHeights')}
                          </Box>
                        </Button>
                      </Box>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Stack>
        )}
      </Box>

      {gameView.workspace_mode !== 'focus' &&
        isWideWorkspace &&
        floatingWorkspacePanels.map(renderFloatingWorkspacePanel)}

      {analyticsOpen && (
        <Suspense fallback={null}>
          <GameAnalyticsDashboard
            open
            game={presentedGame}
            pack={pack}
            boardHistory={boardHistory}
            boardHistoryLoading={boardHistoryLoading}
            tab={gameView.analytics_tab}
            view={gameView.analytics_view}
            source={gameView.analytics_source}
            onTabChange={(analytics_tab) => updateGameView({ analytics_tab })}
            onViewChange={(analytics_view) => updateGameView({ analytics_view })}
            onSourceChange={(analytics_source) =>
              updateGameView({ analytics_source })
            }
            onClose={() => updateGameView({ analytics_open: false })}
          />
        </Suspense>
      )}

      {!isTablet && gameView.workspace_mode !== 'focus' && (
        <>
          <BottomNavigation
            component="nav"
            aria-label={t('mobileNavigation', {
              defaultValue: 'Navegación del juego',
            })}
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
              '& .MuiBottomNavigationAction-root': {
                minWidth: 0,
                minHeight: 56,
                px: 0.5,
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.68rem',
              },
            }}
          >
            <BottomNavigationAction
              value="room"
              label={t('room')}
              icon={<MenuRoundedIcon />}
              onClick={() => selectMobilePanel('room')}
            />
            <BottomNavigationAction
              value="players"
              label={t('playersPanel')}
              icon={<GroupsRoundedIcon />}
              onClick={() => selectMobilePanel('players')}
            />
            <BottomNavigationAction
              value="manage"
              label={t('manage')}
              aria-label={notificationLabel(
                t('manage'),
                notificationCount('trades') + notificationCount('debts'),
              )}
              icon={
                <Badge
                  badgeContent={
                    notificationCount('trades') + notificationCount('debts')
                  }
                  color="error"
                  max={99}
                  overlap="circular"
                >
                  <ApartmentRoundedIcon />
                </Badge>
              }
              onClick={() => selectMobilePanel('manage')}
            />
            <BottomNavigationAction
              value="heatmap"
              label={t('heatmap.title')}
              icon={<LayersRoundedIcon />}
              onClick={() => selectMobilePanel('heatmap')}
            />
            <BottomNavigationAction
              value="analytics"
              label={t('analytics.open')}
              icon={<AnalyticsRoundedIcon />}
              disabled={presentationBusy}
              onClick={openAnalytics}
            />
            <BottomNavigationAction
              value="chat"
              label={t('chat.short')}
              aria-label={notificationLabel(
                t('chat.short'),
                notificationCount('chat'),
              )}
              icon={iconWithNotifications('chat', <ForumRoundedIcon />)}
              onClick={() => selectMobilePanel('chat')}
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
            onClose={() => selectMobilePanel(null)}
            slotProps={{
              paper: {
                role: 'dialog',
                'aria-modal': true,
                'aria-labelledby': 'mobile-panel-title',
                sx: {
                  height: 'min(86dvh, 780px)',
                  maxHeight:
                    'calc(100dvh - env(safe-area-inset-top, 0px) - 8px)',
                  borderRadius: '20px 20px 0 0',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                },
              },
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                position: 'relative',
                flexShrink: 0,
                minHeight: 60,
                px: 1.5,
                pt: 0.75,
                borderBottom: '1px solid rgba(255,255,255,.1)',
                bgcolor: 'background.paper',
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  width: 36,
                  height: 4,
                  borderRadius: 99,
                  bgcolor: 'rgba(255,255,255,.28)',
                  transform: 'translateX(-50%)',
                }}
              />
              <Typography
                id="mobile-panel-title"
                variant="h6"
                fontWeight={900}
                noWrap
                sx={{ flex: 1, minWidth: 0, pt: 0.5 }}
              >
                {mobilePanelTitle}
              </Typography>
              <IconButton
                aria-label={t('close')}
                onClick={() => selectMobilePanel(null)}
                sx={{ width: 48, height: 48, flexShrink: 0 }}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehaviorY: 'contain',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
                px: 1.5,
                pt: 1.25,
                pb: 'max(16px, env(safe-area-inset-bottom))',
              }}
            >
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
        game={presentedGame}
        events={visibleEvents}
        pack={pack}
        intensity={presentationMotionIntensity}
        synchronized={connectionState === 'connected'}
        presentationSyncKey={motionSyncKey}
      />

      {!presentationOmissionActive &&
        !motionPending &&
        showCardDrawModal &&
        !presentedGame.pending_card_choice_result && (
        <GameCardDrawDialog
          game={presentedGame}
          pack={pack}
          user={user}
          busy={presentationBusy}
          error={error}
          onCommand={sendCommand}
          motionIntensity={presentationMotionIntensity}
        />
      )}

      <GameCardChoiceDialog
        game={presentedGame}
        pack={pack}
        user={user}
        busy={presentationBusy}
        error={error}
        onCommand={sendCommand}
        motionIntensity={presentationMotionIntensity}
        visible={
          !presentationOmissionActive &&
          !motionPending &&
          showCardChoiceModal &&
          (!presentedGame.pending_card_draw ||
            presentedGame.pending_card_choice_result !== null)
        }
      />

      {!presentationOmissionActive &&
        !motionPending &&
        showAuctionModal &&
        !presentedGame.pending_card_draw &&
        !presentedGame.pending_card_choice &&
        !presentedGame.pending_card_choice_result && (
        <GameAuctionDialog
          game={presentedGame}
          pack={pack}
          user={user}
          busy={presentationBusy}
          error={error}
          boardHistory={boardHistory}
          onCommand={sendCommand}
          onCountdownWarning={handleAuctionCountdown}
          motionIntensity={presentationMotionIntensity}
        />
      )}

      <GameFinishedDialog
        open={gameResultOpen}
        game={presentedGame}
        currentUserId={user.id}
        busy={presentationBusy}
        onClose={() => setGameResultOpen(false)}
        onExit={() => void leaveGame()}
        motionIntensity={presentationMotionIntensity}
      />

      <TokenCustomizationDialog
        open={tokenDialogOpen}
        value={tokenDialogValue}
        playerNumber={Math.max(1, currentUserPlayerIndex + 1)}
        onClose={() => setTokenDialogOpen(false)}
        onSave={updateTokenAppearance}
      />

      <Dialog
        open={presentationSettingsOpen}
        onClose={() => setPresentationSettingsOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t('boardView.transitionSettings')}</DialogTitle>
        <DialogContent>
          <Stack spacing={0.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={allParticipantPresentationsOmitted}
                  onChange={(event) =>
                    updateGameView({
                      omit_bot_presentations: event.target.checked,
                      omit_other_human_presentations: event.target.checked,
                      omit_own_presentations: event.target.checked,
                    })
                  }
                />
              }
              label={t('boardView.omitAllPresentations')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={gameView.omit_bot_presentations}
                  onChange={(event) =>
                    updateGameView({
                      omit_bot_presentations: event.target.checked,
                    })
                  }
                />
              }
              label={t('boardView.omitBotPresentations')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={gameView.omit_other_human_presentations}
                  onChange={(event) =>
                    updateGameView({
                      omit_other_human_presentations: event.target.checked,
                    })
                  }
                />
              }
              label={t('boardView.omitOtherHumanPresentations')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={gameView.omit_own_presentations}
                  onChange={(event) =>
                    updateGameView({
                      omit_own_presentations: event.target.checked,
                    })
                  }
                />
              }
              label={t('boardView.omitOwnPresentations')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresentationSettingsOpen(false)}>
            {t('close')}
          </Button>
        </DialogActions>
      </Dialog>

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
