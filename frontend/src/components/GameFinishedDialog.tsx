import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  GameEvent,
  GameState,
  PlayerState,
  VisualEffectsIntensity,
} from '../types'

interface Props {
  open: boolean
  game: GameState
  currentUserId: string
  busy: boolean
  onClose: () => void
  onExit: () => void
  motionIntensity?: VisualEffectsIntensity
}

interface PlayerResult {
  player: PlayerState
  rank: number
  properties: number
  houses: number
  hotels: number
  auditedScore: number | null
}

interface GameSummary {
  winnerId: string | null
  durationSeconds: number | null
  turns: number
  rolls: number
  trades: number
  players: PlayerResult[]
}

const CONFETTI_COLORS = ['#b8ff3d', '#8f7cff', '#ffcf4a', '#ff5c93', '#52d6ff']
const CONFETTI = Array.from({ length: 34 }, (_, index) => ({
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  left: (index * 37 + 7) % 100,
  delay: ((index * 13) % 20) / 10,
  duration: 2.5 + ((index * 7) % 12) / 10,
  rotation: (index * 47) % 180,
  width: 6 + (index % 3) * 2,
}))

export function GameFinishedDialog({
  open,
  game,
  currentUserId,
  busy,
  onClose,
  onExit,
  motionIntensity = 'full',
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const reduceMotion = systemReducedMotion || motionIntensity !== 'full'
  const summary = useMemo(() => buildGameSummary(game), [game])
  const winner = game.players.find(
    (player) => player.user_id === summary.winnerId,
  )
  const currentUserWon = winner?.user_id === currentUserId

  return (
    <Dialog
      open={open}
      transitionDuration={motionIntensity === 'off' ? 0 : motionIntensity === 'soft' ? 140 : 240}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      onClose={() => {
        if (!busy) onClose()
      }}
      slotProps={{
        paper: {
          sx: {
            position: 'relative',
            overflow: 'hidden',
            border: currentUserWon
              ? '1px solid rgba(184,255,61,.42)'
              : '1px solid rgba(255,255,255,.12)',
            background:
              'radial-gradient(circle at 50% 0%, rgba(143,124,255,.22), transparent 38%), #171326',
          },
        },
      }}
      aria-labelledby="game-result-title"
    >
      {currentUserWon && !reduceMotion && <CelebrationConfetti />}

      <IconButton
        aria-label={t('close')}
        disabled={busy}
        onClick={onClose}
        sx={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}
      >
        <CloseRoundedIcon />
      </IconButton>

      <DialogContent sx={{ position: 'relative', zIndex: 1, px: { xs: 2, sm: 4 } }}>
        <Stack alignItems="center" spacing={1.25} sx={{ pt: { xs: 4, sm: 2 }, pb: 3 }}>
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 84,
              height: 84,
              borderRadius: '50%',
              color: currentUserWon ? '#171326' : 'secondary.contrastText',
              bgcolor: currentUserWon ? '#b8ff3d' : 'secondary.main',
              boxShadow: currentUserWon
                ? '0 0 0 10px rgba(184,255,61,.08), 0 18px 45px rgba(184,255,61,.2)'
                : '0 18px 45px rgba(143,124,255,.22)',
              animation: reduceMotion
                ? 'none'
                : 'gameResultTrophy 900ms cubic-bezier(.2,.9,.25,1.25)',
              '@keyframes gameResultTrophy': {
                '0%': { opacity: 0, transform: 'translateY(18px) scale(.65) rotate(-10deg)' },
                '70%': { opacity: 1, transform: 'translateY(-4px) scale(1.08) rotate(4deg)' },
                '100%': { transform: 'translateY(0) scale(1) rotate(0)' },
              },
            }}
          >
            <EmojiEventsRoundedIcon sx={{ fontSize: 48 }} />
          </Box>
          <Typography
            id="game-result-title"
            variant="h3"
            component="h2"
            textAlign="center"
            fontWeight={950}
            sx={{ fontSize: { xs: '2rem', sm: '2.65rem' }, letterSpacing: '-.04em' }}
          >
            {currentUserWon ? t('gameResult.victoryTitle') : t('gameResult.finishedTitle')}
          </Typography>
          <Typography color="text.secondary" textAlign="center">
            {currentUserWon
              ? t('gameResult.victorySubtitle')
              : winner
                ? t('gameResult.winnerSubtitle', { winner: winner.display_name })
                : t('gameResult.finishedSubtitle')}
          </Typography>
          {winner && (
            <Chip
              icon={<EmojiEventsRoundedIcon />}
              color="secondary"
              label={t('gameResult.winner', { winner: winner.display_name })}
              sx={{ fontWeight: 850 }}
            />
          )}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 1,
            mb: 3,
          }}
        >
          <SummaryStat
            label={t('gameResult.duration')}
            value={
              summary.durationSeconds === null
                ? t('gameResult.notAvailable')
                : formatDuration(summary.durationSeconds)
            }
          />
          <SummaryStat label={t('gameResult.turns')} value={summary.turns} />
          <SummaryStat label={t('gameResult.rolls')} value={summary.rolls} />
          <SummaryStat label={t('gameResult.trades')} value={summary.trades} />
        </Box>

        <Typography variant="h6" fontWeight={900} sx={{ mb: 1.25 }}>
          {t('gameResult.finalStandings')}
        </Typography>
        <Stack spacing={1}>
          {summary.players.map((result) => (
            <PlayerResultRow
              key={result.player.user_id}
              result={result}
              winnerId={summary.winnerId}
              currentUserId={currentUserId}
            />
          ))}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 4 }, py: 2.5, gap: 1 }}>
        <Button color="inherit" disabled={busy} onClick={onClose}>
          {t('gameResult.viewBoard')}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<LogoutRoundedIcon />}
          disabled={busy}
          onClick={onExit}
        >
          {t('gameResult.leaveRoom')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function CelebrationConfetti() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        '@keyframes gameResultConfetti': {
          '0%': { opacity: 0, transform: 'translate3d(0,-30px,0) rotate(0)' },
          '12%': { opacity: 1 },
          '100%': { opacity: 0, transform: 'translate3d(20px,680px,0) rotate(620deg)' },
        },
      }}
    >
      {CONFETTI.map((piece, index) => (
        <Box
          component="span"
          key={index}
          sx={{
            position: 'absolute',
            top: -24,
            left: `${piece.left}%`,
            width: piece.width,
            height: piece.width * 1.8,
            borderRadius: index % 4 === 0 ? '50%' : '2px',
            bgcolor: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            animation: `gameResultConfetti ${piece.duration}s ease-in ${piece.delay}s both`,
          }}
        />
      ))}
    </Box>
  )
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        bgcolor: 'rgba(255,255,255,.055)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={900}>
        {value}
      </Typography>
    </Box>
  )
}

function PlayerResultRow({
  result,
  winnerId,
  currentUserId,
}: {
  result: PlayerResult
  winnerId: string | null
  currentUserId: string
}) {
  const { t } = useTranslation()
  const isWinner = result.player.user_id === winnerId
  const isCurrentUser = result.player.user_id === currentUserId

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        borderRadius: 2.5,
        border: isWinner
          ? '1px solid rgba(184,255,61,.34)'
          : '1px solid rgba(255,255,255,.08)',
        bgcolor: isWinner ? 'rgba(184,255,61,.08)' : 'rgba(255,255,255,.035)',
      }}
    >
      <Typography
        variant="h6"
        color={isWinner ? '#b8ff3d' : 'text.secondary'}
        fontWeight={950}
        sx={{ width: 28, textAlign: 'center', flexShrink: 0 }}
      >
        {result.rank}
      </Typography>
      <Box minWidth={0} flex={1}>
        <Stack direction="row" alignItems="center" spacing={0.75} useFlexGap flexWrap="wrap">
          <Typography fontWeight={900} noWrap>
            {result.player.display_name}
          </Typography>
          {isCurrentUser && <Chip size="small" label={t('gameResult.you')} />}
          {isWinner && (
            <EmojiEventsRoundedIcon sx={{ color: '#b8ff3d', fontSize: 19 }} />
          )}
          {result.player.bankrupt && (
            <Chip size="small" variant="outlined" label={t('bankrupt')} />
          )}
        </Stack>
        <Stack
          direction="row"
          spacing={{ xs: 1.25, sm: 2.5 }}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 0.5 }}
        >
          <InlineStat label={t('gameResult.cash')} value={`$${result.player.balance}`} />
          {result.auditedScore !== null && (
            <InlineStat
              label={t('gameResult.auditedScore')}
              value={`$${result.auditedScore}`}
            />
          )}
          <InlineStat label={t('gameResult.properties')} value={result.properties} />
          <InlineStat label={t('gameResult.houses')} value={result.houses} />
          <InlineStat label={t('gameResult.hotels')} value={result.hotels} />
        </Stack>
      </Box>
    </Box>
  )
}

function InlineStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Typography variant="caption" color="text.secondary">
      {label}: <Box component="span" color="text.primary" fontWeight={800}>{value}</Box>
    </Typography>
  )
}

function buildGameSummary(game: GameState): GameSummary {
  const finishedEvent = [...game.events]
    .reverse()
    .find((event) => event.type === 'game.finished')
  const eventWinnerId = finishedEvent ? eventText(finishedEvent, 'winner_id') : null
  const rawScores = finishedEvent?.data.scores
  const finaleScores =
    rawScores && typeof rawScores === 'object' && !Array.isArray(rawScores)
      ? (rawScores as Record<string, unknown>)
      : null
  const scoreFor = (playerId: string): number | null => {
    const value = finaleScores?.[playerId]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const activePlayers = game.players.filter((player) => !player.bankrupt)
  const winnerId =
    eventWinnerId ?? (activePlayers.length === 1 ? activePlayers[0].user_id : null)
  const bankruptcySequence = new Map<string, number>()

  for (const event of game.events) {
    if (event.type !== 'player.bankrupt') continue
    const playerId = eventText(event, 'player_id')
    if (playerId) bankruptcySequence.set(playerId, event.sequence)
  }

  const rankedPlayers = [...game.players].sort((left, right) => {
    if (left.user_id === winnerId) return -1
    if (right.user_id === winnerId) return 1
    const leftScore = scoreFor(left.user_id)
    const rightScore = scoreFor(right.user_id)
    if (leftScore !== null || rightScore !== null) {
      return (rightScore ?? 0) - (leftScore ?? 0) || right.balance - left.balance
    }
    const leftBankruptcy = bankruptcySequence.get(left.user_id)
    const rightBankruptcy = bankruptcySequence.get(right.user_id)
    if (leftBankruptcy !== undefined && rightBankruptcy !== undefined) {
      return rightBankruptcy - leftBankruptcy
    }
    if (leftBankruptcy === undefined && rightBankruptcy !== undefined) return -1
    if (leftBankruptcy !== undefined && rightBankruptcy === undefined) return 1
    return right.balance - left.balance
  })

  const players = rankedPlayers.map((player, index) => {
    const ownedPropertyIds = Object.entries(game.owners)
      .filter(([, ownerId]) => ownerId === player.user_id)
      .map(([propertyId]) => propertyId)
    const levels = ownedPropertyIds.map(
      (propertyId) => game.building_levels[propertyId] ?? 0,
    )
    return {
      player,
      rank: index + 1,
      properties: ownedPropertyIds.length,
      houses: levels.reduce(
        (total, level) => total + (level >= 1 && level <= 4 ? level : 0),
        0,
      ),
      hotels: levels.filter((level) => level === 5).length,
      auditedScore: scoreFor(player.user_id),
    }
  })

  const startedEvent = game.events.find((event) => event.type === 'game.started')
  const durationSeconds = eventDurationSeconds(startedEvent, finishedEvent)

  return {
    winnerId,
    durationSeconds,
    turns: game.events.filter((event) => event.type === 'turn.started').length,
    rolls: game.events.filter((event) => event.type === 'dice.rolled').length,
    trades: game.events.filter((event) => event.type === 'trade.accepted').length,
    players,
  }
}

function eventText(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}

function eventDurationSeconds(
  startedEvent: GameEvent | undefined,
  finishedEvent: GameEvent | undefined,
): number | null {
  if (!startedEvent || !finishedEvent) return null
  const startedAt = new Date(startedEvent.occurred_at).getTime()
  const finishedAt = new Date(finishedEvent.occurred_at).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null
  return Math.max(0, Math.round((finishedAt - startedAt) / 1000))
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} h ${minutes} min`
  if (minutes > 0) return `${minutes} min ${seconds} s`
  return `${seconds} s`
}
