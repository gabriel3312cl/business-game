import PhoneInTalkRoundedIcon from '@mui/icons-material/PhoneInTalkRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import type {
  ContentPack,
  GameCommand,
  GameState,
  User,
  VisualEffectsIntensity,
} from '../types'

const BOT_RESULT_SECONDS = 1.5
const BOT_RESULT_COUNTDOWN_STEP = 0.5

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  onCommand: (command: GameCommand) => Promise<boolean>
  motionIntensity?: VisualEffectsIntensity
  visible?: boolean
}

export function GameCardChoiceDialog({
  game,
  pack,
  user,
  busy,
  error,
  onCommand,
  motionIntensity = 'full',
  visible = true,
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const pending = game.pending_card_choice
  const result = game.pending_card_choice_result
  const displayedChoice = pending ?? result
  const showingResult = result !== null
  const chooser = game.players.find(
    (player) => player.user_id === displayedChoice?.player_id,
  )
  const resultIsBot = showingResult && chooser?.is_bot === true
  const resultSequence = result?.resolved_sequence
  const [resultSeconds, setResultSeconds] = useState(BOT_RESULT_SECONDS)

  useEffect(() => {
    if (resultSequence === undefined) return
    setResultSeconds(BOT_RESULT_SECONDS)
  }, [resultSequence])

  useEffect(() => {
    if (!resultIsBot || resultSeconds <= 0) return
    const timer = window.setTimeout(
      () =>
        setResultSeconds((current) =>
          Math.max(0, current - BOT_RESULT_COUNTDOWN_STEP),
        ),
      BOT_RESULT_COUNTDOWN_STEP * 1000,
    )
    return () => window.clearTimeout(timer)
  }, [resultIsBot, resultSeconds])

  if (!visible || !displayedChoice) return null

  const card = pack.board.decks
    .flatMap((deck) => deck.cards)
    .find((candidate) => candidate.id === displayedChoice.card_id)
  const canChoose = pending?.player_id === user.id
  const canAcknowledgeResult =
    result !== null && result.player_id === user.id && !resultIsBot

  return (
    <Dialog
      open
      transitionDuration={motionIntensity === 'off' ? 0 : motionIntensity === 'soft' ? 140 : 240}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      disableEscapeKeyDown
      aria-labelledby="card-choice-title"
      slotProps={{
        paper: {
          sx: {
            background:
              'linear-gradient(155deg, rgba(31,25,50,.99), rgba(12,11,22,.99))',
            border: '1px solid rgba(255,209,102,.3)',
            perspective: '900px',
            animation:
              motionIntensity === 'off'
                ? undefined
                : motionIntensity === 'soft'
                  ? 'choice-dialog-soft 360ms ease-out'
                  : 'choice-dialog-reveal 680ms cubic-bezier(.2,.78,.2,1)',
            '@keyframes choice-dialog-soft': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
            '@keyframes choice-dialog-reveal': {
              from: { opacity: 0, transform: 'translateY(28px) rotateY(72deg) scale(.9)' },
              '70%': { opacity: 1, transform: 'translateY(-3px) rotateY(-3deg) scale(1.015)' },
              to: { opacity: 1, transform: 'translateY(0) rotateY(0deg) scale(1)' },
            },
          },
        },
      }}
    >
      <DialogTitle id="card-choice-title">
        <Stack direction="row" spacing={1.25} alignItems="center">
          {showingResult ? (
            <TaskAltRoundedIcon color="success" />
          ) : (
            <PhoneInTalkRoundedIcon color="warning" />
          )}
          <Box>
            <Typography variant="h6" fontWeight={850}>
              {t(showingResult ? 'cardChoice.resultTitle' : 'cardChoice.title')}
            </Typography>
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={t(`cardChoice.category.${displayedChoice.effect.category}`)}
              sx={{ mt: 0.5 }}
            />
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.25}>
          {card && (
            <Box
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: '1px solid rgba(255,209,102,.38)',
                borderLeft: '6px solid #ffd166',
                bgcolor: 'rgba(255,209,102,.08)',
                boxShadow: '0 14px 38px rgba(0,0,0,.28)',
                animation:
                  motionIntensity === 'full'
                    ? 'choice-card-flip 760ms cubic-bezier(.2,.8,.2,1) both'
                    : undefined,
                '@keyframes choice-card-flip': {
                  from: { opacity: 0, transform: 'rotateY(90deg) scale(.82)' },
                  '72%': { opacity: 1, transform: 'rotateY(-4deg) scale(1.02)' },
                  to: { opacity: 1, transform: 'rotateY(0deg) scale(1)' },
                },
              }}
            >
              <Typography color="warning.light" fontWeight={750}>
                {pack.messages[card.message_key] ?? displayedChoice.card_id}
              </Typography>
            </Box>
          )}
          <Typography variant="h5" fontWeight={800} lineHeight={1.35}>
            {pack.messages[displayedChoice.effect.prompt_key] ??
              displayedChoice.effect.prompt_key}
          </Typography>
          {showingResult && result && (
            <Stack
              spacing={1.5}
              aria-live="assertive"
              sx={{
                animation:
                  motionIntensity === 'off'
                    ? undefined
                    : 'choice-result-enter 420ms cubic-bezier(.2,.8,.2,1) both',
                '@keyframes choice-result-enter': {
                  from: { opacity: 0, transform: 'translateY(12px) scale(.98)' },
                  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
                },
              }}
            >
              <Typography fontWeight={800} color="success.light">
                {t('cardChoice.chosenResult', {
                  player: chooser?.display_name ?? t('bank'),
                  choice:
                    pack.messages[result.choice_label_key] ??
                    result.choice_label_key,
                })}
              </Typography>
              <Alert severity="info" variant="filled" sx={{ fontSize: '1rem' }}>
                {pack.messages[result.result_key] ?? result.result_key}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {t('cardChoice.resultApplied')}
              </Typography>
              {!canAcknowledgeResult && (
                <Alert severity="info">
                  {resultIsBot
                    ? t('cardChoice.botResultContinuing', {
                        player: chooser?.display_name ?? t('bank'),
                        seconds: resultSeconds,
                      })
                    : t('cardChoice.waitingForResult', {
                        player: chooser?.display_name ?? t('bank'),
                      })}
                </Alert>
              )}
            </Stack>
          )}
          {!showingResult && !canChoose && (
            <Alert severity="info">
              {t('cardChoice.waiting', {
                player: chooser?.display_name ?? t('bank'),
              })}
            </Alert>
          )}
          {!showingResult && error && canChoose && (
            <Alert severity="warning">{error}</Alert>
          )}
          {!showingResult && <Stack
            spacing={1.25}
            sx={{
              animation:
                motionIntensity === 'full'
                  ? 'choice-options-enter 320ms ease-out 480ms both'
                  : motionIntensity === 'soft'
                    ? 'choice-options-soft 220ms ease-out both'
                    : undefined,
              '@keyframes choice-options-enter': {
                from: { opacity: 0, transform: 'translateY(10px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              '@keyframes choice-options-soft': {
                from: { opacity: 0 },
                to: { opacity: 1 },
              },
            }}
          >
            {displayedChoice.effect.choices.map((choice, index) => (
              <Button
                key={choice.id}
                variant={index === 0 ? 'contained' : 'outlined'}
                color={index === 0 ? 'warning' : 'inherit'}
                disabled={busy || !canChoose}
                onClick={() =>
                  void onCommand({
                    action: 'resolve_card_choice',
                    choice_id: choice.id,
                  })
                }
                sx={{
                  justifyContent: 'flex-start',
                  minHeight: 54,
                  px: 2,
                  textAlign: 'left',
                  textTransform: 'none',
                  fontWeight: 750,
                  transition:
                    motionIntensity === 'off'
                      ? 'none'
                      : 'transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease',
                  '&:hover': {
                    transform:
                      motionIntensity === 'off' ? undefined : 'translateY(-2px)',
                    boxShadow:
                      motionIntensity === 'off'
                        ? undefined
                        : '0 8px 20px rgba(0,0,0,.24)',
                  },
                }}
              >
                {pack.messages[choice.label_key] ?? choice.id}
              </Button>
            ))}
          </Stack>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {showingResult && canAcknowledgeResult ? (
          <Button
            fullWidth
            size="large"
            variant="contained"
            color="success"
            disabled={busy}
            onClick={() =>
              void onCommand({ action: 'continue_card_choice_result' })
            }
            sx={{ fontWeight: 850 }}
          >
            {t('cardChoice.acknowledgeResult')}
          </Button>
        ) : !showingResult ? (
          <Typography variant="caption" color="text.secondary">
            {canChoose
              ? t('cardChoice.consequenceHint')
              : t('cardChoice.onlyChooser')}
          </Typography>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
