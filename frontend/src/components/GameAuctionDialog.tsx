import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  User,
  VisualEffectsIntensity,
} from '../types'
import { playerColors } from './gameColors'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  onCommand: (command: GameCommand) => Promise<boolean>
  onCountdownWarning?: () => void
  motionIntensity?: VisualEffectsIntensity
}

interface AuctionBid {
  sequence: number
  playerId: string
  amount: number
}

const BID_WINDOW_MS = 5_000
const VISIBLE_BIDS = 5

export function GameAuctionDialog({
  game,
  pack,
  user,
  busy,
  error,
  onCommand,
  onCountdownWarning,
  motionIntensity = 'full',
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const deadline = game.active_auction?.bid_deadline ?? null
  const [now, setNow] = useState(() => Date.now())
  const warnedDeadlineRef = useRef<string | null>(null)

  useEffect(() => {
    setNow(Date.now())
    if (!deadline) return

    const deadlineMs = Date.parse(deadline)
    if (Number.isNaN(deadlineMs)) return

    const interval = window.setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)
      if (nextNow >= deadlineMs) window.clearInterval(interval)
    }, 100)

    return () => window.clearInterval(interval)
  }, [deadline])

  const deadlineMs = parseDeadline(deadline)
  const remainingMs =
    deadlineMs === null ? null : Math.max(0, deadlineMs - now)
  const remainingSeconds =
    remainingMs === null ? null : Math.ceil(remainingMs / 1_000)

  useEffect(() => {
    if (
      deadline &&
      remainingSeconds !== null &&
      remainingSeconds > 0 &&
      remainingSeconds <= 2 &&
      warnedDeadlineRef.current !== deadline
    ) {
      warnedDeadlineRef.current = deadline
      onCountdownWarning?.()
    }
  }, [deadline, onCountdownWarning, remainingSeconds])

  const auction = game.active_auction
  if (!auction) return null

  const tile = pack.board.tiles.find(
    (candidate) => candidate.id === auction.property_id,
  )
  const propertyName = tile
    ? pack.messages[tile.name_key]
    : auction.property_id
  const bidderIndex = game.players.findIndex(
    (player) => player.user_id === auction.current_bidder_id,
  )
  const bidder = bidderIndex >= 0 ? game.players[bidderIndex] : undefined
  const bidderName = bidder?.display_name ?? t('auctionNoLeader')
  const canBid =
    auction.eligible_player_ids.includes(user.id) &&
    !auction.passed_player_ids.includes(user.id)
  const bidAmounts =
    auction.current_bid === 0
      ? [
          auction.minimum_bid,
          auction.minimum_bid + 10,
          auction.minimum_bid + 100,
        ]
      : [2, 10, 100].map((increment) => auction.current_bid + increment)
  const timerProgress =
    remainingMs === null
      ? 0
      : Math.min(100, (remainingMs / BID_WINDOW_MS) * 100)
  const timerLabel =
    remainingSeconds === null
      ? t('auctionTimerPending')
      : t('auctionTimeRemaining', { seconds: remainingSeconds })
  const bids = currentAuctionBids(game.events, auction.property_id)

  return (
    <Dialog
      open
      transitionDuration={motionIntensity === 'off' ? 0 : motionIntensity === 'soft' ? 140 : 240}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown
      aria-labelledby="auction-title"
      slotProps={{
        paper: {
          sx: {
            background:
              'linear-gradient(155deg, rgba(28,23,45,.99), rgba(13,11,23,.99))',
            border: '1px solid rgba(157,140,255,.2)',
            animation:
              motionIntensity === 'off'
                ? undefined
                : motionIntensity === 'soft'
                  ? 'auction-dialog-soft 320ms ease-out'
                  : 'auction-dialog-enter 520ms cubic-bezier(.2,.78,.2,1)',
            '@keyframes auction-dialog-soft': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
            '@keyframes auction-dialog-enter': {
              from: { opacity: 0, transform: 'translateY(24px) scale(.95)' },
              to: { opacity: 1, transform: 'translateY(0) scale(1)' },
            },
          },
        },
      }}
    >
      <DialogTitle id="auction-title" textAlign="center" color="secondary.light">
        {t('auction')}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(0,1.2fr) minmax(240px,.8fr)',
            },
            gap: { xs: 2, md: 3 },
          }}
        >
          <Stack spacing={{ xs: 2, sm: 2.5 }}>
            <Typography
              variant="h4"
              fontWeight={850}
              sx={{ fontSize: { xs: '1.65rem', sm: '2.125rem' } }}
            >
              <GavelRoundedIcon
                color="secondary"
                sx={{ verticalAlign: 'middle', mr: 1 }}
              />
              {propertyName}
            </Typography>

            <Box aria-live="polite">
              <Typography color="secondary.light" fontWeight={700}>
                {t('auctionLeader')}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" mt={0.5}>
                <Avatar
                  sx={{
                    bgcolor:
                      bidderIndex >= 0
                        ? playerColors[bidderIndex % playerColors.length]
                        : 'secondary.main',
                    color: '#0b0912',
                    fontWeight: 900,
                  }}
                >
                  {bidder?.display_name.slice(0, 1).toUpperCase() ?? '$'}
                </Avatar>
                <Box minWidth={0}>
                  <Typography
                    fontWeight={750}
                    noWrap
                    sx={{ maxWidth: { xs: 210, sm: 320 } }}
                  >
                    {bidderName}
                  </Typography>
                  <Typography
                    key={auction.current_bid}
                    variant="h3"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      animation:
                        motionIntensity === 'off'
                          ? undefined
                          : motionIntensity === 'soft'
                            ? 'bid-soft 280ms ease-out'
                            : 'bid-pop 460ms cubic-bezier(.18,.9,.25,1.25)',
                      '@keyframes bid-soft': {
                        from: { opacity: 0.45 },
                        to: { opacity: 1 },
                      },
                      '@keyframes bid-pop': {
                        from: { opacity: 0.45, transform: 'scale(.72)' },
                        '72%': { opacity: 1, transform: 'scale(1.16)' },
                        to: { opacity: 1, transform: 'scale(1)' },
                      },
                    }}
                  >
                    ${auction.current_bid}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Box>
              <Typography
                role="timer"
                color={
                  remainingSeconds !== null && remainingSeconds <= 2
                    ? 'warning.main'
                    : 'text.secondary'
                }
                fontWeight={750}
                mb={0.75}
                sx={{
                  animation:
                    remainingSeconds !== null &&
                    remainingSeconds <= 2 &&
                    motionIntensity === 'full'
                      ? 'auction-urgent 620ms ease-in-out infinite'
                      : undefined,
                  '@keyframes auction-urgent': {
                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.58, transform: 'scale(1.035)' },
                  },
                }}
              >
                {timerLabel}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={timerProgress}
                color={
                  remainingSeconds !== null && remainingSeconds <= 2
                    ? 'warning'
                    : 'secondary'
                }
                aria-label={t('auctionTimerProgress')}
                aria-valuetext={timerLabel}
                sx={{ height: 8, borderRadius: 99 }}
              />
            </Box>

            {canBid ? (
              <Box>
                <Typography fontWeight={750} mb={1}>
                  {t('placeBid')}
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {bidAmounts.map((amount) => {
                    const increment = amount - auction.current_bid
                    return (
                      <Button
                        key={amount}
                        variant="contained"
                        color="secondary"
                        disabled={busy}
                        onClick={() =>
                          void onCommand({ action: 'bid', amount })
                        }
                        sx={{ minWidth: 112, minHeight: 56 }}
                      >
                        <Box>
                          <Typography fontWeight={850}>${amount}</Typography>
                          <Typography variant="caption">+${increment}</Typography>
                        </Box>
                      </Button>
                    )
                  })}
                  {auction.current_bidder_id !== user.id && (
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        void onCommand({ action: 'pass_auction' })
                      }
                      sx={{ minHeight: 56 }}
                    >
                      {t('pass')}
                    </Button>
                  )}
                </Stack>
              </Box>
            ) : (
              <Typography color="text.secondary">
                {t('waitingForAuction')}
              </Typography>
            )}
          </Stack>

          <Box
            sx={{
              borderRadius: 3,
              bgcolor: 'rgba(75,81,133,.48)',
              border: '1px solid rgba(255,255,255,.08)',
              p: { xs: 2, sm: 3 },
              minHeight: { md: 360 },
            }}
          >
            <Box textAlign="center">
              <Typography variant="h5" fontWeight={900}>
                {propertyName}
              </Typography>
              <Typography color="text.secondary" mt={1}>
                {t(tile?.kind ?? 'property')}
              </Typography>
              <Typography color="text.secondary" mt={2}>
                {t('price')}
              </Typography>
              <Typography variant="h5">${tile?.price ?? 0}</Typography>
            </Box>

            <Box
              sx={{
                mt: 3,
                pt: 2,
                borderTop: '1px solid rgba(255,255,255,.1)',
              }}
            >
              <Typography fontWeight={850} mb={1}>
                {t('auctionBidHistory')}
              </Typography>
              {bids.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  {t('auctionNoBids')}
                </Typography>
              ) : (
                <Stack
                  component="ol"
                  spacing={0.75}
                  sx={{
                    listStyle: 'none',
                    p: 0,
                    m: 0,
                    maxHeight: 190,
                    overflowY: 'auto',
                  }}
                >
                  {bids.map((bid) => {
                    const playerIndex = game.players.findIndex(
                      (player) => player.user_id === bid.playerId,
                    )
                    const player =
                      playerIndex >= 0 ? game.players[playerIndex] : undefined
                    const name = player?.display_name ?? t('bank')
                    return (
                      <Stack
                        component="li"
                        key={bid.sequence}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        aria-label={t('auctionBidHistoryItem', {
                          player: name,
                          amount: bid.amount,
                        })}
                        sx={{
                          borderRadius: 2,
                          bgcolor: 'rgba(11,9,18,.28)',
                          px: 1,
                          py: 0.75,
                          animation:
                            bid.sequence === bids[0]?.sequence &&
                            motionIntensity !== 'off'
                              ? motionIntensity === 'soft'
                                ? 'bid-row-soft 280ms ease-out'
                                : 'bid-row-enter 420ms ease-out'
                              : undefined,
                          '@keyframes bid-row-soft': {
                            from: { opacity: 0 },
                            to: { opacity: 1 },
                          },
                          '@keyframes bid-row-enter': {
                            from: { opacity: 0, transform: 'translateX(14px)' },
                            to: { opacity: 1, transform: 'translateX(0)' },
                          },
                        }}
                      >
                        <Avatar
                          sx={{
                            width: 28,
                            height: 28,
                            bgcolor:
                              playerIndex >= 0
                                ? playerColors[
                                    playerIndex % playerColors.length
                                  ]
                                : 'secondary.main',
                            color: '#0b0912',
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {player?.display_name.slice(0, 1).toUpperCase() ?? '$'}
                        </Avatar>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          noWrap
                          sx={{ minWidth: 0, flexGrow: 1 }}
                        >
                          {name}
                        </Typography>
                        <Typography fontWeight={850}>${bid.amount}</Typography>
                      </Stack>
                    )
                  })}
                </Stack>
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function parseDeadline(deadline: string | null): number | null {
  if (!deadline) return null
  const value = Date.parse(deadline)
  return Number.isNaN(value) ? null : value
}

function currentAuctionBids(
  events: GameEvent[],
  propertyId: string,
): AuctionBid[] {
  let startIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (
      event.type === 'auction.started' &&
      eventText(event, 'property_id') === propertyId
    ) {
      startIndex = index
      break
    }
  }
  if (startIndex < 0) return []

  return events
    .slice(startIndex + 1)
    .filter(
      (event) =>
        event.type === 'auction.bid_placed' &&
        eventText(event, 'property_id') === propertyId,
    )
    .flatMap((event) => {
      const playerId = eventText(event, 'player_id')
      const amount = eventNumber(event, 'amount')
      return playerId && amount !== null
        ? [{ sequence: event.sequence, playerId, amount }]
        : []
    })
    .slice(-VISIBLE_BIDS)
    .reverse()
}

function eventText(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}

function eventNumber(event: GameEvent, key: string): number | null {
  const value = event.data[key]
  return typeof value === 'number' ? value : null
}
