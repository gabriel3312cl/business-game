import type {
  AdminRoomSummary,
  AdminUserSummary,
  AdminUserUpdate,
  AutomationPreferenceSettings,
  AudioPreferenceSettings,
  BoardHistoricalStats,
  BotController,
  BotPersonality,
  ContentPack,
  EconomicDifficulty,
  GameCommand,
  GameAudioCatalogItem,
  GameState,
  GameViewPreferenceSettings,
  GameColorThemeId,
  OptionalRules,
  PanelLayoutPreferences,
  PackManifest,
  PlayerSortOption,
  TokenAppearanceSettings,
  TokenResponse,
  TradeAnalysis,
  User,
  UserPreferences,
  VisualEffectsPreferenceSettings,
} from './types'
import { createCommandId } from './commandId'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const TOKEN_KEY = 'business_game_access_token'
const ACTIVE_GAME_KEY = 'business_game_active_game_id'
let accessToken =
  typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)
let authenticatedUserId: string | null = null
let authGeneration = 0
let refreshPromise: Promise<TokenResponse> | null = null

if (typeof window !== 'undefined') {
  window.localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function resolveAudioSource(item: GameAudioCatalogItem): GameAudioCatalogItem {
  if (!item.source_url || /^https?:\/\//.test(item.source_url)) return item
  const apiPrefix = '/api/v1'
  if (item.source_url.startsWith(apiPrefix) && API_BASE !== apiPrefix) {
    return {
      ...item,
      source_url: `${API_BASE}${item.source_url.slice(apiPrefix.length)}`,
    }
  }
  return item
}

function resolveAudioCatalog(
  items: GameAudioCatalogItem[],
): GameAudioCatalogItem[] {
  return items.map(resolveAudioSource)
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false,
  retryAuthentication = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (
    init.body &&
    !(init.body instanceof URLSearchParams) &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }
  if (authenticated) {
    const token = authToken.get()
    if (!token) {
      if (retryAuthentication) {
        await refreshAccessToken()
        return request<T>(path, init, true, false)
      }
      throw new ApiError('Authentication required', 401)
    }
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  if (response.status === 401 && authenticated && retryAuthentication) {
    await refreshAccessToken()
    return request<T>(path, init, true, false)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown
    } | null
    throw new ApiError(
      formatApiError(body?.detail, response.status),
      response.status,
    )
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

function formatApiError(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const message = 'msg' in item && typeof item.msg === 'string' ? item.msg : null
      if (!message) return []
      const location =
        'loc' in item && Array.isArray(item.loc)
          ? item.loc.filter((part: unknown) => part !== 'body').join('.')
          : ''
      return [location ? `${location}: ${message}` : message]
    })
    if (messages.length > 0) return messages.join(' · ')
  }
  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail)
    } catch {
      // Use the stable fallback below.
    }
  }
  return `Error de API ${status}`
}

export function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return request<T>(path, init, true)
}

export const authToken = {
  get: () => accessToken,
  set: (token: string, userId: string) => {
    accessToken = token
    authenticatedUserId = userId
  },
  clear: () => {
    authGeneration += 1
    accessToken = null
    authenticatedUserId = null
    if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY)
  },
}

export const activeGameSession = {
  get: () => localStorage.getItem(ACTIVE_GAME_KEY),
  set: (gameId: string) => localStorage.setItem(ACTIVE_GAME_KEY, gameId),
  clear: () => localStorage.removeItem(ACTIVE_GAME_KEY),
}

export const api = {
  listPacks: () => request<PackManifest[]>('/packs'),
  getPack: (packId: string, locale: string, version?: string) => {
    const query = new URLSearchParams({ locale })
    if (version) query.set('version', version)
    return request<ContentPack>(`/packs/${packId}?${query.toString()}`)
  },
  register: (data: {
    email: string
    password: string
    display_name: string
    locale: string
  }) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (email: string, password: string) => {
    authToken.clear()
    return request<TokenResponse>('/auth/token', {
      method: 'POST',
      body: new URLSearchParams({ username: email, password }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  },
  refreshSession: () => refreshAccessToken(),
  logout: () => {
    authToken.clear()
    return request<void>('/auth/logout', { method: 'POST' })
  },
  me: () => request<User>('/auth/me', {}, true),
  getAudioCatalog: () =>
    request<GameAudioCatalogItem[]>('/audio/catalog').then(resolveAudioCatalog),
  listAdminAudio: () =>
    request<GameAudioCatalogItem[]>('/admin/audio', {}, true).then(
      resolveAudioCatalog,
    ),
  replaceAdminAudio: (soundId: string, file: File) => {
    const body = new FormData()
    body.set('file', file)
    return request<GameAudioCatalogItem>(
      `/admin/audio/${encodeURIComponent(soundId)}`,
      { method: 'PUT', body },
      true,
    ).then(resolveAudioSource)
  },
  resetAdminAudio: (soundId: string) =>
    request<void>(
      `/admin/audio/${encodeURIComponent(soundId)}`,
      { method: 'DELETE' },
      true,
    ),
  listAdminUsers: () => request<AdminUserSummary[]>('/admin/users', {}, true),
  updateAdminUser: (userId: string, data: AdminUserUpdate) =>
    request<AdminUserSummary>(
      `/admin/users/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      true,
    ),
  listAdminRooms: () => request<AdminRoomSummary[]>('/admin/rooms', {}, true),
  cancelAdminRoom: (gameId: string) =>
    request<void>(
      `/admin/rooms/${encodeURIComponent(gameId)}/cancel`,
      { method: 'POST' },
      true,
    ),
  getUserPreferences: () =>
    request<UserPreferences>('/users/me/preferences', {}, true),
  updatePanelLayout: (panelLayout: PanelLayoutPreferences) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ panel_layout: panelLayout }),
      },
      true,
    ),
  updateAudioSettings: (audioSettings: AudioPreferenceSettings) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ audio_settings: audioSettings }),
      },
      true,
    ),
  updateTokenAppearance: (tokenAppearance: TokenAppearanceSettings) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ token_appearance: tokenAppearance }),
      },
      true,
    ),
  updateAutomationSettings: (
    automationSettings: AutomationPreferenceSettings,
  ) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ automation_settings: automationSettings }),
      },
      true,
    ),
  updateVisualEffects: (visualEffects: VisualEffectsPreferenceSettings) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ visual_effects: visualEffects }),
      },
      true,
    ),
  updatePlayerSort: (playerSort: PlayerSortOption) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ player_sort: playerSort }),
      },
      true,
    ),
  updateGameView: (gameView: GameViewPreferenceSettings) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ game_view: gameView }),
      },
      true,
    ),
  updateColorTheme: (colorTheme: GameColorThemeId) =>
    request<UserPreferences>(
      '/users/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify({ color_theme: colorTheme }),
      },
      true,
    ),
  createGame: (
    packId: string,
    version?: string,
    deckCollectionIds: Record<string, string[]> = {},
    economicDifficulty: EconomicDifficulty = 'standard',
    advancedEconomyEnabled = true,
  ) =>
    request<GameState>(
      '/games',
      {
        method: 'POST',
        body: JSON.stringify({
          pack_id: packId,
          ...(version ? { version } : {}),
          deck_collection_ids: deckCollectionIds,
          economic_difficulty: economicDifficulty,
          advanced_economy_enabled: advancedEconomyEnabled,
        }),
      },
      true,
    ),
  getGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}`, {}, true),
  getBoardHistory: (gameId: string) =>
    request<BoardHistoricalStats>(`/games/${gameId}/board-history`, {}, true),
  analyzeTrade: (gameId: string, tradeId: string) =>
    request<TradeAnalysis>(
      `/games/${gameId}/trades/${tradeId}/analysis`,
      {},
      true,
    ),
  listActiveGames: () => request<GameState[]>('/games/me/active', {}, true),
  joinGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}/players`, { method: 'POST' }, true),
  addBot: (
    gameId: string,
    controller: BotController,
    personality: BotPersonality,
    displayName?: string,
  ) =>
    request<GameState>(
      `/games/${gameId}/bots`,
      {
        method: 'POST',
        body: JSON.stringify({
          controller,
          personality,
          ...(displayName?.trim() ? { display_name: displayName.trim() } : {}),
        }),
      },
      true,
    ),
  fillWithRandomBots: (gameId: string) =>
    request<GameState>(
      `/games/${gameId}/bots/fill`,
      { method: 'POST' },
      true,
    ),
  removeBot: (gameId: string, botId: string) =>
    request<GameState>(
      `/games/${gameId}/bots/${botId}`,
      { method: 'DELETE' },
      true,
    ),
  watchGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}/spectators`, { method: 'POST' }, true),
  updateGameSettings: (
    gameId: string,
    data: {
      max_players?: number
      allow_spectators?: boolean
      auction_deposit_percent?: number
      auction_minimum_bid_percent?: number
      economic_difficulty?: EconomicDifficulty
      advanced_economy_enabled?: boolean
      operating_cost_percent?: number
      finale_trigger_week?: number
      finale_duration_weeks?: number
      finale_vote_interval_weeks?: number
      rules?: Partial<OptionalRules>
    },
  ) =>
    request<GameState>(
      `/games/${gameId}/settings`,
      { method: 'PATCH', body: JSON.stringify(data) },
      true,
    ),
  leaveGame: (gameId: string) =>
    request<GameState>(
      `/games/${gameId}/members/me`,
      { method: 'DELETE' },
      true,
    ),
  startGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}/start`, { method: 'POST' }, true),
  executeCommand: (
    gameId: string,
    command: GameCommand,
    expectedSequence: number,
    commandId = createCommandId(),
  ) =>
    request<GameState>(
      `/games/${gameId}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({
          command,
          expected_sequence: expectedSequence,
          command_id: commandId,
        }),
      },
      true,
    ),
}

async function refreshAccessToken(): Promise<TokenResponse> {
  if (!refreshPromise) {
    const generationAtStart = authGeneration
    const userIdAtStart = authenticatedUserId
    refreshPromise = request<TokenResponse>(
      '/auth/refresh',
      { method: 'POST' },
      false,
      false,
    )
      .then((token) => {
        if (authGeneration !== generationAtStart) {
          throw new ApiError('Authentication state changed', 401)
        }
        if (userIdAtStart && token.user_id !== userIdAtStart) {
          authToken.clear()
          throw new ApiError('Authenticated account changed', 401)
        }
        authToken.set(token.access_token, token.user_id)
        return token
      })
      .catch((error) => {
        if (authGeneration === generationAtStart) authToken.clear()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}
