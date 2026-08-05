import { useCallback, useEffect, useState } from 'react'
import { chatApi } from './api'
import type { ChatMessage } from './types'

export interface GameChat {
  messages: ChatMessage[]
  hasMore: boolean
  loading: boolean
  loadingOlder: boolean
  error: boolean
  /** Stable, so the socket effect can subscribe without re-running. */
  receive: (message: ChatMessage) => void
  loadOlder: () => void
  dismissError: () => void
}

/** Owns the room's message list: the first page, older pages, and live arrivals. */
export function useGameChat(gameId: string): GameChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState(false)

  const receive = useCallback((message: ChatMessage) => {
    // Ids are monotonic per room, so they double as dedup key and sort key: the
    // REST fallback and the room broadcast can deliver the same message twice.
    setMessages((current) =>
      current.some((item) => item.id === message.id)
        ? current
        : [...current, message].sort((first, second) => first.id - second.id),
    )
  }, [])

  useEffect(() => {
    let active = true
    setMessages([])
    setHasMore(false)
    setError(false)
    setLoading(true)
    void chatApi
      .history(gameId)
      .then((page) => {
        if (!active) return
        setMessages(page.messages)
        setHasMore(page.has_more)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [gameId])

  const oldestId = messages[0]?.id
  const loadOlder = useCallback(() => {
    if (oldestId === undefined || loadingOlder) return
    setLoadingOlder(true)
    void chatApi
      .history(gameId, { beforeId: oldestId })
      .then((page) => {
        setMessages((current) => {
          const seen = new Set(current.map((item) => item.id))
          return [...page.messages.filter((item) => !seen.has(item.id)), ...current]
        })
        setHasMore(page.has_more)
      })
      .catch(() => setError(true))
      .finally(() => setLoadingOlder(false))
  }, [gameId, loadingOlder, oldestId])

  const dismissError = useCallback(() => setError(false), [])

  return {
    messages,
    hasMore,
    loading,
    loadingOlder,
    error,
    receive,
    loadOlder,
    dismissError,
  }
}
