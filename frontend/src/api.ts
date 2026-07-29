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
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof URLSearchParams)) {
    headers.set('Content-Type', 'application/json')
  }
  if (authenticated) {
    const token = authToken.get()
    if (!token) {
      throw new ApiError('Authentication required', 401)
    }
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
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

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const activeGameSession = {
  get: () => localStorage.getItem(ACTIVE_GAME_KEY),
  set: (gameId: string) => localStorage.setItem(ACTIVE_GAME_KEY, gameId),
  clear: () => localStorage.removeItem(ACTIVE_GAME_KEY),
}

export const api = {
  listPacks: () => request<PackManifest[]>('/packs'),
  getPack: (packId: string, locale: string) =>
    request<ContentPack>(`/packs/${packId}?locale=${locale}`),
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
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/token', {
      method: 'POST',
      body: new URLSearchParams({ username: email, password }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  me: () => request<User>('/auth/me', {}, true),
  createGame: (packId: string) =>
    request<GameState>(
      '/games',
      { method: 'POST', body: JSON.stringify({ pack_id: packId }) },
      true,
    ),
  getGame: (gameId: string) =>
    request<GameState>(`/games/${gameId}`, {}, true),
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
