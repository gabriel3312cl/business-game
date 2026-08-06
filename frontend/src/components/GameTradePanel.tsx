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
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { advisorApi } from '../advisor/api'
import type { AdvisorResponse } from '../advisor/types'
import { api } from '../api'
import type {
  ContentPack,
  GameCommand,
  GameState,
  TileDefinition,
  TradeAnalysis,
  TradeOffer,
  User,
} from '../types'
import { perimeterPosition } from './boardGeometry'
import { playerColors } from './gameColors'
import { defaultTileColor } from './tilePresentation'

const AdvisorMarkdown = lazy(() => import('../advisor/AdvisorMarkdown'))

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  onCommand: (command: GameCommand) => Promise<boolean>
}

export function GameTradePanel({
  game,
  pack,
  user,
  busy,
  error,
  onCommand,
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [open, setOpen] = useState(false)
  const [detailTradeId, setDetailTradeId] = useState<string | null>(null)
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
  const otherPlayers = game.players.filter(
    (player) => player.user_id !== user.id && !player.bankrupt,
  )
  const canTrade = game.players.some(
    (player) => player.user_id === user.id && !player.bankrupt,
  )
  const ownPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === user.id && (game.building_levels[propertyId] ?? 0) === 0,
    )
    .map(([propertyId]) => propertyId)
  const recipientPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === recipientId && (game.building_levels[propertyId] ?? 0) === 0,
    )
    .map(([propertyId]) => propertyId)
  const pendingTrades = game.trades.filter(
    (trade) =>
      trade.status === 'pending' &&
      (trade.proposer_id === user.id || trade.recipient_id === user.id),
  )
  const detailTrade = pendingTrades.find((trade) => trade.id === detailTradeId)
  const propertyName = (propertyId: string) => {
    const tile = pack.board.tiles.find(
      (candidate) => candidate.id === propertyId,
    )
    return tile ? pack.messages[tile.name_key] : propertyId
  }

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
    const isRecipient = detailTrade.recipient_id === user.id
    const incomingCash = isRecipient
      ? detailTrade.offered_cash
      : detailTrade.requested_cash
    const outgoingCash = isRecipient
      ? detailTrade.requested_cash
      : detailTrade.offered_cash
    const incomingProperties = (
      isRecipient
        ? detailTrade.offered_property_ids
        : detailTrade.requested_property_ids
    ).map(propertyName)
    const outgoingProperties = (
      isRecipient
        ? detailTrade.requested_property_ids
        : detailTrade.offered_property_ids
    ).map(propertyName)
    setAiAnalysisLoading(true)
    setAiAnalysisError(false)
    try {
      setAiAnalysis(
        await advisorApi.ask(game.id, {
          question: t('tradeAiQuestion', {
            incomingCash,
            outgoingCash,
            netCash: incomingCash - outgoingCash,
            incomingProperties:
              incomingProperties.join(', ') || t('tradeNoProperties'),
            outgoingProperties:
              outgoingProperties.join(', ') || t('tradeNoProperties'),
            estimatedGain: systemAnalysis.estimated_gain,
            estimatedCost: systemAnalysis.estimated_cost,
            estimatedSurplus: systemAnalysis.estimated_surplus,
            cashAfter: systemAnalysis.cash_after,
            liquidityFloor: systemAnalysis.liquidity_floor,
            systemVerdict: systemAnalysis.verdict,
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
            game.status !== 'playing' || !canTrade || otherPlayers.length === 0
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
          {recipientId && (
            <IconButton
              aria-label={t('back')}
              onClick={() => setRecipientId('')}
              sx={{ position: 'absolute', left: 12, top: 10 }}
            >
              <ArrowBackRoundedIcon />
            </IconButton>
          )}
          {t('createTrade')}
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
              {otherPlayers.map((player) => {
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
                          bgcolor: playerColors[index % playerColors.length],
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
                cash={offeredCash}
                onCashChange={setOfferedCash}
                propertyIds={ownPropertyIds}
                selectedPropertyIds={offeredPropertyIds}
                onPropertyChange={setOfferedPropertyIds}
                pack={pack}
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
                cash={requestedCash}
                onCashChange={setRequestedCash}
                propertyIds={recipientPropertyIds}
                selectedPropertyIds={requestedPropertyIds}
                onPropertyChange={setRequestedPropertyIds}
                pack={pack}
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
                const sent = await onCommand({
                  action: 'propose_trade',
                  recipient_id: recipientId,
                  offered_cash: offeredCash,
                  requested_cash: requestedCash,
                  offered_property_ids: offeredPropertyIds,
                  requested_property_ids: requestedPropertyIds,
                })
                if (sent) close()
              }}
              sx={{ minHeight: 48, px: 3 }}
            >
              {t('sendOffer')}
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
        <Stack spacing={1}>
          {propertyIds.map((propertyId) => (
            <TradePropertyCard key={propertyId} propertyId={propertyId} pack={pack} />
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
}

function SystemTradeAnalysis({
  analysis,
  loading,
  failed,
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
  const severity =
    analysis.verdict === 'accept'
      ? 'success'
      : analysis.verdict === 'counter'
        ? 'warning'
        : 'error'
  return (
    <Alert severity={severity} variant="outlined">
      <Typography fontWeight={850}>{t('tradeSystemAnalysis')}</Typography>
      <Typography variant="body2" fontWeight={750} mt={0.5}>
        {t(`tradeSystemVerdict.${analysis.verdict}`)}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={0.5}>
        {t('tradeSystemReason', {
          reason: t(`activity.botReason.${analysis.reason_code}`),
        })}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, 1fr)' },
          gap: 1,
          mt: 1.5,
        }}
      >
        <AnalysisValue label={t('tradeEstimatedGain')} value={`$${analysis.estimated_gain}`} />
        <AnalysisValue label={t('tradeEstimatedCost')} value={`$${analysis.estimated_cost}`} />
        <AnalysisValue
          label={t('tradeEstimatedBalance')}
          value={`${analysis.estimated_surplus >= 0 ? '+' : '-'}$${Math.abs(
            analysis.estimated_surplus,
          )}`}
        />
        <AnalysisValue
          label={t('tradeCashAfter')}
          value={`$${analysis.cash_after}`}
          warning={analysis.cash_after < analysis.liquidity_floor}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
        {t('tradeSystemDisclaimer', { reserve: analysis.liquidity_floor })}
      </Typography>
    </Alert>
  )
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
  cash: number
  onCashChange: (cash: number) => void
  propertyIds: string[]
  selectedPropertyIds: string[]
  onPropertyChange: (propertyIds: string[]) => void
  pack: ContentPack
}

function TradeSide({
  title,
  cash,
  onCashChange,
  propertyIds,
  selectedPropertyIds,
  onPropertyChange,
  pack,
}: TradeSideProps) {
  const { t } = useTranslation()
  return (
    <Stack spacing={2}>
      <Typography variant="h6" fontWeight={850} textAlign="center">
        {title}
      </Typography>
      <TextField
        type="number"
        label={t('cash')}
        value={cash}
        onChange={(event) => onCashChange(Math.max(0, Number(event.target.value)))}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
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
          {propertyIds.map((propertyId) => {
            const info = tradePropertyInfo(pack, propertyId)
            return (
              <MenuItem
                key={propertyId}
                value={propertyId}
                sx={{ borderLeft: `4px solid ${info?.accent ?? 'transparent'}` }}
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
              </MenuItem>
            )
          })}
        </Select>
      </FormControl>
    </Stack>
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
