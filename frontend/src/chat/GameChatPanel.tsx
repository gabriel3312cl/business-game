import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameState, User } from '../types'
import { CHAT_MAX_BODY_CHARS } from './api'
import type { ChatMessage } from './types'
import type { GameChat } from './useGameChat'

interface Props {
  game: GameState
  user: User
  chat: GameChat
  busy?: boolean
  compact?: boolean
  onSend: (body: string) => Promise<boolean>
}

export function GameChatPanel({
  game,
  user,
  chat,
  busy = false,
  compact = false,
  onSend,
}: Props) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const lastMessageId = chat.messages.at(-1)?.id ?? 0
  const bots = game.players.filter((player) => player.is_bot && !player.bankrupt)
  const isMember =
    game.players.some((player) => player.user_id === user.id) ||
    game.spectators.some((spectator) => spectator.user_id === user.id)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lastMessageId])

  const send = async (raw: string) => {
    const body = raw.trim()
    if (!body || sending || busy) return
    setSending(true)
    setSendFailed(false)
    try {
      // The room broadcast echoes back to the sender, so nothing is appended here.
      const delivered = await onSend(body)
      if (delivered) setDraft('')
      else setSendFailed(true)
    } finally {
      setSending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const submitWithEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(draft)
    }
  }

  const mention = (name: string) =>
    setDraft((current) => (current.includes(`@${name}`) ? current : `@${name} ${current}`.trim()))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {!compact && (
        <>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <ForumRoundedIcon fontSize="small" color="secondary" />
            <Typography fontWeight={800}>{t('chat.title')}</Typography>
          </Stack>
        </>
      )}

      {chat.error && (
        <Alert severity="warning" sx={{ mt: 1 }} onClose={chat.dismissError}>
          {t('chat.unavailable')}
        </Alert>
      )}

      <Box
        sx={{
          mt: 1,
          maxHeight: compact ? { xs: 180, sm: 220 } : { xs: 240, md: 260, xl: 300 },
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {chat.loading ? (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              {t('chat.loading')}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={0.85}>
            {chat.hasMore && (
              <Button
                size="small"
                color="inherit"
                disabled={chat.loadingOlder}
                onClick={chat.loadOlder}
              >
                {chat.loadingOlder ? t('chat.loadingOlder') : t('chat.loadOlder')}
              </Button>
            )}
            {chat.messages.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('chat.empty')}
              </Typography>
            )}
            {chat.messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                mine={message.author_id === user.id}
                locale={i18n.language}
              />
            ))}
            <Box ref={messagesEndRef} />
          </Stack>
        )}
      </Box>

      {isMember && (
        <Box component="form" onSubmit={submit} sx={{ mt: 1 }}>
          {sendFailed && (
            <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setSendFailed(false)}>
              {t('chat.sendFailed')}
            </Alert>
          )}
          {bots.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.75 }}>
              {bots.map((bot) => (
                <Chip
                  key={bot.user_id}
                  size="small"
                  variant="outlined"
                  icon={<SmartToyRoundedIcon />}
                  label={bot.display_name}
                  aria-label={t('chat.mention', { name: bot.display_name })}
                  onClick={() => mention(bot.display_name)}
                />
              ))}
            </Stack>
          )}
          <Stack direction="row" spacing={0.5} alignItems="flex-end">
            <TextField
              fullWidth
              multiline
              maxRows={3}
              size="small"
              value={draft}
              disabled={sending || busy}
              placeholder={t('chat.placeholder')}
              inputProps={{ maxLength: CHAT_MAX_BODY_CHARS }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={submitWithEnter}
            />
            <IconButton
              type="submit"
              color="secondary"
              disabled={sending || busy || !draft.trim()}
              aria-label={t('chat.send')}
            >
              <SendRoundedIcon />
            </IconButton>
          </Stack>
          {!compact && (
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              {bots.length > 0 ? t('chat.addressHint') : t('chat.disclaimer')}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

interface BubbleProps {
  message: ChatMessage
  mine: boolean
  locale: string
}

function ChatBubble({ message, mine, locale }: BubbleProps) {
  const { t } = useTranslation()
  const isSystem = message.author_kind === 'system'
  const author = isSystem ? t('chat.system') : message.author_name

  return (
    <Stack alignItems={mine ? 'flex-end' : 'flex-start'} spacing={0.25}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 0.25 }}>
        <Typography variant="caption" fontWeight={800} color="text.secondary" noWrap>
          {mine ? t('chat.you') : author}
        </Typography>
        {message.is_bot && (
          <Chip
            size="small"
            label={t('chat.botTag')}
            sx={{ height: 16, '& .MuiChip-label': { px: 0.5, fontSize: '0.6rem' } }}
          />
        )}
        <Typography variant="caption" color="text.disabled">
          {formatTime(message.created_at, locale)}
        </Typography>
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          px: 1.1,
          py: 0.7,
          maxWidth: '92%',
          bgcolor: message.is_bot
            ? 'rgba(184,255,61,.09)'
            : mine
              ? 'rgba(157,140,255,.14)'
              : 'rgba(255,255,255,.035)',
          borderColor: message.is_bot
            ? 'rgba(184,255,61,.28)'
            : mine
              ? 'rgba(157,140,255,.35)'
              : 'rgba(255,255,255,.09)',
        }}
      >
        {/* Plain text only: React escapes it, and no markup is ever interpreted. */}
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {messageText(message, t)}
        </Typography>
      </Paper>
    </Stack>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function messageText(message: ChatMessage, t: Translate): string {
  const text = message.template_key
    ? t(`chat.${message.template_key}`, {
        ...message.template_params,
        defaultValue: message.body,
      })
    : message.body
  return text.length > CHAT_MAX_BODY_CHARS
    ? `${text.slice(0, CHAT_MAX_BODY_CHARS)}…`
    : text
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
