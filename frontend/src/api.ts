import type {
  ContentPack,
  GameCommand,
  GameState,
  OptionalRules,
  PackManifest,
  TokenResponse,
  User,
} from './types'

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

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false,
  retryAuthentication = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof URLSearchParams)) {
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
      detail?: string
    } | null
    throw new ApiError(body?.detail ?? `API error ${response.status}`, response.status)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
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
  createGame: (packId: string, version?: string) =>
    request<GameState>(
      '/games',
      {
        method: 'POST',
        body: JSON.stringify({ pack_id: packId, ...(version ? { version } : {}) }),
      },
      true,
    ),
  getGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}`, {}, true),
  listActiveGames: () => request<GameState[]>('/games/me/active', {}, true),
  joinGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}/players`, { method: 'POST' }, true),
  watchGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}/spectators`, { method: 'POST' }, true),
  updateGameSettings: (
    gameId: string,
    data: {
      max_players?: number
      allow_spectators?: boolean
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
  executeCommand: (gameId: string, command: GameCommand) =>
    request<GameState>(
      `/games/${gameId}/commands`,
      { method: 'POST', body: JSON.stringify(command) },
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
