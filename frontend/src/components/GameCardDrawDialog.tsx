import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameState,
  User,
  VisualEffectsIntensity,
} from '../types'

const FAN_CARD_COUNT = 7
const HUMAN_AUTO_CONTINUE_SECONDS = 10
const BOT_AUTO_CONTINUE_SECONDS = 3

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  onCommand: (command: GameCommand) => Promise<boolean>
  motionIntensity?: VisualEffectsIntensity
}

export function GameCardDrawDialog({
  game,
  pack,
  user,
  busy,
  error,
  onCommand,
  motionIntensity = 'full',
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const pending = game.pending_card_draw
  const drawSequence = pending?.draw_sequence
  const revealSequence = pending?.reveal_sequence
  const drawer = game.players.find(
    (player) => player.user_id === pending?.player_id,
  )
  const autoContinueSeconds = drawer?.is_bot
    ? BOT_AUTO_CONTINUE_SECONDS
    : HUMAN_AUTO_CONTINUE_SECONDS
  const [fanReady, setFanReady] = useState(false)
  const [seconds, setSeconds] = useState(autoContinueSeconds)
  const choiceSubmittedRef = useRef(false)
  const continueSubmittedRef = useRef(false)

  const deck = pack.board.decks.find((item) => item.id === pending?.deck_id)
  const card = deck?.cards.find((item) => item.id === pending?.card_id)
  const selectedIndex = pending?.selected_index ?? (pending?.card_id ? 0 : null)
  const revealed = card !== undefined && selectedIndex !== null
  const canContinue = pending?.player_id === user.id
  const drawerName = drawer?.display_name ?? t('bank')
  const deckName = deck?.name_key
    ? pack.messages[deck.name_key] ?? deck.id
    : deck?.id ?? ''
  const shuffleDelay =
    motionIntensity === 'off' ? 0 : motionIntensity === 'soft' ? 650 : 1450

  const chooseCard = useCallback(async (cardIndex: number) => {
    if (!canContinue || !fanReady || choiceSubmittedRef.current) return
    choiceSubmittedRef.current = true
    const accepted = await onCommand({
      action: 'choose_card',
      card_index: cardIndex,
    })
    if (!accepted) choiceSubmittedRef.current = false
  }, [canContinue, fanReady, onCommand])

  const continueCard = useCallback(async () => {
    if (!canContinue || continueSubmittedRef.current) return
    continueSubmittedRef.current = true
    const accepted = await onCommand({ action: 'continue_card' })
    if (!accepted) continueSubmittedRef.current = false
  }, [canContinue, onCommand])

  useEffect(() => {
    if (drawSequence === undefined) return
    choiceSubmittedRef.current = false
    continueSubmittedRef.current = false
    setFanReady(false)
    setSeconds(autoContinueSeconds)
    const shuffleTimer = window.setTimeout(() => setFanReady(true), shuffleDelay)
    return () => window.clearTimeout(shuffleTimer)
  }, [autoContinueSeconds, drawSequence, shuffleDelay])

  useEffect(() => {
    if (revealSequence === undefined || revealSequence === null) return
    continueSubmittedRef.current = false
    setSeconds(autoContinueSeconds)
  }, [autoContinueSeconds, revealSequence])

  useEffect(() => {
    if (drawSequence === undefined || !revealed || seconds <= 0) return
    const countdown = window.setTimeout(
      () => setSeconds((current) => Math.max(0, current - 1)),
      1000,
    )
    return () => window.clearTimeout(countdown)
  }, [drawSequence, revealed, seconds])

  useEffect(() => {
    if (pending && revealed && seconds === 0 && canContinue && !busy) {
      void continueCard()
    }
  }, [busy, canContinue, continueCard, pending, revealed, seconds])

  if (!pending || !deck) return null

  const opportunity = pending.deck_id === 'opportunity'
  const accent = opportunity ? '#ffd166' : '#77e6d0'
  const accentDark = opportunity ? '#7b4f00' : '#075f58'
  const cardCount = Math.min(pending.offer_count, FAN_CARD_COUNT)

  return (
    <Dialog
      open
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown
      aria-labelledby="card-draw-title"
      transitionDuration={motionIntensity === 'off' ? 0 : 220}
      slotProps={{
        paper: {
          sx: {
            overflow: 'hidden',
            background:
              'radial-gradient(circle at 50% 25%, rgba(55,43,91,.98), rgba(12,11,23,.995) 72%)',
            border: `1px solid ${accent}66`,
            boxShadow: `0 28px 90px rgba(0,0,0,.72), 0 0 42px ${accent}1f`,
          },
        },
      }}
    >
      <DialogTitle id="card-draw-title">
        <Stack direction="row" spacing={1.25} alignItems="center">
          <CasinoRoundedIcon sx={{ color: accent }} />
          <Box>
            <Typography variant="h6" fontWeight={900}>
              {t('cardDraw.title', { deck: deckName })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {revealed
                ? t('cardDraw.readingBy', { player: drawerName })
                : t('cardDraw.drawnBy', { player: drawerName })}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ overflow: 'hidden' }}>
        <Stack spacing={2} alignItems="center">
          <Box
            aria-label={t('cardDraw.fanLabel', { deck: deckName })}
            sx={{
              position: 'relative',
              width: '100%',
              height: { xs: 245, sm: 305 },
              perspective: '1200px',
              mt: 1,
            }}
          >
            {Array.from({ length: cardCount }, (_, index) => {
              const selected = index === selectedIndex
              const center = (cardCount - 1) / 2
              const distance = index - center
              const offset = distance * (fullScreen ? 31 : 47)
              const angle = distance * 8
              const fanTransform = `translateX(calc(-50% + ${offset}px)) translateY(${Math.abs(distance) * 8}px) rotate(${angle}deg)`
              const revealTransform = selected
                ? 'translateX(-50%) translateY(-4px) rotate(0deg) scale(1.08)'
                : `translateX(calc(-50% + ${offset * 1.35}px)) translateY(58px) rotate(${angle * 1.4}deg) scale(.82)`
              return (
                <Box
                  key={`${pending.draw_sequence}:${index}`}
                  component="button"
                  type="button"
                  aria-label={t('cardDraw.choosePosition', { position: index + 1 })}
                  disabled={!canContinue || !fanReady || revealed || busy}
                  onClick={() => void chooseCard(index)}
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: { xs: 18, sm: 22 },
                    width: { xs: 132, sm: 168 },
                    height: { xs: 194, sm: 244 },
                    zIndex: revealed && selected ? 20 : index,
                    opacity: revealed && !selected ? 0.18 : 1,
                    transform: revealed ? revealTransform : fanTransform,
                    transformStyle: 'preserve-3d',
                    appearance: 'none',
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    color: 'inherit',
                    cursor:
                      canContinue && fanReady && !revealed && !busy
                        ? 'pointer'
                        : 'default',
                    transition:
                      motionIntensity === 'off'
                        ? 'none'
                        : 'transform 760ms cubic-bezier(.2,.82,.2,1), opacity 520ms ease',
                    animation:
                      !fanReady && motionIntensity === 'full'
                        ? `card-fan-shuffle 620ms ease-in-out ${index * 70}ms both`
                        : undefined,
                    '&:not(:disabled):hover': {
                      mt: -1.5,
                      filter: `drop-shadow(0 0 12px ${accent}99)`,
                    },
                    '&:focus-visible': {
                      outline: `3px solid ${accent}`,
                      outlineOffset: 4,
                    },
                    '@keyframes card-fan-shuffle': {
                      '0%': { marginLeft: 0, marginTop: 18, filter: 'brightness(.72)' },
                      '45%': { marginLeft: index % 2 ? 24 : -24, marginTop: -10, filter: 'brightness(1.35)' },
                      '100%': { marginLeft: 0, marginTop: 0, filter: 'brightness(1)' },
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      transformStyle: 'preserve-3d',
                      transform: revealed && selected ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      transition:
                        motionIntensity === 'off'
                          ? 'none'
                          : 'transform 820ms cubic-bezier(.2,.78,.2,1) 280ms',
                    }}
                  >
                    <CardFace
                      accent={accent}
                      accentDark={accentDark}
                      front={false}
                    >
                      <AutoAwesomeRoundedIcon sx={{ fontSize: 46 }} />
                      <Typography fontWeight={950} textAlign="center">
                        {deckName}
                      </Typography>
                    </CardFace>
                    <CardFace accent={accent} accentDark={accentDark} front>
                      {selected && card?.title_key && (
                        <Typography
                          variant="overline"
                          color="text.secondary"
                          fontWeight={850}
                        >
                          {pack.messages[card.title_key]}
                        </Typography>
                      )}
                      <Typography
                        fontWeight={850}
                        textAlign="center"
                        lineHeight={1.35}
                        sx={{ fontSize: { xs: '.83rem', sm: '1rem' } }}
                      >
                        {selected && card
                          ? pack.messages[card.message_key] ?? card.id
                          : ''}
                      </Typography>
                    </CardFace>
                  </Box>
                </Box>
              )
            })}
          </Box>

          <Typography
            color={revealed ? 'text.primary' : 'text.secondary'}
            fontWeight={revealed ? 800 : 650}
            textAlign="center"
            aria-live="polite"
          >
            {revealed
              ? t('cardDraw.readCard')
              : fanReady && canContinue
                ? t('cardDraw.chooseCard')
                : fanReady
                  ? t('cardDraw.waitingForChoice', { player: drawerName })
                  : t('cardDraw.shuffling')}
          </Typography>

          {!revealed && fanReady && !canContinue && (
            <Alert severity="info" sx={{ width: '100%' }}>
              {drawer?.is_bot
                ? t('cardDraw.botChoosing', { player: drawerName })
                : t('cardDraw.waitingForChoice', { player: drawerName })}
            </Alert>
          )}
          {revealed && !canContinue && (
            <Alert severity="info" sx={{ width: '100%' }}>
              {drawer?.is_bot
                ? t('cardDraw.botContinuing', { player: drawerName, seconds })
                : t('cardDraw.waiting', { player: drawerName })}
            </Alert>
          )}
          {revealed && error && canContinue && (
            <Alert severity="warning" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, display: 'block' }}>
        {revealed && (
          <Stack spacing={1}>
            <LinearProgress
              variant="determinate"
              value={(seconds / autoContinueSeconds) * 100}
              sx={{
                height: 5,
                borderRadius: 99,
                '& .MuiLinearProgress-bar': { bgcolor: accent },
              }}
            />
            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={!canContinue || busy}
              onClick={() => void continueCard()}
              sx={{
                bgcolor: accent,
                color: '#17121f',
                fontWeight: 950,
                '&:hover': { bgcolor: accent },
              }}
            >
              {canContinue
                ? t('cardDraw.continue', { seconds })
                : t('cardDraw.observing')}
            </Button>
          </Stack>
        )}
      </DialogActions>
    </Dialog>
  )
}

interface CardFaceProps {
  accent: string
  accentDark: string
  front: boolean
  children: ReactNode
}

function CardFace({ accent, accentDark, front, children }: CardFaceProps) {
  return (
    <Stack
      spacing={1.25}
      alignItems="center"
      justifyContent="center"
      sx={{
        position: 'absolute',
        inset: 0,
        p: 2,
        overflow: 'auto',
        backfaceVisibility: 'hidden',
        transform: front ? 'rotateY(180deg)' : 'rotateY(0deg)',
        borderRadius: 3,
        border: `2px solid ${accent}`,
        color: front ? 'text.primary' : accent,
        background: front
          ? 'linear-gradient(155deg, rgba(31,27,48,.99), rgba(12,11,21,.99))'
          : `repeating-linear-gradient(135deg, ${accentDark}, ${accentDark} 9px, #181229 9px, #181229 18px)`,
        boxShadow: `0 20px 42px rgba(0,0,0,.52), inset 0 0 0 5px #171224, inset 0 0 0 7px ${accent}99`,
      }}
    >
      {children}
    </Stack>
  )
}
