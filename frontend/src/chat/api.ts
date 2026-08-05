import { authenticatedRequest } from '../api'
import type { ChatHistoryResponse, ChatMessage } from './types'

export const CHAT_MAX_BODY_CHARS = 400

export const chatApi = {
  history: (gameId: string, options: { beforeId?: number; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (options.beforeId !== undefined) query.set('before_id', String(options.beforeId))
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return authenticatedRequest<ChatHistoryResponse>(`/games/${gameId}/chat${suffix}`)
  },
  send: (gameId: string, body: string) =>
    authenticatedRequest<ChatMessage>(`/games/${gameId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
}
