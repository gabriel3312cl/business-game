import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  BoardHistoricalStats,
  GameCommand,
  GameEvent,
  GameState,
  TileDefinition,
  User,
  VisualEffectsIntensity,
} from '../types'
import { playerColor } from './gameColors'
import { compareAuctionPrice } from './auctionPresentation'
import { perimeterPosition } from './boardGeometry'
import {
  assessHistoricalProperty,
  historicalProperty,
} from './propertyHistoricalAnalysis'
import { defaultTileColor } from './tilePresentation'
import { indexedAmount } from './economicValues'
import { auctionInteractionState } from './auctionInteraction'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  boardHistory: BoardHistoricalStats | null
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
const READINESS_WINDOW_MS = 30_000
const VISIBLE_BIDS = 5

export function GameAuctionDialog({
  game,
  pack,
  user,
  busy,
  error,
  boardHistory,
  onCommand,
  onCountdownWarning,
  motionIntensity = 'full',
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const deadline = game.active_auction?.bid_deadline ?? null
  const readinessIdle = game.active_auction?.phase === 'idle'
  const [now, setNow] = useState(() => Date.now())
  const [quickLoanAmount, setQuickLoanAmount] = useState('')
  const [auctionActionLocked, setAuctionActionLocked] = useState(false)
  const [pendingBidAmount, setPendingBidAmount] = useState<number | null>(null)
  const auctionActionLockRef = useRef(false)
  const auctionActionTimerRef = useRef<number | null>(null)
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

  useEffect(() => {
    setQuickLoanAmount('')
  }, [game.id, game.active_auction?.property_id])

  useEffect(() => {
    auctionActionLockRef.current = false
    setAuctionActionLocked(false)
    setPendingBidAmount(null)
    if (auctionActionTimerRef.current !== null) {
      window.clearTimeout(auctionActionTimerRef.current)
      auctionActionTimerRef.current = null
    }
  }, [game.active_auction?.id])

  useEffect(
    () => () => {
      if (auctionActionTimerRef.current !== null) {
        window.clearTimeout(auctionActionTimerRef.current)
      }
    },
    [],
  )

  const deadlineMs = parseDeadline(deadline)
  const remainingMs =
    deadlineMs === null ? null : Math.max(0, deadlineMs - now)
  const remainingSeconds =
    remainingMs === null ? null : Math.ceil(remainingMs / 1_000)
  const urgentSeconds = readinessIdle ? 5 : 2

  useEffect(() => {
    if (
      deadline &&
      remainingSeconds !== null &&
      remainingSeconds > 0 &&
      remainingSeconds <= urgentSeconds &&
      warnedDeadlineRef.current !== deadline
    ) {
      warnedDeadlineRef.current = deadline
      onCountdownWarning?.()
    }
  }, [deadline, onCountdownWarning, remainingSeconds, urgentSeconds])

  const auction = game.active_auction
  if (!auction) return null

  const submitAuctionCommand = async (
    command: GameCommand,
    bidAmount: number | null = null,
  ): Promise<boolean> => {
    if (auctionActionLockRef.current || busy) return false
    const lockedAt = Date.now()
    auctionActionLockRef.current = true
    setAuctionActionLocked(true)
    setPendingBidAmount(bidAmount)
    try {
      return await onCommand(command)
    } finally {
      const remainingCooldown = Math.max(0, 1_000 - (Date.now() - lockedAt))
      auctionActionTimerRef.current = window.setTimeout(() => {
        auctionActionLockRef.current = false
        auctionActionTimerRef.current = null
        setAuctionActionLocked(false)
        setPendingBidAmount(null)
      }, remainingCooldown)
    }
  }

  const tile = pack.board.tiles.find(
    (candidate) => candidate.id === auction.property_id,
  )
  const tileIndex = pack.board.tiles.findIndex(
    (candidate) => candidate.id === auction.property_id,
  )
  const group = pack.board.groups?.find((item) => item.id === tile?.group)
  const groupName = group ? (pack.messages[group.name_key] ?? group.id) : t(tile?.kind ?? 'property')
  const groupColor = group?.color ?? tile?.color ?? defaultTileColor(tile?.kind ?? 'property')
  const groupTiles = tile?.group
    ? pack.board.tiles.filter((item) => item.group === tile.group)
    : []
  const ownedInGroup = groupTiles.filter(
    (item) => game.owners[item.id] === user.id,
  ).length
  const propertyHistory = historicalProperty(boardHistory, auction.property_id)
  const consideredPrice = Math.max(auction.minimum_bid, auction.current_bid)
  const historicalAssessment = tile
    ? assessHistoricalProperty(
        tile,
        propertyHistory,
        boardHistory,
        pack.manifest.tile_count,
        consideredPrice,
      )
    : null
  const propertyName = tile
    ? pack.messages[tile.name_key]
    : auction.property_id
  const bidderIndex = game.players.findIndex(
    (player) => player.user_id === auction.current_bidder_id,
  )
  const bidder = bidderIndex >= 0 ? game.players[bidderIndex] : undefined
  const seller = game.players.find(
    (player) => player.user_id === auction.seller_id,
  )
  const bidderName = bidder?.display_name ?? t('auctionNoLeader')
  const bidderOwnedInGroup = bidder
    ? ownedGroupProperties(groupTiles, game, bidder.user_id)
    : 0
  const currentUser = game.players.find((player) => player.user_id === user.id)
  const activeLoan = game.bank.loans.some((loan) => loan.player_id === user.id)
  const creditProfile = game.bank.credit_profiles[user.id]
  const maximumLoan = creditProfile?.current_limit ?? 0
  const parsedQuickLoanAmount = Number(quickLoanAmount)
  const heldDeposit = auction.deposits[user.id] ?? 0
  const availableBidCash = (currentUser?.balance ?? 0) + heldDeposit
  const canPlaceDeposit =
    heldDeposit > 0 ||
    auction.deposit_amount === 0 ||
    (currentUser?.balance ?? 0) >= auction.deposit_amount
  const {
    isIdle: isAuctionIdle,
    isLeader: isCurrentLeader,
    isReady,
    hasPassed,
    isEligible,
    canBid,
  } = auctionInteractionState(auction, user.id)
  const readinessResponses = new Set([
    ...auction.ready_player_ids,
    ...auction.passed_player_ids,
  ]).size
  const readinessPending = Math.max(
    0,
    auction.eligible_player_ids.length - readinessResponses,
  )
  const showQuickLoan =
    game.settings.rules.loans_enabled &&
    canBid &&
    currentUser !== undefined &&
    !currentUser.bankrupt &&
    !activeLoan
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
      : Math.min(
          100,
          (remainingMs /
            (isAuctionIdle ? READINESS_WINDOW_MS : BID_WINDOW_MS)) *
            100,
        )
  const timerLabel =
    remainingSeconds === null
      ? t('auctionTimerPending')
      : isAuctionIdle
        ? t('auctionReadyTimeRemaining', { seconds: remainingSeconds })
        : t('auctionTimeRemaining', { seconds: remainingSeconds })
  const bids = currentAuctionBids(game.events, auction.property_id)
  const priceComparison =
    auction.current_bidder_id && tile?.price
      ? compareAuctionPrice(auction.current_bid, indexedAmount(game, tile.price))
      : null

  return (
    <Dialog
      open
      transitionDuration={motionIntensity === 'off' ? 0 : motionIntensity === 'soft' ? 140 : 240}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="lg"
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
        {seller && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('economy.advanced.voluntaryAuctionSeller', {
              seller: seller.display_name,
            })}
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

            <Paper
              aria-live="polite"
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: 'rgba(75,81,133,.22)',
                borderColor: 'rgba(157,140,255,.22)',
              }}
            >
              <Typography color="secondary.light" fontWeight={700}>
                {t('auctionLeader')}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" mt={0.5}>
                <Avatar
                  sx={{
                    bgcolor:
                      bidderIndex >= 0 && bidder
                        ? playerColor(bidder, bidderIndex)
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
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    useFlexGap
                    flexWrap="wrap"
                  >
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
                    {priceComparison && (
                      <Chip
                        size="small"
                        color={
                          priceComparison.direction === 'below'
                            ? 'success'
                            : priceComparison.direction === 'above'
                              ? 'error'
                              : 'default'
                        }
                        variant="outlined"
                        label={
                          priceComparison.direction === 'below'
                            ? t('auctionPriceBelow', {
                                percent: priceComparison.percent,
                              })
                            : priceComparison.direction === 'above'
                              ? t('auctionPriceAbove', {
                                  percent: priceComparison.percent,
                                })
                              : t('auctionPriceEqual')
                        }
                        sx={{ fontWeight: 800 }}
                      />
                    )}
                  </Stack>
                  {bidder && (
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      flexWrap="wrap"
                      mt={0.75}
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t('auctionCurrentBalance', {
                          amount: bidder.balance,
                        })}
                      />
                      {groupTiles.length > 0 && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t('auctionGroupOwnership', {
                            group: groupName,
                            owned: bidderOwnedInGroup,
                            total: groupTiles.length,
                          })}
                          sx={{ borderColor: `${groupColor}88` }}
                        />
                      )}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Paper>

            <Box>
              <Typography
                role="timer"
                color={
                  remainingSeconds !== null && remainingSeconds <= urgentSeconds
                    ? 'warning.main'
                    : 'text.secondary'
                }
                fontWeight={750}
                mb={0.75}
                sx={{
                  animation:
                    remainingSeconds !== null &&
                    remainingSeconds <= urgentSeconds &&
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
                  remainingSeconds !== null && remainingSeconds <= urgentSeconds
                    ? 'warning'
                    : 'secondary'
                }
                aria-label={t(
                  isAuctionIdle
                    ? 'auctionReadinessTimerProgress'
                    : 'auctionTimerProgress',
                )}
                aria-valuetext={timerLabel}
                sx={{ height: 8, borderRadius: 99 }}
              />
            </Box>

            {isAuctionIdle && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2.5,
                  bgcolor: 'rgba(157,140,255,.08)',
                  borderColor: 'rgba(157,140,255,.28)',
                }}
              >
                <Typography fontWeight={850}>
                  {t('auctionReadyTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {t('auctionReadyHelp')}
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" mt={1.25}>
                  {auction.eligible_player_ids.map((playerId) => {
                    const player = game.players.find(
                      (candidate) => candidate.user_id === playerId,
                    )
                    const status = auction.ready_player_ids.includes(playerId)
                      ? 'ready'
                      : auction.passed_player_ids.includes(playerId)
                        ? 'out'
                        : 'pending'
                    return (
                      <Chip
                        key={playerId}
                        size="small"
                        color={
                          status === 'ready'
                            ? 'success'
                            : status === 'out'
                              ? 'default'
                              : 'warning'
                        }
                        variant={status === 'pending' ? 'outlined' : 'filled'}
                        label={t(`auctionReadyStatus.${status}`, {
                          player: player?.display_name ?? playerId,
                        })}
                      />
                    )
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  {t('auctionReadyPending', { count: readinessPending })}
                </Typography>
              </Paper>
            )}

            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: 'rgba(11,9,18,.24)',
                borderColor: 'rgba(255,255,255,.1)',
              }}
            >
              {currentUser && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 1.5,
                    mb: 1.25,
                  }}
                >
                  <AuctionMoneyValue
                    label={t('auctionYourBalance')}
                    amount={currentUser.balance}
                  />
                  <AuctionMoneyValue
                    label={t('auctionAvailableToBid')}
                    amount={availableBidCash}
                    align="right"
                  />
                </Box>
              )}
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('auctionMinimumBid', {
                    amount: auction.minimum_bid,
                  })}
                />
                {auction.deposit_amount > 0 && (
                  <Chip
                    size="small"
                    color={heldDeposit > 0 ? 'success' : 'info'}
                    variant="outlined"
                    label={
                      heldDeposit > 0
                        ? t('auctionDepositHeld', { amount: heldDeposit })
                        : t('auctionDeposit', {
                            amount: auction.deposit_amount,
                            percent: game.settings.auction_deposit_percent,
                          })
                    }
                  />
                )}
              </Stack>
              {auction.deposit_amount > 0 && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
                  {t('auctionDepositHint')}
                </Typography>
              )}
            </Paper>

            {showQuickLoan && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid rgba(157,140,255,.28)',
                  bgcolor: 'rgba(157,140,255,.08)',
                }}
              >
                <Typography fontWeight={850} mb={0.5}>
                  {t('auctionQuickLoan')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('auctionQuickLoanHelp', {
                    amount: maximumLoan,
                    interest:
                      creditProfile?.current_interest_percent ??
                      pack.manifest.loan_interest_percent,
                  })}
                </Typography>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  mt={1}
                >
                  <TextField
                    size="small"
                    type="number"
                    label={t('bankPanel.loanAmount')}
                    value={quickLoanAmount}
                    slotProps={{
                      htmlInput: { min: 1, max: maximumLoan, step: 1 },
                    }}
                    onChange={(event) => setQuickLoanAmount(event.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="contained"
                    disabled={
                      busy ||
                      auctionActionLocked ||
                      !Number.isInteger(parsedQuickLoanAmount) ||
                      parsedQuickLoanAmount <= 0 ||
                      parsedQuickLoanAmount > maximumLoan
                    }
                    onClick={() =>
                      void submitAuctionCommand({
                        action: 'request_loan',
                        amount: parsedQuickLoanAmount,
                        auction_id: auction.id,
                      }).then((success) => {
                        if (success) setQuickLoanAmount('')
                      })
                    }
                  >
                    {t('auctionQuickLoanAction')}
                  </Button>
                </Stack>
              </Box>
            )}

            {isAuctionIdle ? (
              isEligible ? (
                isReady ? (
                  <Alert severity="success">
                    {t('auctionYouAreReady')}
                  </Alert>
                ) : hasPassed ? (
                  <Alert severity="info">
                    {t('auctionYouDeclined')}
                  </Alert>
                ) : (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      color="success"
                      disabled={
                        busy || auctionActionLocked || remainingMs === 0
                      }
                      onClick={() =>
                        void submitAuctionCommand({
                          action: 'ready_auction',
                          auction_id: auction.id,
                        })
                      }
                    >
                      {t('auctionReadyAction')}
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={
                        busy || auctionActionLocked || remainingMs === 0
                      }
                      onClick={() =>
                        void submitAuctionCommand({
                          action: 'pass_auction',
                          auction_id: auction.id,
                        })
                      }
                    >
                      {t('auctionDeclineAction')}
                    </Button>
                  </Stack>
                )
              ) : (
                <Typography color="text.secondary">
                  {t('auctionNotEligible')}
                </Typography>
              )
            ) : canBid ? (
              <Box>
                <Typography fontWeight={750} mb={1}>
                  {pendingBidAmount === null
                    ? t('placeBid')
                    : t('auctionBidSending', { amount: pendingBidAmount })}
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {bidAmounts.map((amount) => {
                    const increment = amount - auction.current_bid
                    return (
                      <Button
                        key={amount}
                        variant="contained"
                        color="secondary"
                        disabled={
                          busy ||
                          auctionActionLocked ||
                          !canPlaceDeposit ||
                          amount > availableBidCash
                        }
                        onClick={() =>
                          void submitAuctionCommand(
                            { action: 'bid', auction_id: auction.id, amount },
                            amount,
                          )
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
                      disabled={busy || auctionActionLocked}
                      onClick={() =>
                        void submitAuctionCommand({
                          action: 'pass_auction',
                          auction_id: auction.id,
                        })
                      }
                      sx={{ minHeight: 56 }}
                    >
                      {t('pass')}
                    </Button>
                  )}
                </Stack>
              </Box>
            ) : isCurrentLeader ? (
              <Alert severity="success">{t('auctionYouLead')}</Alert>
            ) : (
              <Typography color="text.secondary">
                {auction.eligible_player_ids.includes(user.id)
                  ? t('waitingForAuction')
                  : t('auctionNotEligible')}
              </Typography>
            )}

            <AuctionBidHistory
              bids={bids}
              game={game}
              groupTiles={groupTiles}
              groupName={groupName}
              groupColor={groupColor}
              motionIntensity={motionIntensity}
            />
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
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 2,
                alignItems: 'start',
              }}
            >
              <Box minWidth={0}>
                <Typography variant="h5" fontWeight={900}>
                  {propertyName}
                </Typography>
                <Typography color="text.secondary" mt={0.25}>
                  {t(tile?.kind ?? 'property')}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  mt={1.25}
                >
                  <Chip
                    size="small"
                    label={groupName}
                    sx={{
                      borderLeft: `5px solid ${groupColor}`,
                      bgcolor: `${groupColor}1f`,
                      fontWeight: 800,
                    }}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('auctionBoardPosition', {
                      position: tileIndex + 1,
                      total: pack.manifest.tile_count,
                    })}
                  />
                </Stack>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">
                  {t('price')}
                </Typography>
                <Typography variant="h5" fontWeight={850}>
                  ${tile?.price ?? 0}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                mt: 2.5,
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'minmax(150px,.75fr) minmax(0,1.25fr)',
                },
                gap: 1.5,
                alignItems: 'start',
              }}
            >
              <AuctionBoardMap
                tileCount={pack.manifest.tile_count}
                sideLength={pack.manifest.side_length}
                tileIndex={tileIndex}
                propertyName={propertyName}
                accent={groupColor}
              />
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(11,9,18,.28)',
                }}
              >
                <Typography fontWeight={850}>{t('propertyHistory.title')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('propertyHistory.sample', { count: boardHistory?.game_count ?? 0 })}
                </Typography>
                {groupTiles.length > 0 && (
                  <Typography variant="caption" color="secondary.light" display="block">
                    {t('propertyHistory.groupProgress', {
                      owned: ownedInGroup,
                      total: groupTiles.length,
                    })}
                  </Typography>
                )}
                {groupTiles.length > 1 && ownedInGroup === groupTiles.length - 1 && (
                  <Alert severity="success" variant="outlined" sx={{ mt: 1 }}>
                    {t('propertyHistory.completesGroup')}
                  </Alert>
                )}
                {propertyHistory && boardHistory && boardHistory.game_count > 0 ? (
                  <>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 1,
                        mt: 1.25,
                      }}
                    >
                      <HistoricalValue
                        label={t('propertyHistory.landings')}
                        value={`${propertyHistory.landings} · ${propertyHistory.landing_percent}%`}
                      />
                      <HistoricalValue
                        label={t('propertyHistory.rent')}
                        value={`$${propertyHistory.total_rent}`}
                      />
                      <HistoricalValue
                        label={t('propertyHistory.averageRent')}
                        value={`$${propertyHistory.average_rent}`}
                      />
                      <HistoricalValue
                        label={t('propertyHistory.averageAuction')}
                        value={
                          propertyHistory.auction_sales > 0
                            ? `$${propertyHistory.average_auction_price}`
                            : t('propertyHistory.noData')
                        }
                      />
                    </Box>
                    {historicalAssessment && (
                      <Alert
                        severity={
                          historicalAssessment.level === 'positive'
                            ? 'success'
                            : historicalAssessment.level === 'negative'
                              ? 'warning'
                              : 'info'
                        }
                        sx={{ mt: 1.25, textAlign: 'left' }}
                      >
                        {t(`propertyHistory.assessment.${historicalAssessment.reason}`)}
                      </Alert>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" mt={1}>
                    {t('propertyHistory.noHistory')}
                  </Typography>
                )}
              </Box>
            </Box>

          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function AuctionBidHistory({
  bids,
  game,
  groupTiles,
  groupName,
  groupColor,
  motionIntensity,
}: {
  bids: AuctionBid[]
  game: GameState
  groupTiles: TileDefinition[]
  groupName: string
  groupColor: string
  motionIntensity: VisualEffectsIntensity
}) {
  const { t } = useTranslation()

  return (
    <Box>
      <Typography fontWeight={850} mb={1}>
        {t('auctionBidHistory')}
      </Typography>
      {bids.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          {t('auctionNoBids')}
        </Typography>
      ) : (
        <Box
          component="ol"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 0.75,
            listStyle: 'none',
            p: 0,
            m: 0,
          }}
        >
          {bids.map((bid) => {
            const playerIndex = game.players.findIndex(
              (player) => player.user_id === bid.playerId,
            )
            const player =
              playerIndex >= 0 ? game.players[playerIndex] : undefined
            const name = player?.display_name ?? t('bank')
            const ownedInGroup = player
              ? ownedGroupProperties(groupTiles, game, player.user_id)
              : 0
            return (
              <Stack
                component="li"
                key={bid.sequence}
                direction="row"
                spacing={0.75}
                alignItems="center"
                aria-label={t('auctionBidHistoryItem', {
                  player: name,
                  amount: bid.amount,
                })}
                sx={{
                  minWidth: 0,
                  borderRadius: 2,
                  bgcolor: 'rgba(75,81,133,.3)',
                  border: '1px solid rgba(255,255,255,.07)',
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
                    from: { opacity: 0, transform: 'translateY(8px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    bgcolor:
                      playerIndex >= 0 && player
                        ? playerColor(player, playerIndex)
                        : 'secondary.main',
                    color: '#0b0912',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {player?.display_name.slice(0, 1).toUpperCase() ?? '$'}
                </Avatar>
                <Box minWidth={0} flex={1}>
                  <Typography variant="caption" fontWeight={700} noWrap display="block">
                    {name}
                  </Typography>
                  <Typography fontWeight={900}>${bid.amount}</Typography>
                  {player && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {t('auctionCurrentBalance', { amount: player.balance })}
                    </Typography>
                  )}
                  {player && groupTiles.length > 0 && (
                    <Typography
                      variant="caption"
                      display="block"
                      noWrap
                      sx={{ color: groupColor }}
                    >
                      {t('auctionGroupOwnership', {
                        group: groupName,
                        owned: ownedInGroup,
                        total: groupTiles.length,
                      })}
                    </Typography>
                  )}
                </Box>
              </Stack>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

function AuctionBoardMap({
  tileCount,
  sideLength,
  tileIndex,
  propertyName,
  accent,
}: {
  tileCount: number
  sideLength: number
  tileIndex: number
  propertyName: string
  accent: string
}) {
  const { t } = useTranslation()
  if (tileCount < 4 || sideLength < 2 || tileIndex < 0) return null

  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 2,
        bgcolor: 'rgba(11,9,18,.28)',
      }}
    >
      <Typography fontWeight={850} mb={1}>
        {t('auctionBoardMap')}
      </Typography>
      <Box
        role="img"
        aria-label={t('auctionBoardMapTarget', {
          property: propertyName,
          position: tileIndex + 1,
        })}
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${sideLength}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${sideLength}, minmax(0, 1fr))`,
          gap: '2px',
          width: '100%',
          maxWidth: 220,
          aspectRatio: '1',
          mx: 'auto',
        }}
      >
        <Box
          sx={{
            gridColumn: `2 / ${sideLength}`,
            gridRow: `2 / ${sideLength}`,
            alignSelf: 'center',
            justifySelf: 'center',
            textAlign: 'center',
            minWidth: 0,
          }}
        >
          <Typography color="secondary.light" fontWeight={900}>
            {tileIndex + 1}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {propertyName}
          </Typography>
        </Box>
        {Array.from({ length: tileCount }, (_, index) => {
          const position = perimeterPosition(index, sideLength)
          const selected = index === tileIndex
          return (
            <Box
              key={index}
              sx={{
                gridColumn: position.column,
                gridRow: position.row,
                alignSelf: 'center',
                justifySelf: 'center',
                width: selected ? '100%' : '72%',
                aspectRatio: '1',
                borderRadius: selected ? '35%' : '28%',
                bgcolor: selected ? accent : 'rgba(255,255,255,.17)',
                border: selected ? '2px solid white' : 'none',
                boxShadow: selected ? `0 0 0 2px ${accent}66, 0 0 14px ${accent}` : 'none',
                transform: selected ? 'scale(1.6)' : undefined,
                zIndex: selected ? 2 : 1,
              }}
            />
          )
        })}
      </Box>
    </Box>
  )
}

function AuctionMoneyValue({
  label,
  amount,
  align = 'left',
}: {
  label: string
  amount: number
  align?: 'left' | 'right'
}) {
  return (
    <Box minWidth={0} textAlign={align}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={900} sx={{ fontVariantNumeric: 'tabular-nums' }}>
        ${amount}
      </Typography>
    </Box>
  )
}

function ownedGroupProperties(
  groupTiles: TileDefinition[],
  game: GameState,
  playerId: string,
): number {
  return groupTiles.filter((item) => game.owners[item.id] === playerId).length
}

function HistoricalValue({ label, value }: { label: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography fontWeight={850}>{value}</Typography>
    </Box>
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
