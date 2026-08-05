export interface AdvisorHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AdvisorRequest {
  question: string
}

export interface AdvisorResponse {
  answer: string
  snapshot_sequence: number
}

export interface AdvisorDisplayMessage extends AdvisorHistoryMessage {
  id: number
  snapshotSequence?: number
}

export interface AdvisorStoredMessage extends AdvisorHistoryMessage {
  id: number
  snapshot_sequence: number | null
  created_at: string
}

export interface AdvisorHistoryResponse {
  messages: AdvisorStoredMessage[]
}
