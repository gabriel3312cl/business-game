import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fab,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  type FormEvent,
  type KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameState, User } from '../types'
import { advisorApi } from './api'
import { buildAdvisorSuggestions } from './suggestions'
import type { AdvisorDisplayMessage } from './types'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
}

const AdvisorMarkdown = lazy(() => import('./AdvisorMarkdown'))

export function GameAdvisorChat({ game, pack, user }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<AdvisorDisplayMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const nextMessageId = useRef(1)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const currentSequence = game.events.at(-1)?.sequence ?? 0
  const isParticipant = game.players.some((player) => player.user_id === user.id)
  const suggestions = useMemo(
    () => buildAdvisorSuggestions(game, pack, user.id, i18n.language),
    [game, i18n.language, pack, user.id],
  )

  useEffect(() => {
    let active = true
    setHistoryLoading(true)
    setError(false)
    void advisorApi
      .history(game.id)
      .then(({ messages: storedMessages }) => {
        if (!active) return
        const restored = storedMessages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          snapshotSequence: message.snapshot_sequence ?? undefined,
        }))
        setMessages(restored)
        nextMessageId.current = Math.max(0, ...restored.map((message) => message.id)) + 1
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [game.id, user.id])

  if (!isParticipant) return null

  const sendQuestion = async (rawQuestion: string) => {
    const content = rawQuestion.trim()
    if (!content || busy || historyLoading) return
    const userMessage: AdvisorDisplayMessage = {
      id: nextMessageId.current++,
      role: 'user',
      content,
    }
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setBusy(true)
    setError(false)
    queueMicrotask(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    try {
      const response = await advisorApi.ask(game.id, { question: content })
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId.current++,
          role: 'assistant',
          content: response.answer,
          snapshotSequence: response.snapshot_sequence,
        },
      ])
      queueMicrotask(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void sendQuestion(question)
  }

  const submitWithEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendQuestion(question)
    }
  }

  return (
    <>
      {!open && (
        <Tooltip title={t('advisor.open')} placement="left">
          <Fab
            color="secondary"
            aria-label={t('advisor.open')}
            onClick={() => setOpen(true)}
            sx={{
              position: 'fixed',
              right: { xs: 12, sm: 20 },
              bottom: { xs: 'calc(82px + env(safe-area-inset-bottom))', sm: 20 },
              zIndex: 1400,
              boxShadow: '0 14px 38px rgba(0,0,0,.5)',
            }}
          >
            <AutoAwesomeRoundedIcon />
          </Fab>
        </Tooltip>
      )}

      {open && (
        <Paper
          elevation={18}
          role="dialog"
          aria-label={t('advisor.title')}
          sx={{
            position: 'fixed',
            zIndex: 1400,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(184,255,61,.2)',
            boxShadow: '0 22px 70px rgba(0,0,0,.65)',
            inset: {
              xs: '12px 12px calc(76px + env(safe-area-inset-bottom)) 12px',
              sm: 'auto 20px 20px auto',
            },
            width: { sm: 420 },
            height: { sm: 'min(620px, calc(100dvh - 40px))' },
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid rgba(255,255,255,.08)' }}
          >
            <AutoAwesomeRoundedIcon color="secondary" />
            <Box flex={1} minWidth={0}>
              <Typography fontWeight={900}>{t('advisor.title')}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('advisor.readOnly')}
              </Typography>
            </Box>
            <IconButton aria-label={t('advisor.close')} onClick={() => setOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
            {historyLoading && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  {t('advisor.loadingHistory')}
                </Typography>
              </Stack>
            )}
            {!historyLoading && messages.length === 0 && (
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  {t('advisor.intro')}
                </Typography>
                <Typography variant="overline" color="secondary.light">
                  {t('advisor.suggestions')}
                </Typography>
                <Stack spacing={0.75}>
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outlined"
                      color="inherit"
                      size="small"
                      disabled={busy || historyLoading}
                      onClick={() => void sendQuestion(suggestion)}
                      sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            )}

            <Stack spacing={1.1}>
              {messages.map((message) => {
                const stale =
                  message.role === 'assistant' &&
                  message.snapshotSequence !== undefined &&
                  message.snapshotSequence < currentSequence
                return (
                  <Stack
                    key={message.id}
                    alignItems={message.role === 'user' ? 'flex-end' : 'flex-start'}
                    spacing={0.4}
                  >
                    <Paper
                      variant="outlined"
                      sx={{
                        px: 1.25,
                        py: 1,
                        maxWidth: '90%',
                        bgcolor:
                          message.role === 'user'
                            ? 'rgba(157,140,255,.14)'
                            : 'rgba(255,255,255,.035)',
                        borderColor:
                          message.role === 'user'
                            ? 'rgba(157,140,255,.35)'
                            : 'rgba(255,255,255,.09)',
                      }}
                    >
                      {message.role === 'assistant' ? (
                        <Suspense
                          fallback={
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                              {message.content}
                            </Typography>
                          }
                        >
                          <AdvisorMarkdown>{message.content}</AdvisorMarkdown>
                        </Suspense>
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {message.content}
                        </Typography>
                      )}
                    </Paper>
                    {stale && (
                      <Chip size="small" variant="outlined" label={t('advisor.stale')} />
                    )}
                  </Stack>
                )
              })}
              {busy && (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    {t('advisor.thinking')}
                  </Typography>
                </Stack>
              )}
              <Box ref={messagesEndRef} />
            </Stack>
          </Box>

          <Box
            component="form"
            onSubmit={submit}
            sx={{ p: 1.25, borderTop: '1px solid rgba(255,255,255,.08)' }}
          >
            {error && (
              <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setError(false)}>
                {t('advisor.unavailable')}
              </Alert>
            )}
            <Stack direction="row" spacing={0.75} alignItems="flex-end">
              <TextField
                fullWidth
                multiline
                maxRows={4}
                size="small"
                value={question}
                disabled={busy || historyLoading}
                placeholder={t('advisor.placeholder')}
                inputProps={{ maxLength: 1000 }}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={submitWithEnter}
              />
              <IconButton
                type="submit"
                color="secondary"
                disabled={busy || historyLoading || !question.trim()}
                aria-label={t('advisor.send')}
              >
                <SendRoundedIcon />
              </IconButton>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
              {t('advisor.disclaimer')}
            </Typography>
          </Box>
        </Paper>
      )}
    </>
  )
}
