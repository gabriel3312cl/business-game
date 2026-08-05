export type ChatAuthorKind = 'player' | 'bot' | 'system'

export interface ChatMessage {
  id: number
  game_id: string
  author_id: string | null
  author_name: string
  author_kind: ChatAuthorKind
  is_bot: boolean
  body: string
  /** When set, clients translate `chat.<template_key>` instead of showing `body`. */
  template_key: string | null
  template_params: Record<string, string | number>
  created_at: string
}

export interface ChatHistoryResponse {
  messages: ChatMessage[]
  has_more: boolean
}

export interface ChatMessageCreate {
  body: string
}
