import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  ListSubheader,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { advisorApi } from '../advisor/api'
import type { AdvisorResponse } from '../advisor/types'
import { api } from '../api'
import type {
  BoardHistoricalStats,
  ContentPack,
  GameCommand,
  GameState,
  TileDefinition,
  TradeAnalysis,
  TradeOffer,
  TradeSideAnalysis,
  User,
} from '../types'
import { perimeterPosition } from './boardGeometry'
import { playerColor } from './gameColors'
import { groupPropertyIds } from './propertyGrouping'
import { summarizeHistoricalProperties } from './propertyHistoricalAnalysis'
import { defaultTileColor } from './tilePresentation'
import { tradeCashSuggestions } from './tradeCashSuggestions'

const AdvisorMarkdown = lazy(() => import('../advisor/AdvisorMarkdown'))

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  boardHistory: BoardHistoricalStats | null
  draft?: TradeDraft | null
  onDraftConsumed?: () => void
  onCommand: (command: GameCommand) => Promise<boolean>
}

export interface TradeDraft {
  recipientId: string
  requestedPropertyId: string
}

export function GameTradePanel({
  game,
  pack,
  user,
  busy,
  error,
  boardHistory,
  draft = null,
  onDraftConsumed,
  onCommand,
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [open, setOpen] = useState(false)
  const [detailTradeId, setDetailTradeId] = useState<string | null>(null)
  const [counteringTradeId, setCounteringTradeId] = useState<string | null>(null)
  const [systemAnalysis, setSystemAnalysis] = useState<TradeAnalysis | null>(null)
  const [systemAnalysisLoading, setSystemAnalysisLoading] = useState(false)
  const [systemAnalysisError, setSystemAnalysisError] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AdvisorResponse | null>(null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
  const [aiAnalysisError, setAiAnalysisError] = useState(false)
  const [recipientId, setRecipientId] = useState('')
  const [offeredCash, setOfferedCash] = useState(0)
  const [requestedCash, setRequestedCash] = useState(0)
  const [offeredPropertyIds, setOfferedPropertyIds] = useState<string[]>([])
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<string[]>([])
  const tradeUnavailablePropertyIds = game.trade_unavailable_property_ids
  const otherPlayers = game.players.filter(
    (player) => player.user_id !== user.id && !player.bankrupt,
  )
  const tradeablePlayers = useMemo(
    () =>
      game.players.filter(
        (player) =>
          player.user_id !== user.id &&
          !player.bankrupt &&
          Object.entries(game.owners).some(
            ([propertyId, ownerId]) =>
              ownerId === player.user_id &&
              (game.building_levels[propertyId] ?? 0) === 0 &&
              !tradeUnavailablePropertyIds.includes(propertyId),
          ),
      ),
    [game.building_levels, game.owners, game.players, tradeUnavailablePropertyIds, user.id],
  )
  const canTrade = game.players.some(
    (player) => player.user_id === user.id && !player.bankrupt,
  )
  const ownPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === user.id &&
        (game.building_levels[propertyId] ?? 0) === 0 &&
        !tradeUnavailablePropertyIds.includes(propertyId),
    )
    .map(([propertyId]) => propertyId)
  const recipientPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === recipientId &&
        (game.building_levels[propertyId] ?? 0) === 0 &&
        !tradeUnavailablePropertyIds.includes(propertyId),
    )
    .map(([propertyId]) => propertyId)
  const pendingTrades = game.trades.filter(
    (trade) =>
      trade.status === 'pending' &&
      (trade.proposer_id === user.id || trade.recipient_id === user.id),
  )
  const detailTrade = pendingTrades.find((trade) => trade.id === detailTradeId)
  useEffect(() => {
    setOfferedPropertyIds((current) =>
      current.filter((propertyId) => !tradeUnavailablePropertyIds.includes(propertyId)),
    )
    setRequestedPropertyIds((current) =>
      current.filter((propertyId) => !tradeUnavailablePropertyIds.includes(propertyId)),
    )
  }, [tradeUnavailablePropertyIds])
  useEffect(() => {
    if (!draft) return
    const recipientIsAvailable = tradeablePlayers.some(
      (player) => player.user_id === draft.recipientId,
    )
    const propertyIsAvailable =
      game.owners[draft.requestedPropertyId] === draft.recipientId &&
      (game.building_levels[draft.requestedPropertyId] ?? 0) === 0 &&
      !tradeUnavailablePropertyIds.includes(draft.requestedPropertyId)
    if (recipientIsAvailable && propertyIsAvailable) {
      setCounteringTradeId(null)
      setRecipientId(draft.recipientId)
      setOfferedCash(0)
      setRequestedCash(0)
      setOfferedPropertyIds([])
      setRequestedPropertyIds([draft.requestedPropertyId])
      setDetailTradeId(null)
      setOpen(true)
    }
    onDraftConsumed?.()
  }, [
    draft,
    game.building_levels,
    game.owners,
    onDraftConsumed,
    tradeablePlayers,
    tradeUnavailablePropertyIds,
  ])
  useEffect(() => {
    setSystemAnalysis(null)
    setSystemAnalysisError(false)
    setAiAnalysis(null)
    setAiAnalysisError(false)
    if (!detailTradeId) return
    let active = true
    setSystemAnalysisLoading(true)
    void api
      .analyzeTrade(game.id, detailTradeId)
      .then((analysis) => {
        if (active) setSystemAnalysis(analysis)
      })
      .catch(() => {
        if (active) setSystemAnalysisError(true)
      })
      .finally(() => {
        if (active) setSystemAnalysisLoading(false)
      })
    return () => {
      active = false
    }
  }, [detailTradeId, game.id])

  const generateAiAnalysis = async () => {
    if (!detailTrade || !systemAnalysis || aiAnalysisLoading) return
    const proposerAnalysis = systemAnalysis.proposer_analysis
    const recipientAnalysis = systemAnalysis.recipient_analysis
    const offeredHistory = summarizeHistoricalProperties(
      boardHistory,
      detailTrade.offered_property_ids,
    )
    const requestedHistory = summarizeHistoricalProperties(
      boardHistory,
      detailTrade.requested_property_ids,
    )
    setAiAnalysisLoading(true)
    setAiAnalysisError(false)
    try {
      setAiAnalysis(
        await advisorApi.ask(game.id, {
          question: t('tradeAiQuestion', {
            myRole: t(`tradeRoles.${systemAnalysis.perspective}`),
            offeredCash: detailTrade.offered_cash,
            requestedCash: detailTrade.requested_cash,
            offeredPropertyCount: detailTrade.offered_property_ids.length,
            requestedPropertyCount: detailTrade.requested_property_ids.length,
            proposerLevel: t(
              `tradeConvenienceLevel.${proposerAnalysis.convenience_level}`,
            ),
            proposerVerdict: t(`tradeSystemVerdict.${proposerAnalysis.verdict}`),
            proposerSurplus: proposerAnalysis.estimated_surplus,
            proposerRiskSurplus: proposerAnalysis.risk_adjusted_surplus,
            proposerCashAfter: proposerAnalysis.cash_after,
            proposerPaymentProbabilityBefore:
              proposerAnalysis.payment_probability_before,
            proposerPaymentProbabilityAfter:
              proposerAnalysis.payment_probability_after,
            proposerExpectedPaymentsBefore:
              proposerAnalysis.expected_payments_before,
            proposerExpectedPaymentsAfter:
              proposerAnalysis.expected_payments_after,
            proposerIncomeBefore: proposerAnalysis.expected_rent_income_before,
            proposerIncomeAfter: proposerAnalysis.expected_rent_income_after,
            recipientLevel: t(
              `tradeConvenienceLevel.${recipientAnalysis.convenience_level}`,
            ),
            recipientVerdict: t(`tradeSystemVerdict.${recipientAnalysis.verdict}`),
            recipientSurplus: recipientAnalysis.estimated_surplus,
            recipientRiskSurplus: recipientAnalysis.risk_adjusted_surplus,
            recipientCashAfter: recipientAnalysis.cash_after,
            recipientPaymentProbabilityBefore:
              recipientAnalysis.payment_probability_before,
            recipientPaymentProbabilityAfter:
              recipientAnalysis.payment_probability_after,
            recipientExpectedPaymentsBefore:
              recipientAnalysis.expected_payments_before,
            recipientExpectedPaymentsAfter:
              recipientAnalysis.expected_payments_after,
            recipientIncomeBefore: recipientAnalysis.expected_rent_income_before,
            recipientIncomeAfter: recipientAnalysis.expected_rent_income_after,
            historicalGames: boardHistory?.game_count ?? 0,
            offeredHistoricalLanding: offeredHistory.landingPercent,
            offeredHistoricalRent: offeredHistory.totalRent,
            requestedHistoricalLanding: requestedHistory.landingPercent,
            requestedHistoricalRent: requestedHistory.totalRent,
          }),
        }),
      )
    } catch {
      setAiAnalysisError(true)
    } finally {
      setAiAnalysisLoading(false)
    }
  }
  const reset = () => {
    setCounteringTradeId(null)
    setRecipientId('')
    setOfferedCash(0)
    setRequestedCash(0)
    setOfferedPropertyIds([])
    setRequestedPropertyIds([])
  }
  const close = () => {
    setOpen(false)
    reset()
  }
  const startCounterOffer = (trade: TradeOffer) => {
    setCounteringTradeId(trade.id)
    setRecipientId(trade.proposer_id)
    setOfferedCash(trade.requested_cash)
    setRequestedCash(trade.offered_cash)
    setOfferedPropertyIds(
      trade.requested_property_ids.filter(
        (propertyId) => !tradeUnavailablePropertyIds.includes(propertyId),
      ),
    )
    setRequestedPropertyIds(
      trade.offered_property_ids.filter(
        (propertyId) => !tradeUnavailablePropertyIds.includes(propertyId),
      ),
    )
    setDetailTradeId(null)
    setOpen(true)
  }
  const canSend =
    recipientId &&
    (offeredCash > 0 ||
      requestedCash > 0 ||
      offeredPropertyIds.length > 0 ||
      requestedPropertyIds.length > 0)

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography fontWeight={850}>{t('trades')}</Typography>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<SwapHorizRoundedIcon />}
          disabled={
            game.status !== 'playing' || !canTrade || tradeablePlayers.length === 0
          }
          onClick={() => setOpen(true)}
        >
          {t('createTrade')}
        </Button>
      </Stack>

      {pendingTrades.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          {t('noPendingTrades')}
        </Typography>
      ) : (
        pendingTrades.map((trade: TradeOffer) => (
          <Alert
            key={trade.id}
            severity={trade.recipient_id === user.id ? 'info' : 'success'}
            sx={{
              flexDirection: { xs: 'column', sm: 'row' },
              '& .MuiAlert-action': {
                ml: { xs: 0, sm: 2 },
                mt: { xs: 1, sm: 0 },
                alignSelf: { xs: 'stretch', sm: 'center' },
              },
            }}
            action={
              <Stack direction="row" useFlexGap flexWrap="wrap">
                <Button onClick={() => setDetailTradeId(trade.id)}>
                  {t('viewDetails')}
                </Button>
                {trade.recipient_id === user.id ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void onCommand({
                          action: 'accept_trade',
                          trade_id: trade.id,
                        })
                      }
                    >
                      {t('accept')}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void onCommand({
                          action: 'reject_trade',
                          trade_id: trade.id,
                        })
                      }
                    >
                      {t('reject')}
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void onCommand({
                        action: 'cancel_trade',
                        trade_id: trade.id,
                      })
                    }
                  >
                    {t('cancel')}
                  </Button>
                )}
              </Stack>
            }
          >
            {t('tradeSummary', {
              proposer: playerName(game, trade.proposer_id),
              offered: trade.offered_cash,
              requested: trade.requested_cash,
              recipient: playerName(game, trade.recipient_id),
            })}
          </Alert>
        ))
      )}

      <Dialog
        open={detailTrade !== undefined}
        onClose={() => setDetailTradeId(null)}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="md"
        aria-labelledby="trade-details-title"
      >
        <DialogTitle
          id="trade-details-title"
          textAlign="center"
          color="secondary.light"
        >
          {t('tradeDetails')}
          <IconButton
            aria-label={t('close')}
            onClick={() => setDetailTradeId(null)}
            sx={{ position: 'absolute', right: 12, top: 10 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        {detailTrade && (
          <>
            <DialogContent>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' },
                  gap: 2,
                  alignItems: 'stretch',
                }}
              >
                <TradeDetailSide
                  title={t('tradePartyGives', {
                    player: playerName(game, detailTrade.proposer_id),
                  })}
                  cash={detailTrade.offered_cash}
                  propertyIds={detailTrade.offered_property_ids}
                  pack={pack}
                />
                <SwapHorizRoundedIcon
                  color="secondary"
                  sx={{ alignSelf: 'center', display: { xs: 'none', md: 'block' } }}
                />
                <TradeDetailSide
                  title={t('tradePartyGives', {
                    player: playerName(game, detailTrade.recipient_id),
                  })}
                  cash={detailTrade.requested_cash}
                  propertyIds={detailTrade.requested_property_ids}
                  pack={pack}
                />
              </Box>
              <Divider sx={{ my: 2.5 }} />
              <Stack spacing={2}>
                <SystemTradeAnalysis
                  analysis={systemAnalysis}
                  loading={systemAnalysisLoading}
                  failed={systemAnalysisError}
                  game={game}
                  trade={detailTrade}
                  userId={user.id}
                  boardHistory={boardHistory}
                />
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderColor: 'rgba(157,140,255,.3)' }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <AutoAwesomeRoundedIcon color="secondary" fontSize="small" />
                        <Typography fontWeight={850}>{t('tradeAiAnalysis')}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {t('tradeAiAnalysisHelp')}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={
                        aiAnalysisLoading ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <AutoAwesomeRoundedIcon />
                        )
                      }
                      disabled={aiAnalysisLoading || !systemAnalysis}
                      onClick={() => void generateAiAnalysis()}
                    >
                      {aiAnalysis ? t('tradeRegenerateAi') : t('tradeGenerateAi')}
                    </Button>
                  </Stack>
                  {aiAnalysisError && (
                    <Alert severity="warning" sx={{ mt: 1.5 }}>
                      {t('tradeAiUnavailable')}
                    </Alert>
                  )}
                  {aiAnalysis && (
                    <Box sx={{ mt: 1.5 }}>
                      <Suspense
                        fallback={
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {aiAnalysis.answer}
                          </Typography>
                        }
                      >
                        <AdvisorMarkdown>{aiAnalysis.answer}</AdvisorMarkdown>
                      </Suspense>
                      {aiAnalysis.snapshot_sequence <
                        (game.events.at(-1)?.sequence ?? 0) && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color="warning"
                          label={t('advisor.stale')}
                          sx={{ mt: 1 }}
                        />
                      )}
                    </Box>
                  )}
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
              <Button onClick={() => setDetailTradeId(null)}>{t('close')}</Button>
              {detailTrade.recipient_id === user.id ? (
                <>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const accepted = await onCommand({
                        action: 'accept_trade',
                        trade_id: detailTrade.id,
                      })
                      if (accepted) setDetailTradeId(null)
                    }}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    color="secondary"
                    disabled={busy}
                    onClick={() => startCounterOffer(detailTrade)}
                  >
                    {t('counterOffer')}
                  </Button>
                  <Button
                    color="error"
                    disabled={busy}
                    onClick={async () => {
                      const rejected = await onCommand({
                        action: 'reject_trade',
                        trade_id: detailTrade.id,
                      })
                      if (rejected) setDetailTradeId(null)
                    }}
                  >
                    {t('reject')}
                  </Button>
                </>
              ) : (
                <Button
                  color="error"
                  disabled={busy}
                  onClick={async () => {
                    const cancelled = await onCommand({
                      action: 'cancel_trade',
                      trade_id: detailTrade.id,
                    })
                    if (cancelled) setDetailTradeId(null)
                  }}
                >
                  {t('cancel')}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={open}
        onClose={close}
        fullScreen={fullScreen}
        fullWidth
        maxWidth={recipientId ? 'md' : 'sm'}
        aria-labelledby="trade-title"
      >
        <DialogTitle id="trade-title" textAlign="center" color="secondary.light">
          {recipientId && !counteringTradeId && (
            <IconButton
              aria-label={t('back')}
              onClick={() => setRecipientId('')}
              sx={{ position: 'absolute', left: 12, top: 10 }}
            >
              <ArrowBackRoundedIcon />
            </IconButton>
          )}
          {t(counteringTradeId ? 'counterOffer' : 'createTrade')}
          <IconButton
            aria-label={t('close')}
            onClick={close}
            sx={{ position: 'absolute', right: 12, top: 10 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!recipientId ? (
            <Stack spacing={1.25}>
              <Typography textAlign="center" fontWeight={750} mb={1}>
                {t('selectTradePlayer')}
              </Typography>
              {tradeablePlayers.map((player) => {
                const index = game.players.findIndex(
                  (candidate) => candidate.user_id === player.user_id,
                )
                return (
                  <Button
                    key={player.user_id}
                    variant="outlined"
                    color="secondary"
                    onClick={() => setRecipientId(player.user_id)}
                    startIcon={
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          bgcolor: playerColor(player, index),
                          color: '#0b0912',
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {index + 1}
                      </Avatar>
                    }
                    sx={{ minHeight: 64, fontSize: '1rem' }}
                  >
                    {player.display_name}
                  </Button>
                )
              })}
            </Stack>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <TradeSide
                title={user.display_name}
                cashLabel={t('cashOffered')}
                cash={offeredCash}
                onCashChange={setOfferedCash}
                availableCash={
                  game.players.find((player) => player.user_id === user.id)?.balance ?? 0
                }
                propertyIds={ownPropertyIds}
                selectedPropertyIds={offeredPropertyIds}
                receivedPropertyIds={requestedPropertyIds}
                onPropertyChange={setOfferedPropertyIds}
                pack={pack}
                game={game}
                viewerId={user.id}
              />
              <SwapHorizRoundedIcon
                color="secondary"
                sx={{ mt: 5, display: { xs: 'none', md: 'block' } }}
              />
              <TradeSide
                title={
                  otherPlayers.find((player) => player.user_id === recipientId)
                    ?.display_name ?? ''
                }
                cashLabel={t('cashRequested')}
                cash={requestedCash}
                onCashChange={setRequestedCash}
                availableCash={
                  game.players.find((player) => player.user_id === recipientId)?.balance ??
                  0
                }
                propertyIds={recipientPropertyIds}
                selectedPropertyIds={requestedPropertyIds}
                receivedPropertyIds={offeredPropertyIds}
                onPropertyChange={setRequestedPropertyIds}
                pack={pack}
                game={game}
                viewerId={user.id}
              />
            </Box>
          )}
        </DialogContent>
        {recipientId && (
          <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SendRoundedIcon />}
              disabled={busy || !canSend}
              onClick={async () => {
                const terms = {
                  offered_cash: offeredCash,
                  requested_cash: requestedCash,
                  offered_property_ids: offeredPropertyIds,
                  requested_property_ids: requestedPropertyIds,
                }
                const sent = await onCommand(
                  counteringTradeId
                    ? {
                        action: 'counter_trade',
                        trade_id: counteringTradeId,
                        ...terms,
                      }
                    : {
                        action: 'propose_trade',
                        recipient_id: recipientId,
                        ...terms,
                      },
                )
                if (sent) close()
              }}
              sx={{ minHeight: 48, px: 3 }}
            >
              {t(counteringTradeId ? 'sendCounterOffer' : 'sendOffer')}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Stack>
  )
}

interface TradeDetailSideProps {
  title: string
  cash: number
  propertyIds: string[]
  pack: ContentPack
}

function TradeDetailSide({
  title,
  cash,
  propertyIds,
  pack,
}: TradeDetailSideProps) {
  const { t } = useTranslation()
  const propertyGroups = groupPropertyIds(pack, propertyIds)
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'rgba(255,255,255,.045)',
        minWidth: 0,
      }}
    >
      <Typography fontWeight={850} textAlign="center" mb={1.5}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {cash > 0 ? t('tradeCashAmount', { amount: cash }) : t('tradeNoCash')}
      </Typography>
      <Typography variant="overline" color="secondary.light" display="block" mt={1.5}>
        {t('properties')}
      </Typography>
      {propertyIds.length > 0 ? (
        <Stack spacing={1.5}>
          {propertyGroups.map((group) => (
            <Stack key={group.key} spacing={0.75}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    bgcolor: group.accent,
                  }}
                />
                <Typography variant="caption" fontWeight={850}>
                  {group.name ?? t(`tileKind.${group.kind}`)}
                </Typography>
                <Chip size="small" label={group.propertyIds.length} />
              </Stack>
              {group.propertyIds.map((propertyId) => (
                <TradePropertyCard
                  key={propertyId}
                  propertyId={propertyId}
                  pack={pack}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t('tradeNoProperties')}
        </Typography>
      )}
    </Box>
  )
}

interface TradePropertyCardProps {
  propertyId: string
  pack: ContentPack
}

function TradePropertyCard({ propertyId, pack }: TradePropertyCardProps) {
  const { t } = useTranslation()
  const info = tradePropertyInfo(pack, propertyId)
  if (!info) return null
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        minWidth: 0,
        borderColor: `color-mix(in srgb, ${info.accent} 65%, transparent)`,
        borderLeft: `5px solid ${info.accent}`,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 1.25,
        }}
      >
        <Box minWidth={0}>
          <Typography fontWeight={800}>{info.name}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" mt={0.75}>
            <Chip
              size="small"
              label={info.groupName ?? t(`tileKind.${info.tile.kind}`)}
              sx={{
                '&::before': {
                  content: '""',
                  width: 9,
                  height: 9,
                  ml: 1,
                  borderRadius: '50%',
                  bgcolor: info.accent,
                },
              }}
            />
            <Chip
              size="small"
              variant="outlined"
              icon={<MapRoundedIcon />}
              label={t('tradeBoardPosition', {
                position: info.position + 1,
                total: pack.manifest.tile_count,
              })}
            />
          </Stack>
        </Box>
        <MiniBoardPosition
          side={pack.manifest.side_length}
          tileCount={pack.manifest.tile_count}
          selectedPosition={info.position}
          accent={info.accent}
          label={t('tradeBoardMapLabel', {
            property: info.name,
            position: info.position + 1,
          })}
        />
      </Box>
    </Paper>
  )
}

interface MiniBoardPositionProps {
  side: number
  tileCount: number
  selectedPosition: number
  accent: string
  label: string
}

function MiniBoardPosition({
  side,
  tileCount,
  selectedPosition,
  accent,
  label,
}: MiniBoardPositionProps) {
  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${side}, minmax(0, 1fr))`,
        width: { xs: 72, sm: 84 },
        aspectRatio: '1',
        p: 0.5,
        borderRadius: 1.5,
        bgcolor: '#100d1d',
        border: '1px solid rgba(255,255,255,.1)',
      }}
    >
      {Array.from({ length: tileCount }, (_, index) => {
        const position = perimeterPosition(index, side)
        const selected = index === selectedPosition
        return (
          <Box
            key={index}
            aria-hidden
            sx={{
              gridColumn: position.column,
              gridRow: position.row,
              bgcolor: selected ? accent : 'rgba(255,255,255,.16)',
              borderRadius: selected ? '50%' : 0.25,
              outline: selected ? '2px solid white' : 'none',
              zIndex: selected ? 1 : 0,
            }}
          />
        )
      })}
    </Box>
  )
}

interface SystemTradeAnalysisProps {
  analysis: TradeAnalysis | null
  loading: boolean
  failed: boolean
  game: GameState
  trade: TradeOffer
  userId: string
  boardHistory: BoardHistoricalStats | null
}

function SystemTradeAnalysis({
  analysis,
  loading,
  failed,
  game,
  trade,
  userId,
  boardHistory,
}: SystemTradeAnalysisProps) {
  const { t } = useTranslation()
  if (loading || (!analysis && !failed)) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {t('tradeSystemAnalyzing')}
        </Typography>
      </Stack>
    )
  }
  if (failed || !analysis) {
    return <Alert severity="warning">{t('tradeSystemUnavailable')}</Alert>
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(255,255,255,.16)' }}>
      <Typography fontWeight={850}>{t('tradeSystemAnalysis')}</Typography>
      <Typography variant="body2" color="text.secondary" mt={0.25}>
        {t('tradeSystemComparisonHelp')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 1.5,
          mt: 1.5,
        }}
      >
        <TradeSideAnalysisCard
          side={analysis.proposer_analysis}
          name={playerName(game, trade.proposer_id)}
          isUser={trade.proposer_id === userId}
        />
        <TradeSideAnalysisCard
          side={analysis.recipient_analysis}
          name={playerName(game, trade.recipient_id)}
          isUser={trade.recipient_id === userId}
        />
      </Box>
      <TradeHistoricalAnalysis
        game={game}
        trade={trade}
        boardHistory={boardHistory}
      />
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
        {t('tradeSystemDisclaimer')}
      </Typography>
    </Paper>
  )
}

function TradeHistoricalAnalysis({
  game,
  trade,
  boardHistory,
}: {
  game: GameState
  trade: TradeOffer
  boardHistory: BoardHistoricalStats | null
}) {
  const { t } = useTranslation()
  if (!boardHistory || boardHistory.game_count === 0) {
    return (
      <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
        {t('propertyHistory.noHistory')}
      </Alert>
    )
  }
  const offered = summarizeHistoricalProperties(
    boardHistory,
    trade.offered_property_ids,
  )
  const requested = summarizeHistoricalProperties(
    boardHistory,
    trade.requested_property_ids,
  )
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography fontWeight={850}>{t('tradeHistoricalAnalysis')}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t('propertyHistory.sample', { count: boardHistory.game_count })}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 1,
          mt: 1,
        }}
      >
        <TradeHistoricalSide
          name={playerName(game, trade.proposer_id)}
          receives={requested}
          gives={offered}
        />
        <TradeHistoricalSide
          name={playerName(game, trade.recipient_id)}
          receives={offered}
          gives={requested}
        />
      </Box>
    </Box>
  )
}

function TradeHistoricalSide({
  name,
  receives,
  gives,
}: {
  name: string
  receives: ReturnType<typeof summarizeHistoricalProperties>
  gives: ReturnType<typeof summarizeHistoricalProperties>
}) {
  const { t } = useTranslation()
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'rgba(255,255,255,.12)' }}>
      <Typography fontWeight={800}>{name}</Typography>
      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
        {t('tradeHistoricalReceives', {
          percent: receives.landingPercent,
          rent: receives.totalRent,
        })}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {t('tradeHistoricalGives', {
          percent: gives.landingPercent,
          rent: gives.totalRent,
        })}
      </Typography>
    </Paper>
  )
}

function TradeSideAnalysisCard({
  side,
  name,
  isUser,
}: {
  side: TradeSideAnalysis
  name: string
  isUser: boolean
}) {
  const { t } = useTranslation()
  const severity = convenienceSeverity(side.convenience_level)
  return (
    <Alert severity={severity} variant="outlined" sx={{ alignItems: 'stretch' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box>
          <Typography fontWeight={850}>
            {name} {isUser ? `(${t('tradeYou')})` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t(`tradeRoles.${side.role}`)}
          </Typography>
        </Box>
        <Chip
          size="small"
          color={severity === 'info' ? 'default' : severity}
          label={t(`tradeConvenienceLevel.${side.convenience_level}`)}
          sx={{ fontWeight: 850 }}
        />
      </Stack>
      <Typography variant="body2" fontWeight={750} mt={1}>
        {t(`tradeSystemVerdict.${side.verdict}`)}
      </Typography>
      <Typography variant="caption" color="text.secondary" mt={0.25}>
        {t('tradeSystemReason', {
          reason: t(`activity.botReason.${side.reason_code}`),
        })}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          mt: 1.25,
        }}
      >
        <AnalysisValue label={t('tradeEstimatedGain')} value={`$${side.estimated_gain}`} />
        <AnalysisValue label={t('tradeEstimatedCost')} value={`$${side.estimated_cost}`} />
        <AnalysisValue
          label={t('tradeEstimatedBalance')}
          value={signedMoney(side.estimated_surplus)}
        />
        <AnalysisValue
          label={t('tradeRiskAdjustedBalance')}
          value={signedMoney(side.risk_adjusted_surplus)}
        />
        <AnalysisValue
          label={t('tradeCashAfterWithReserve', { reserve: side.liquidity_floor })}
          value={`$${side.cash_after}`}
          warning={side.cash_after < side.liquidity_floor}
        />
        <AnalysisValue
          label={t('tradeHighestPayment')}
          value={`$${side.highest_payment_after}`}
        />
      </Box>
      <Divider sx={{ my: 1.25 }} />
      <Typography variant="caption" fontWeight={850} color="text.secondary">
        {t('tradeProjectionTitle')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 1,
          mt: 0.75,
        }}
      >
        <AnalysisValue
          label={t('tradePaymentProbability')}
          value={`${side.payment_probability_before}% → ${side.payment_probability_after}%`}
          warning={side.payment_probability_after > side.payment_probability_before}
        />
        <AnalysisValue
          label={t('tradeExpectedPayments')}
          value={`$${side.expected_payments_before} → $${side.expected_payments_after}`}
          warning={side.expected_payments_after > side.expected_payments_before}
        />
        <AnalysisValue
          label={t('tradeExpectedIncome')}
          value={`$${side.expected_rent_income_before} → $${side.expected_rent_income_after}`}
        />
      </Box>
    </Alert>
  )
}

function convenienceSeverity(
  level: TradeSideAnalysis['convenience_level'],
): 'success' | 'info' | 'warning' | 'error' {
  if (level === 'very_favorable' || level === 'favorable') return 'success'
  if (level === 'balanced') return 'info'
  if (level === 'unfavorable') return 'warning'
  return 'error'
}

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value)}`
}

interface AnalysisValueProps {
  label: string
  value: string
  warning?: boolean
}

function AnalysisValue({ label, value, warning = false }: AnalysisValueProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography fontWeight={850} color={warning ? 'warning.main' : 'text.primary'}>
        {value}
      </Typography>
    </Box>
  )
}

interface TradeSideProps {
  title: string
  cashLabel: string
  cash: number
  onCashChange: (cash: number) => void
  availableCash: number
  propertyIds: string[]
  selectedPropertyIds: string[]
  receivedPropertyIds: string[]
  onPropertyChange: (propertyIds: string[]) => void
  pack: ContentPack
  game: GameState
  viewerId: string
}

function TradeSide({
  title,
  cashLabel,
  cash,
  onCashChange,
  availableCash,
  propertyIds,
  selectedPropertyIds,
  receivedPropertyIds,
  onPropertyChange,
  pack,
  game,
  viewerId,
}: TradeSideProps) {
  const { t } = useTranslation()
  const propertyGroups = groupPropertyIds(pack, propertyIds)
  const selectedOriginalValue = originalPropertyValue(pack, selectedPropertyIds)
  const receivedOriginalValue = originalPropertyValue(pack, receivedPropertyIds)
  const cashSuggestions = tradeCashSuggestions(
    receivedOriginalValue,
    selectedOriginalValue,
    availableCash,
  )
  return (
    <Stack spacing={2}>
      <Typography variant="h6" fontWeight={850} textAlign="center">
        {title}
      </Typography>
      <TextField
        type="number"
        label={cashLabel}
        value={cash === 0 ? '' : cash}
        placeholder={t('tradeCashPlaceholder')}
        onChange={(event) => {
          const nextCash = Number(event.target.value)
          onCashChange(Number.isFinite(nextCash) ? Math.max(0, Math.floor(nextCash)) : 0)
        }}
        slotProps={{
          htmlInput: { min: 0, max: availableCash, step: 1, inputMode: 'numeric' },
        }}
      />
      {cashSuggestions.length > 0 && (
        <Box>
          <Typography variant="overline" color="secondary.light">
            {t('tradeCashSuggestions')}
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {cashSuggestions.map((suggestion) => (
              <Button
                key={`${suggestion.kind}:${suggestion.amount}`}
                size="small"
                variant={cash === suggestion.amount ? 'contained' : 'outlined'}
                color="secondary"
                onClick={() => onCashChange(suggestion.amount)}
                sx={{ textTransform: 'none' }}
              >
                {t(`tradeCashSuggestion.${suggestion.kind}`)} · ${suggestion.amount}
              </Button>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
            {t('tradeCashSuggestionHelp')}
          </Typography>
        </Box>
      )}
      <FormControl>
        <InputLabel>{t('properties')}</InputLabel>
        <Select
          multiple
          label={t('properties')}
          value={selectedPropertyIds}
          onChange={(event) =>
            onPropertyChange(
              typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value,
            )
          }
          renderValue={(selected) =>
            t('selectedProperties', { count: selected.length })
          }
        >
          {propertyGroups.flatMap((group) => [
            <ListSubheader
              key={`${group.key}:header`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.75,
                color: 'text.primary',
                bgcolor: 'background.paper',
                borderBottom: `1px solid ${group.accent}55`,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: group.accent,
                }}
              />
              <Box component="span" sx={{ flexGrow: 1, fontWeight: 850 }}>
                {group.name ?? t(`tileKind.${group.kind}`)}
              </Box>
              <Chip size="small" label={group.propertyIds.length} />
            </ListSubheader>,
            ...group.propertyIds.map((propertyId) => {
              const info = tradePropertyInfo(pack, propertyId)
              const ownedInGroup = info?.tile.group
                ? pack.board.tiles.filter(
                    (tile) =>
                      tile.group === info.tile.group &&
                      game.owners[tile.id] === viewerId,
                  ).length
                : 0
              return (
                <MenuItem
                  key={propertyId}
                  value={propertyId}
                  sx={{
                    borderLeft: `4px solid ${info?.accent ?? 'transparent'}`,
                  }}
                >
                  <Checkbox checked={selectedPropertyIds.includes(propertyId)} />
                  <ListItemText
                    primary={info?.name ?? propertyId}
                    secondary={t('tradePropertyMeta', {
                      group:
                        info?.groupName ??
                        (info ? t(`tileKind.${info.tile.kind}`) : t('property')),
                      position: (info?.position ?? 0) + 1,
                      total: pack.manifest.tile_count,
                    })}
                  />
                  {ownedInGroup > 0 && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t('rentDebt.ownedInPropertyGroup', {
                        count: ownedInGroup,
                      })}
                      sx={{
                        ml: 1,
                        fontWeight: 800,
                        color: info?.accent,
                        borderColor: `${info?.accent ?? '#8f8a9d'}99`,
                      }}
                    />
                  )}
                </MenuItem>
              )
            }),
          ])}
        </Select>
      </FormControl>
    </Stack>
  )
}

function originalPropertyValue(pack: ContentPack, propertyIds: string[]): number {
  const requested = new Set(propertyIds)
  return pack.board.tiles.reduce(
    (total, tile) => total + (requested.has(tile.id) ? (tile.price ?? 0) : 0),
    0,
  )
}

interface TradePropertyInfo {
  tile: TileDefinition
  name: string
  groupName: string | null
  accent: string
  position: number
}

function tradePropertyInfo(
  pack: ContentPack,
  propertyId: string,
): TradePropertyInfo | null {
  const position = pack.board.tiles.findIndex((tile) => tile.id === propertyId)
  if (position < 0) return null
  const tile = pack.board.tiles[position]
  const group = pack.board.groups?.find((candidate) => candidate.id === tile.group)
  return {
    tile,
    name: pack.messages[tile.name_key] ?? tile.id,
    groupName: group ? (pack.messages[group.name_key] ?? group.id) : null,
    accent: tile.color ?? group?.color ?? defaultTileColor(tile.kind),
    position,
  }
}

function playerName(game: GameState, playerId: string): string {
  return (
    game.players.find((player) => player.user_id === playerId)?.display_name ??
    playerId
  )
}
