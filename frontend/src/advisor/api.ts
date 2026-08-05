import { authenticatedRequest } from '../api'
import type {
  AdvisorHistoryResponse,
  AdvisorRequest,
  AdvisorResponse,
} from './types'

export const advisorApi = {
  history: (gameId: string) =>
    authenticatedRequest<AdvisorHistoryResponse>(`/games/${gameId}/advisor/history`),
  ask: (gameId: string, data: AdvisorRequest) =>
    authenticatedRequest<AdvisorResponse>(`/games/${gameId}/advisor`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
