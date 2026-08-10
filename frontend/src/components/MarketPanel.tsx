import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import type { TFunction } from 'i18next'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { advisorApi } from '../advisor/api'
import type {
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  InvestmentInstrumentState,
  User,
} from '../types'
import type { GameViewPreferenceSettings } from '../types'
import {
  buildInstrumentHistory,
  buildMarketIndexHistory,
  marketOrderQuote,
  type MarketPoint,
} from './marketData'
import {
  buildPortfolioPerformance,
  type PortfolioPerformance,
} from './portfolioPerformance'

const AdvisorMarkdown = lazy(() => import('../advisor/AdvisorMarkdown'))

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
  activeTab?: GameViewPreferenceSettings['market_tab']
  onTabChange?: (tab: GameViewPreferenceSettings['market_tab']) => void
}

export function MarketPanel({
  game,
  pack,
  user,
  busy,
  onCommand,
  activeTab: controlledActiveTab,
  onTabChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(
    null,
  )
  const [quantity, setQuantity] = useState('1')
  const [internalActiveTab, setInternalActiveTab] = useState<
    GameViewPreferenceSettings['market_tab']
  >('market')
  const activeTab = controlledActiveTab ?? internalActiveTab
  const setActiveTab = (nextTab: GameViewPreferenceSettings['market_tab']) => {
    if (controlledActiveTab === undefined) setInternalActiveTab(nextTab)
    onTabChange?.(nextTab)
  }
  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language],
  )
  const preciseCurrency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 4,
      }),
    [i18n.language],
  )
  const money = (amount: number) => `$${currency.format(amount)}`
  const preciseMoney = (units: number) =>
    `$${preciseCurrency.format(units / 10_000)}`
  const marketIndex = useMemo(
    () => buildMarketIndexHistory(game.bank.investments, game.events),
    [game.bank.investments, game.events],
  )
  const selectedInstrument = game.bank.investments.find(
    (instrument) => instrument.id === selectedInstrumentId,
  )
  const latestSequence = game.events[game.events.length - 1]?.sequence ?? 0

  useEffect(() => {
    setSelectedInstrumentId(null)
    setQuantity('1')
    if (controlledActiveTab === undefined) setInternalActiveTab('market')
  }, [controlledActiveTab, game.id])

  if (!game.bank.initialized) {
    return <Alert severity="info">{t('marketPanel.initializing')}</Alert>
  }
  if (!game.settings.rules.stock_market_enabled) {
    return <Alert severity="info">{t('marketPanel.disabled')}</Alert>
  }
  if (game.bank.investments.length === 0) {
    return <Alert severity="info">{t('marketPanel.empty')}</Alert>
  }

  const currentIndex = marketIndex[marketIndex.length - 1]?.value ?? 100
  const indexChange = currentIndex - 100
  const indexInstrument = game.bank.investments.find(
    (instrument) => instrument.instrument_kind === 'index',
  )

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <ShowChartRoundedIcon color="secondary" />
        <Box minWidth={0} flex={1}>
          <Typography fontWeight={900}>{t('marketPanel.title')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('marketPanel.subtitle')}
          </Typography>
        </Box>
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={t('marketPanel.live', { sequence: latestSequence })}
        />
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(_, value: 'market' | 'performance') => setActiveTab(value)}
        variant="fullWidth"
        aria-label={t('marketPanel.tabs.label')}
      >
        <Tab
          value="market"
          icon={<ShowChartRoundedIcon />}
          iconPosition="start"
          label={t('marketPanel.tabs.market')}
        />
        <Tab
          value="performance"
          icon={<AssessmentRoundedIcon />}
          iconPosition="start"
          label={t('marketPanel.tabs.performance')}
        />
      </Tabs>

      {activeTab === 'market' ? (
        <>
      <ButtonBase
        disabled={!indexInstrument}
        onClick={() => {
          if (!indexInstrument) return
          setSelectedInstrumentId(indexInstrument.id)
          setQuantity('1')
        }}
        sx={{ display: 'block', borderRadius: 1, textAlign: 'initial' }}
      >
        <Paper variant="outlined" sx={{ p: 1.5, width: '100%' }}>
          <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('marketPanel.index')}
              </Typography>
              <Typography variant="h5" fontWeight={950}>
                {currentIndex.toFixed(1)}
              </Typography>
            </Box>
            <ChangeChip value={indexChange} suffix="%" />
          </Stack>
          <MarketLineChart
            points={marketIndex}
            label={t('marketPanel.indexChart')}
            valueFormatter={(value) => value.toFixed(1)}
          />
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {t('marketPanel.indexHelp')}
              </Typography>
              {indexInstrument && (
                <Typography variant="caption" color="secondary.light">
                  {t('marketPanel.openDetail')}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </ButtonBase>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 1,
        }}
      >
        {game.bank.investments.map((instrument) => {
          const history = buildInstrumentHistory(instrument, game.events)
          const changePercent = priceChangePercent(instrument)
          const owned = instrument.holdings[user.id] ?? 0
          const quickOrderAvailability = getQuickOrderAvailability(
            game,
            pack,
            user.id,
            instrument,
          )
          return (
            <Paper
              key={instrument.id}
              variant="outlined"
              sx={{ height: '100%', overflow: 'hidden' }}
            >
              <ButtonBase
                onClick={() => {
                  setSelectedInstrumentId(instrument.id)
                  setQuantity('1')
                }}
                sx={{ display: 'block', p: 1.25, width: '100%', textAlign: 'initial' }}
              >
                <Stack spacing={0.8}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    spacing={1}
                  >
                    <Box minWidth={0}>
                      <Typography fontWeight={850} noWrap>
                        {instrumentName(instrument, pack, t)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t(
                          `bankPanel.instrumentTypes.${instrument.instrument_kind}`,
                        )}
                      </Typography>
                    </Box>
                    <ChangeChip value={changePercent} />
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="h6" fontWeight={900}>
                      {money(instrument.current_price)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('marketPanel.owned', { count: owned })}
                    </Typography>
                  </Stack>
                  <MarketSparkline points={history} rising={changePercent >= 0} />
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="caption" color="text.secondary">
                      {t('marketPanel.volume', {
                        count: instrument.trade_volume,
                      })}
                    </Typography>
                    <Typography variant="caption" color="secondary.light">
                      {t('marketPanel.openDetail')}
                    </Typography>
                  </Stack>
                </Stack>
              </ButtonBase>
              <Divider />
              <Stack direction="row" spacing={1} sx={{ p: 1 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  color="success"
                  aria-label={`${t('marketPanel.quickBuy')}: ${instrumentName(
                    instrument,
                    pack,
                    t,
                  )}`}
                  disabled={busy || !quickOrderAvailability.canBuy}
                  onClick={() =>
                    void onCommand({
                      action: 'buy_shares',
                      instrument_id: instrument.id,
                      quantity: 1,
                    })
                  }
                >
                  {t('marketPanel.quickBuy')}
                </Button>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="warning"
                  aria-label={`${t('marketPanel.quickSell')}: ${instrumentName(
                    instrument,
                    pack,
                    t,
                  )}`}
                  disabled={busy || !quickOrderAvailability.canSell}
                  onClick={() =>
                    void onCommand({
                      action: 'sell_shares',
                      instrument_id: instrument.id,
                      quantity: 1,
                    })
                  }
                >
                  {t('marketPanel.quickSell')}
                </Button>
              </Stack>
            </Paper>
          )
        })}
      </Box>

      {selectedInstrument && (
        <InstrumentDialog
          game={game}
          pack={pack}
          user={user}
          busy={busy}
          instrument={selectedInstrument}
          quantity={quantity}
          money={money}
          preciseMoney={preciseMoney}
          onQuantityChange={setQuantity}
          onClose={() => setSelectedInstrumentId(null)}
          onCommand={onCommand}
        />
      )}
        </>
      ) : (
        <PortfolioPerformancePanel
          game={game}
          pack={pack}
          user={user}
          money={money}
          preciseMoney={preciseMoney}
        />
      )}
    </Stack>
  )
}

function getQuickOrderAvailability(
  game: GameState,
  pack: ContentPack,
  userId: string,
  instrument: InvestmentInstrumentState,
) {
  const player = game.players.find((item) => item.user_id === userId)
  const currentPlayer = game.players[game.current_player_index]
  const canUseTurnActions =
    game.status === 'playing' &&
    currentPlayer?.user_id === userId &&
    player !== undefined &&
    !player.bankrupt &&
    game.active_auction === null &&
    game.pending_auction_selector_id === null
  const instrumentOrders = game.bank.market_orders.filter(
    (order) => order.instrument_id === instrument.id,
  )
  const sellDepth = instrumentOrders
    .filter((order) => order.side === 'sell' && order.player_id !== userId)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const buyDepth = instrumentOrders
    .filter((order) => order.side === 'buy' && order.player_id !== userId)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const pendingBuys = instrumentOrders
    .filter((order) => order.side === 'buy' && order.player_id === userId)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const reservedSells = instrumentOrders
    .filter((order) => order.side === 'sell' && order.player_id === userId)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const owned = instrument.holdings[userId] ?? 0
  const maximumHolding = Math.max(
    1,
    Math.floor(
      (instrument.total_shares * instrument.max_ownership_percent) / 100,
    ),
  )
  const buyQuote = marketOrderQuote(instrument, 1, true, sellDepth)
  const sellQuote = marketOrderQuote(instrument, 1, false, buyDepth)
  const activeLoan = game.bank.loans.find((loan) => loan.player_id === userId)
  const loanReserve = activeLoan
    ? activeLoan.installment_amount *
        pack.manifest.loan_investment_installment_reserve +
      Math.floor(
        (pack.manifest.pass_start_salary *
          pack.manifest.loan_investment_reserve_salary_percent) /
          100,
      )
    : 0
  const investmentExposure = game.bank.investments.reduce(
    (total, item) =>
      total + item.current_price * (item.holdings[userId] ?? 0),
    0,
  ) +
    game.bank.market_orders.reduce((total, order) => {
      if (order.player_id !== userId) return total
      if (order.side === 'buy') {
        return total + order.limit_price * order.remaining_quantity
      }
      const orderInstrument = game.bank.investments.find(
        (item) => item.id === order.instrument_id,
      )
      return (
        total +
        (orderInstrument?.current_price ?? 0) * order.remaining_quantity
      )
    }, 0)
  const leveragedExposureLimit = Math.max(
    0,
    Math.floor(
      (playerNetWorth(game, pack, userId) *
        pack.manifest.loan_investment_max_net_worth_percent) /
        100,
    ),
  )
  const creditScore = game.bank.credit_profiles[userId]?.score ?? 600
  const leveragedInvestmentAllowed =
    !activeLoan ||
    (creditScore >= 600 &&
      (player?.balance ?? 0) - buyQuote.settlement >= loanReserve &&
      investmentExposure + buyQuote.gross <= leveragedExposureLimit)
  const reserveFloor = Math.ceil(
    (game.bank.monetary_base * game.bank.minimum_reserve_percent) / 100,
  )

  return {
    canBuy:
      canUseTurnActions &&
      game.active_debt === null &&
      instrument.available_shares + sellDepth >= 1 &&
      owned + reservedSells + pendingBuys < maximumHolding &&
      (player?.balance ?? 0) >= buyQuote.settlement &&
      leveragedInvestmentAllowed,
    canSell:
      canUseTurnActions &&
      (game.active_debt === null || game.active_debt.debtor_id === userId) &&
      owned >= 1 &&
      game.bank.cash -
        game.bank.dividend_cash_reserve -
        sellQuote.settlement >=
        reserveFloor,
  }
}

function PortfolioPerformancePanel({
  game,
  pack,
  user,
  preciseMoney,
}: {
  game: GameState
  pack: ContentPack
  user: User
  money: (amount: number) => string
  preciseMoney: (units: number) => string
}) {
  const { t, i18n } = useTranslation()
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiSnapshot, setAiSnapshot] = useState<number | null>(null)
  const performance = useMemo(
    () => buildPortfolioPerformance(game, user.id),
    [game, user.id],
  )
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
    [i18n.language],
  )
  const formatMoney = (amount: number) => `$${formatter.format(amount)}`
  const latestSequence = game.events.at(-1)?.sequence ?? 0
  const activeLoan = game.bank.loans.find((loan) => loan.player_id === user.id)
  const adviceKeys = portfolioAdvice(performance, Boolean(activeLoan))
  const risk =
    performance.concentrationPercent >= 65 ||
    (activeLoan !== undefined && performance.returnPercent < 0)
      ? 'high'
      : performance.concentrationPercent >= 40 || activeLoan !== undefined
        ? 'medium'
        : 'low'

  useEffect(() => {
    setAiAnswer(null)
    setAiSnapshot(null)
    setAiError(false)
  }, [game.id, user.id])

  const askAi = async () => {
    if (aiBusy) return
    setAiBusy(true)
    setAiError(false)
    try {
      const response = await advisorApi.ask(game.id, {
        question: t('marketPanel.performance.aiPrompt'),
      })
      setAiAnswer(response.answer)
      setAiSnapshot(response.snapshot_sequence)
    } catch {
      setAiError(true)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <Stack spacing={1.5}>
      {performance.positions.length === 0 ? (
        <>
          <Alert severity="info">{t('marketPanel.performance.empty')}</Alert>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography fontWeight={850} mb={0.75}>
              {t('marketPanel.performance.startTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('marketPanel.performance.startAdvice')}
            </Typography>
          </Paper>
        </>
      ) : (
        <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 1,
        }}
      >
        <PerformanceMetric
          label={t('marketPanel.performance.currentValue')}
          value={formatMoney(performance.currentValue)}
        />
        <PerformanceMetric
          label={t('marketPanel.performance.totalProfit')}
          value={formatSignedMoney(performance.totalProfit, formatMoney)}
          tone={performance.totalProfit >= 0 ? 'positive' : 'negative'}
        />
        <PerformanceMetric
          label={t('marketPanel.performance.totalReturn')}
          value={formatPercent(performance.returnPercent)}
          tone={performance.returnPercent >= 0 ? 'positive' : 'negative'}
        />
        <PerformanceMetric
          label={t('marketPanel.performance.dividends')}
          value={formatMoney(performance.dividends)}
        />
        <PerformanceMetric
          label={t('marketPanel.performance.pending')}
          value={preciseMoney(performance.pendingDividendUnits)}
        />
        <PerformanceMetric
          label={t('marketPanel.performance.risk')}
          value={t(`marketPanel.performance.riskLevels.${risk}`)}
          tone={risk === 'high' ? 'negative' : risk === 'low' ? 'positive' : 'neutral'}
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography fontWeight={850} mb={1}>
          {t('marketPanel.performance.evolution')}
        </Typography>
        <MarketLineChart
          points={performance.history}
          label={t('marketPanel.performance.evolutionChart')}
          valueFormatter={formatMoney}
        />
        <Typography variant="caption" color="text.secondary">
          {t('marketPanel.performance.evolutionHelp')}
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography fontWeight={850} mb={1}>
          {t('marketPanel.performance.breakdown')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1,
            mb: 1.5,
          }}
        >
          <DataRow
            label={t('marketPanel.performance.costBasis')}
            value={formatMoney(performance.costBasis)}
          />
          <DataRow
            label={t('marketPanel.performance.unrealized')}
            value={formatSignedMoney(performance.unrealizedProfit, formatMoney)}
          />
          <DataRow
            label={t('marketPanel.performance.realized')}
            value={formatSignedMoney(performance.realizedProfit, formatMoney)}
          />
          <DataRow
            label={t('marketPanel.performance.concentration')}
            value={formatPercent(performance.concentrationPercent)}
          />
        </Box>
        <Stack spacing={1}>
          {performance.positions.map((position) => (
            <Paper key={position.instrument.id} variant="outlined" sx={{ p: 1.1 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Box minWidth={0}>
                    <Typography fontWeight={850} noWrap>
                      {instrumentName(position.instrument, pack, t)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('marketPanel.performance.positionShares', {
                        count: position.shares,
                        average: formatMoney(position.averageCost),
                      })}
                    </Typography>
                  </Box>
                  <Box textAlign="right">
                    <Typography fontWeight={850}>
                      {formatMoney(position.currentValue)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={position.totalProfit >= 0 ? 'success.main' : 'error.main'}
                    >
                      {formatPercent(position.returnPercent)}
                    </Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    height: 5,
                    borderRadius: 8,
                    bgcolor: 'rgba(255,255,255,.07)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      width: `${Math.min(
                        100,
                        (position.currentValue * 100) /
                          Math.max(1, performance.currentValue),
                      )}%`,
                      height: '100%',
                      bgcolor: 'secondary.main',
                    }}
                  />
                </Box>
                <Stack direction="row" flexWrap="wrap" gap={1.5}>
                  <Typography variant="caption" color="text.secondary">
                    {t('marketPanel.performance.unrealizedShort', {
                      amount: formatSignedMoney(
                        position.unrealizedProfit,
                        formatMoney,
                      ),
                    })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('marketPanel.performance.realizedShort', {
                      amount: formatSignedMoney(position.realizedProfit, formatMoney),
                    })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('marketPanel.performance.dividendsShort', {
                      amount: formatMoney(position.dividends),
                    })}
                  </Typography>
                </Stack>
                {position.estimatedCostBasis && (
                  <Typography variant="caption" color="warning.main">
                    {t('marketPanel.performance.estimatedBasis')}
                  </Typography>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Paper>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Typography fontWeight={850}>
                {t('marketPanel.performance.adviceTitle')}
              </Typography>
              {adviceKeys.map((key) => (
                <Alert key={key} severity={adviceSeverity(key)}>
                  {t(`marketPanel.performance.advice.${key}`)}
                </Alert>
              ))}
            </Stack>
          </Paper>
        </>
      )}

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ sm: 'center' }}
            spacing={1}
          >
            <AutoAwesomeRoundedIcon color="secondary" />
            <Box flex={1}>
              <Typography fontWeight={900}>
                {t('marketPanel.performance.aiTitle')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('marketPanel.performance.aiHelp')}
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="secondary"
              disabled={aiBusy}
              startIcon={
                aiBusy ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />
              }
              onClick={() => void askAi()}
            >
              {aiBusy
                ? t('marketPanel.performance.aiThinking')
                : t('marketPanel.performance.aiButton')}
            </Button>
          </Stack>
          {aiError && (
            <Alert severity="warning">{t('marketPanel.performance.aiError')}</Alert>
          )}
          {aiAnswer && (
            <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(0,0,0,.15)' }}>
              <Suspense
                fallback={
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {aiAnswer}
                  </Typography>
                }
              >
                <AdvisorMarkdown>{aiAnswer}</AdvisorMarkdown>
              </Suspense>
              {aiSnapshot !== null && aiSnapshot < latestSequence && (
                <Chip
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  label={t('advisor.stale')}
                />
              )}
            </Paper>
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}

function PerformanceMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        fontWeight={900}
        color={
          tone === 'positive'
            ? 'success.main'
            : tone === 'negative'
              ? 'error.main'
              : 'text.primary'
        }
      >
        {value}
      </Typography>
    </Paper>
  )
}

function portfolioAdvice(
  performance: PortfolioPerformance,
  hasLoan: boolean,
): string[] {
  const advice: string[] = []
  if (performance.concentrationPercent >= 60) advice.push('concentration')
  if (hasLoan) advice.push('leverage')
  if (performance.totalProfit < 0) advice.push('losses')
  if (performance.pendingDividendUnits > 0) advice.push('pendingDividends')
  if (
    performance.positions.filter((position) => position.shares > 0).length === 1
  ) {
    advice.push('diversify')
  }
  if (advice.length === 0) advice.push('balanced')
  return advice.slice(0, 3)
}

function adviceSeverity(
  key: string,
): 'success' | 'info' | 'warning' | 'error' {
  if (key === 'balanced') return 'success'
  if (key === 'pendingDividends') return 'info'
  if (key === 'losses') return 'error'
  return 'warning'
}

function formatSignedMoney(
  amount: number,
  formatter: (amount: number) => string,
): string {
  return `${amount > 0 ? '+' : ''}${formatter(amount)}`
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function InstrumentDialog({
  game,
  pack,
  user,
  busy,
  instrument,
  quantity,
  money,
  preciseMoney,
  onQuantityChange,
  onClose,
  onCommand,
}: {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  instrument: InvestmentInstrumentState
  quantity: string
  money: (amount: number) => string
  preciseMoney: (units: number) => string
  onQuantityChange: (quantity: string) => void
  onClose: () => void
  onCommand: (command: GameCommand) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState(String(instrument.current_price))
  useEffect(() => {
    setOrderType('market')
    setLimitPrice(String(instrument.current_price))
  }, [instrument.id, instrument.current_price])
  const player = game.players.find((item) => item.user_id === user.id)
  const currentPlayer = game.players[game.current_player_index]
  const activeLoan = game.bank.loans.find((loan) => loan.player_id === user.id)
  const creditScore = game.bank.credit_profiles[user.id]?.score ?? 600
  const parsedQuantity = Number(quantity)
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0
  const quotedQuantity = validQuantity
    ? Math.min(parsedQuantity, instrument.total_shares)
    : 1
  const owned = instrument.holdings[user.id] ?? 0
  const instrumentOrders = game.bank.market_orders.filter(
    (order) => order.instrument_id === instrument.id,
  )
  const sellDepth = instrumentOrders
    .filter((order) => order.side === 'sell' && order.player_id !== user.id)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const buyDepth = instrumentOrders
    .filter((order) => order.side === 'buy' && order.player_id !== user.id)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const pendingBuys = instrumentOrders
    .filter((order) => order.side === 'buy' && order.player_id === user.id)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const reservedSells = instrumentOrders
    .filter((order) => order.side === 'sell' && order.player_id === user.id)
    .reduce((total, order) => total + order.remaining_quantity, 0)
  const ownedTotal = owned + reservedSells
  const maximumHolding = Math.max(
    1,
    Math.floor(
      (instrument.total_shares * instrument.max_ownership_percent) / 100,
    ),
  )
  const buyQuote = marketOrderQuote(
    instrument,
    quotedQuantity,
    true,
    sellDepth,
  )
  const sellQuote = marketOrderQuote(
    instrument,
    quotedQuantity,
    false,
    buyDepth,
  )
  const parsedLimitPrice = Number(limitPrice)
  const validLimitPrice =
    Number.isInteger(parsedLimitPrice) && parsedLimitPrice > 0
  const limitBuyReserve = validQuantity && validLimitPrice
    ? parsedQuantity *
      (parsedLimitPrice +
        Math.ceil(
          (parsedLimitPrice * instrument.transaction_fee_percent) / 100,
        ))
    : 0
  const canUseTurnActions =
    game.status === 'playing' &&
    currentPlayer?.user_id === user.id &&
    player !== undefined &&
    !player.bankrupt &&
    game.active_auction === null &&
    game.pending_auction_selector_id === null
  const canBuyBase = canUseTurnActions && game.active_debt === null
  const canSellBase =
    canUseTurnActions &&
    (game.active_debt === null || game.active_debt.debtor_id === user.id)
  const loanReserve = activeLoan
    ? activeLoan.installment_amount *
        pack.manifest.loan_investment_installment_reserve +
      Math.floor(
        (pack.manifest.pass_start_salary *
          pack.manifest.loan_investment_reserve_salary_percent) /
          100,
      )
    : 0
  const investmentExposure = game.bank.investments.reduce(
    (total, item) =>
      total + item.current_price * (item.holdings[user.id] ?? 0),
    0,
  ) +
    game.bank.market_orders.reduce((total, order) => {
      if (order.player_id !== user.id) return total
      if (order.side === 'buy') {
        return total + order.limit_price * order.remaining_quantity
      }
      const orderInstrument = game.bank.investments.find(
        (item) => item.id === order.instrument_id,
      )
      return (
        total +
        (orderInstrument?.current_price ?? 0) * order.remaining_quantity
      )
    }, 0)
  const leveragedExposureLimit = Math.max(
    0,
    Math.floor(
      (playerNetWorth(game, pack, user.id) *
        pack.manifest.loan_investment_max_net_worth_percent) /
        100,
    ),
  )
  const leveragedInvestmentAllowed =
    !activeLoan ||
    (creditScore >= 600 &&
      (player?.balance ?? 0) - buyQuote.settlement >= loanReserve &&
      investmentExposure +
          (orderType === 'limit'
            ? parsedLimitPrice * quotedQuantity
            : buyQuote.gross) <=
        leveragedExposureLimit)
  const reserveFloor = Math.ceil(
    (game.bank.monetary_base * game.bank.minimum_reserve_percent) / 100,
  )
  const buyReason = !canBuyBase
    ? currentPlayer?.user_id !== user.id
      ? t('marketPanel.reasons.turn')
      : t('marketPanel.reasons.pending')
    : !validQuantity
      ? t('marketPanel.reasons.quantity')
        : parsedQuantity > instrument.available_shares + sellDepth
          ? t('marketPanel.reasons.availability')
        : ownedTotal + pendingBuys + parsedQuantity > maximumHolding
          ? t('marketPanel.reasons.ownership', { count: maximumHolding })
          : orderType === 'market' &&
              (player?.balance ?? 0) < buyQuote.settlement
            ? t('marketPanel.reasons.balance')
            : !leveragedInvestmentAllowed
              ? t('marketPanel.reasons.credit')
              : null
  const sellReason = !canSellBase
    ? currentPlayer?.user_id !== user.id
      ? t('marketPanel.reasons.turn')
      : t('marketPanel.reasons.pending')
    : !validQuantity
      ? t('marketPanel.reasons.quantity')
      : parsedQuantity > owned
        ? t('marketPanel.reasons.holdings')
        : orderType === 'market' &&
            game.bank.cash -
              game.bank.dividend_cash_reserve -
              sellQuote.settlement <
            reserveFloor
          ? t('marketPanel.reasons.reserve')
          : null
  const limitBuyReason =
    buyReason ??
    (!validLimitPrice
      ? t('marketPanel.reasons.limitPrice')
      : (player?.balance ?? 0) < limitBuyReserve
        ? t('marketPanel.reasons.balance')
        : null)
  const limitSellReason =
    sellReason ??
    (!validLimitPrice ? t('marketPanel.reasons.limitPrice') : null)
  const history = buildInstrumentHistory(instrument, game.events)
  const relevantEvents = game.events
    .filter((event) => event.data.instrument_id === instrument.id)
    .slice(-8)
    .reverse()

  return (
    <Dialog open fullWidth maxWidth="md" onClose={busy ? undefined : onClose}>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="div" variant="h6" fontWeight={900}>
          {instrumentName(instrument, pack, t)}
        </Typography>
        <Typography component="div" variant="caption" color="text.secondary">
          {t(`bankPanel.instrumentTypes.${instrument.instrument_kind}`)}
        </Typography>
        <IconButton
          aria-label={t('marketPanel.close')}
          disabled={busy}
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(260px, 0.8fr)' },
              gap: 2,
            }}
          >
            <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('marketPanel.currentPrice')}
                    </Typography>
                    <Typography variant="h4" fontWeight={950}>
                      {money(instrument.current_price)}
                    </Typography>
                  </Box>
                  <ChangeChip value={priceChangePercent(instrument)} />
                </Stack>
                <MarketLineChart
                  points={history}
                  label={t('marketPanel.instrumentChart', {
                    instrument: instrumentName(instrument, pack, t),
                  })}
                  valueFormatter={money}
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <AccountBalanceWalletRoundedIcon color="secondary" />
                  <Typography fontWeight={850}>{t('marketPanel.position')}</Typography>
                </Stack>
                <Divider />
                <DataRow
                  label={t('marketPanel.ownedLabel')}
                  value={String(ownedTotal)}
                />
                <DataRow
                  label={t('marketPanel.availableToSell')}
                  value={String(owned)}
                />
                <DataRow
                  label={t('marketPanel.positionValue')}
                  value={money(ownedTotal * instrument.current_price)}
                />
                <DataRow
                  label={t('marketPanel.availableLabel')}
                  value={`${instrument.available_shares}/${instrument.total_shares}`}
                />
                <DataRow
                  label={t('marketPanel.maximumHolding')}
                  value={String(maximumHolding)}
                />
                <DataRow
                  label={t('marketPanel.balance')}
                  value={money(player?.balance ?? 0)}
                />
                <DataRow
                  label={t('marketPanel.pendingDividends')}
                  value={preciseMoney(player?.pending_dividend_units ?? 0)}
                />
              </Stack>
            </Paper>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 1,
            }}
          >
            <MarketMetric
              label={t('marketPanel.bid')}
              value={money(marketOrderQuote(instrument, 1, false).averagePrice)}
            />
            <MarketMetric
              label={t('marketPanel.ask')}
              value={money(marketOrderQuote(instrument, 1, true).averagePrice)}
            />
            <MarketMetric
              label={t('marketPanel.sessionRange')}
              value={`${money(instrument.session_low)} – ${money(instrument.session_high)}`}
            />
            <MarketMetric
              label={t('marketPanel.totalVolume')}
              value={String(instrument.trade_volume)}
            />
            <MarketMetric
              label={t('marketPanel.revenue')}
              value={money(instrument.gross_revenue)}
            />
            <MarketMetric
              label={t('marketPanel.dividends')}
              value={money(instrument.dividends_paid)}
            />
            <MarketMetric
              label={t('marketPanel.dividendsAccrued')}
              value={preciseMoney(instrument.dividends_accrued_units)}
            />
            <MarketMetric
              label={t('marketPanel.spread')}
              value={`${buyQuote.spreadPercent}%`}
            />
            <MarketMetric
              label={t('marketPanel.impact')}
              value={`${buyQuote.priceImpactPercent.toFixed(2)}%`}
            />
          </Box>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.25}>
              <Typography fontWeight={850}>{t('marketPanel.order')}</Typography>
              <TextField
                select
                size="small"
                label={t('marketPanel.orderType')}
                value={orderType}
                onChange={(event) =>
                  setOrderType(event.target.value as 'market' | 'limit')
                }
              >
                <MenuItem value="market">{t('marketPanel.marketOrder')}</MenuItem>
                <MenuItem value="limit">{t('marketPanel.limitOrder')}</MenuItem>
              </TextField>
              <TextField
                size="small"
                type="number"
                label={t('marketPanel.quantity')}
                value={quantity}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                onChange={(event) => onQuantityChange(event.target.value)}
              />
              {orderType === 'limit' && (
                <TextField
                  size="small"
                  type="number"
                  label={t('marketPanel.limitPrice')}
                  value={limitPrice}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  onChange={(event) => setLimitPrice(event.target.value)}
                />
              )}
              {orderType === 'market' && <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1,
                }}
              >
                <OrderEstimate
                  title={t('marketPanel.buyEstimate')}
                  average={money(buyQuote.averagePrice)}
                  fee={money(buyQuote.fee)}
                  settlement={money(buyQuote.settlement)}
                  newPrice={money(buyQuote.newPrice)}
                  settlementLabel={t('marketPanel.total')}
                />
                <OrderEstimate
                  title={t('marketPanel.sellEstimate')}
                  average={money(sellQuote.averagePrice)}
                  fee={money(sellQuote.fee)}
                  settlement={money(sellQuote.settlement)}
                  newPrice={money(sellQuote.newPrice)}
                  settlementLabel={t('marketPanel.proceeds')}
                />
              </Box>}
              {activeLoan && (
                <Alert severity={leveragedInvestmentAllowed ? 'success' : 'warning'}>
                  {leveragedInvestmentAllowed
                    ? t('bankPanel.loanInvestmentAllowed', {
                        reserve: money(loanReserve),
                        limit: money(leveragedExposureLimit),
                      })
                    : t('bankPanel.loanInvestmentBlocked', {
                        reserve: money(loanReserve),
                        limit: money(leveragedExposureLimit),
                      })}
                </Alert>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  disabled={
                    busy ||
                    (orderType === 'market'
                      ? buyReason !== null
                      : limitBuyReason !== null)
                  }
                  onClick={() =>
                    void onCommand(
                      orderType === 'market'
                        ? {
                            action: 'buy_shares',
                            instrument_id: instrument.id,
                            quantity: parsedQuantity,
                          }
                        : {
                            action: 'place_limit_order',
                            instrument_id: instrument.id,
                            side: 'buy',
                            quantity: parsedQuantity,
                            limit_price: parsedLimitPrice,
                          },
                    ).then((success) => {
                      if (success) onQuantityChange('1')
                    })
                  }
                >
                  {t('marketPanel.buy', { count: quotedQuantity })}
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  color="warning"
                  disabled={
                    busy ||
                    (orderType === 'market'
                      ? sellReason !== null
                      : limitSellReason !== null)
                  }
                  onClick={() =>
                    void onCommand(
                      orderType === 'market'
                        ? {
                            action: 'sell_shares',
                            instrument_id: instrument.id,
                            quantity: parsedQuantity,
                          }
                        : {
                            action: 'place_limit_order',
                            instrument_id: instrument.id,
                            side: 'sell',
                            quantity: parsedQuantity,
                            limit_price: parsedLimitPrice,
                          },
                    ).then((success) => {
                      if (success) onQuantityChange('1')
                    })
                  }
                >
                  {t('marketPanel.sell', { count: quotedQuantity })}
                </Button>
              </Stack>
              {(orderType === 'market'
                ? buyReason || sellReason
                : limitBuyReason || limitSellReason) && (
                <Typography variant="caption" color="text.secondary">
                  {t('marketPanel.operationLimits', {
                    buy:
                      (orderType === 'market' ? buyReason : limitBuyReason) ??
                      t('marketPanel.available'),
                    sell:
                      (orderType === 'market' ? sellReason : limitSellReason) ??
                      t('marketPanel.available'),
                  })}
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography fontWeight={850} mb={1}>
              {t('marketPanel.orderBook')}
            </Typography>
            {instrumentOrders.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('marketPanel.emptyOrderBook')}
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {[...instrumentOrders]
                  .sort((left, right) =>
                    left.side === right.side
                      ? left.side === 'buy'
                        ? right.limit_price - left.limit_price
                        : left.limit_price - right.limit_price
                      : left.side === 'buy'
                        ? -1
                        : 1,
                  )
                  .map((order) => (
                    <Stack
                      key={order.id}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                    >
                      <Chip
                        size="small"
                        color={order.side === 'buy' ? 'success' : 'warning'}
                        label={t(`marketPanel.sides.${order.side}`)}
                      />
                      <Typography variant="body2" flex={1}>
                        {t('marketPanel.bookEntry', {
                          count: order.remaining_quantity,
                          price: money(order.limit_price),
                        })}
                      </Typography>
                      {order.player_id === user.id && (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            void onCommand({
                              action: 'cancel_market_order',
                              order_id: order.id,
                            })
                          }
                        >
                          {t('marketPanel.cancelOrder')}
                        </Button>
                      )}
                    </Stack>
                  ))}
              </Stack>
            )}
          </Paper>

          <Box>
            <Typography fontWeight={850} mb={1}>
              {t('marketPanel.recentActivity')}
            </Typography>
            {relevantEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('marketPanel.noActivity')}
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {relevantEvents.map((event) => (
                  <Paper key={event.sequence} variant="outlined" sx={{ p: 1 }}>
                    <Typography variant="body2">
                      {marketEventLabel(event, game, t, money, preciseMoney)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{event.sequence}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          {t('marketPanel.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function MarketLineChart({
  points,
  label,
  valueFormatter,
}: {
  points: MarketPoint[]
  label: string
  valueFormatter: (value: number) => string
}) {
  const theme = useTheme()
  if (points.length === 0) return null
  const width = 640
  const height = 190
  const padding = 22
  const values = points.map((point) => point.value)
  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  const margin = Math.max(1, (rawMaximum - rawMinimum) * 0.12)
  const minimum = rawMinimum - margin
  const maximum = rawMaximum + margin
  const range = Math.max(1, maximum - minimum)
  const coordinates = points.map((point, index) => ({
    x:
      points.length === 1
        ? width / 2
        : padding + (index * (width - padding * 2)) / (points.length - 1),
    y: padding + ((maximum - point.value) * (height - padding * 2)) / range,
  }))
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`
  const color = theme.palette.secondary.main

  return (
    <Box sx={{ minWidth: 0 }}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
      >
        <title>{label}</title>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding}
            x2={width - padding}
            y1={padding + fraction * (height - padding * 2)}
            y2={padding + fraction * (height - padding * 2)}
            stroke={theme.palette.divider}
            strokeDasharray="4 6"
          />
        ))}
        <polygon points={area} fill={color} opacity="0.1" />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={coordinates[coordinates.length - 1].x}
          cy={coordinates[coordinates.length - 1].y}
          r="5"
          fill={color}
        />
      </svg>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {valueFormatter(rawMinimum)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {valueFormatter(rawMaximum)}
        </Typography>
      </Stack>
    </Box>
  )
}

function MarketSparkline({
  points,
  rising,
}: {
  points: MarketPoint[]
  rising: boolean
}) {
  const theme = useTheme()
  const width = 220
  const height = 48
  const values = points.map((point) => point.value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = Math.max(1, maximum - minimum)
  const coordinates = points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index * width) / (points.length - 1)
      const y = 4 + ((maximum - point.value) * (height - 8)) / range
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden>
      <polyline
        points={coordinates}
        fill="none"
        stroke={rising ? theme.palette.success.main : theme.palette.error.main}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChangeChip({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const rising = value >= 0
  return (
    <Chip
      size="small"
      color={rising ? 'success' : 'error'}
      variant="outlined"
      icon={rising ? <TrendingUpRoundedIcon /> : <TrendingDownRoundedIcon />}
      label={`${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`}
    />
  )
}

function MarketMetric({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={850}>{value}</Typography>
    </Paper>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800}>
        {value}
      </Typography>
    </Stack>
  )
}

function OrderEstimate({
  title,
  average,
  fee,
  settlement,
  newPrice,
  settlementLabel,
}: {
  title: string
  average: string
  fee: string
  settlement: string
  newPrice: string
  settlementLabel: string
}) {
  const { t } = useTranslation()
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack spacing={0.5}>
        <Typography fontWeight={850}>{title}</Typography>
        <DataRow label={t('marketPanel.averagePrice')} value={average} />
        <DataRow label={t('marketPanel.fee')} value={fee} />
        <DataRow label={settlementLabel} value={settlement} />
        <DataRow label={t('marketPanel.estimatedPrice')} value={newPrice} />
      </Stack>
    </Paper>
  )
}

function instrumentName(
  instrument: InvestmentInstrumentState,
  pack: ContentPack,
  t: TFunction,
): string {
  return instrument.instrument_kind === 'asset'
    ? pack.messages[instrument.name_key] ?? instrument.name_key
    : t(instrument.name_key)
}

function priceChangePercent(instrument: InvestmentInstrumentState): number {
  return instrument.base_price
    ? ((instrument.current_price - instrument.base_price) * 100) /
        instrument.base_price
    : 0
}

function playerNetWorth(
  game: GameState,
  pack: ContentPack,
  playerId: string,
): number {
  const player = game.players.find((item) => item.user_id === playerId)
  const propertyValue = pack.board.tiles.reduce(
    (total, tile) =>
      total + (game.owners[tile.id] === playerId ? (tile.price ?? 0) : 0),
    0,
  )
  const buildingValue = pack.board.tiles.reduce(
    (total, tile) =>
      total +
      (game.owners[tile.id] === playerId
        ? (game.building_levels[tile.id] ?? 0) * (tile.build_cost ?? 0)
        : 0),
    0,
  )
  const investments = game.bank.investments.reduce(
    (total, item) =>
      total + item.current_price * (item.holdings[playerId] ?? 0),
    0,
  )
  const reservedAssets = game.bank.market_orders.reduce((total, order) => {
    if (order.player_id !== playerId) return total
    if (order.side === 'buy') return total + order.reserved_cash
    const instrument = game.bank.investments.find(
      (item) => item.id === order.instrument_id,
    )
    return total + (instrument?.current_price ?? 0) * order.remaining_quantity
  }, 0)
  const debt = game.bank.loans
    .filter((loan) => loan.player_id === playerId)
    .reduce((total, loan) => total + loan.remaining_balance, 0)
  return Math.max(
    0,
    (player?.balance ?? 0) +
      propertyValue +
      buildingValue +
      investments +
      reservedAssets -
      debt,
  )
}

function marketEventLabel(
  event: GameEvent,
  game: GameState,
  t: TFunction,
  money: (amount: number) => string,
  preciseMoney: (units: number) => string,
): string {
  const playerId = typeof event.data.player_id === 'string' ? event.data.player_id : ''
  const player =
    game.players.find((item) => item.user_id === playerId)?.display_name ??
    t('bank')
  if (event.type === 'investment.shares_bought') {
    return t('marketPanel.activity.bought', {
      player,
      count: numberData(event, 'quantity'),
      price: money(numberData(event, 'unit_price')),
    })
  }
  if (event.type === 'investment.shares_sold') {
    return t('marketPanel.activity.sold', {
      player,
      count: numberData(event, 'quantity'),
      price: money(numberData(event, 'unit_price')),
    })
  }
  if (event.type === 'investment.limit_order_placed') {
    const side =
      event.data.side === 'sell'
        ? t('marketPanel.sides.sell')
        : t('marketPanel.sides.buy')
    return t('marketPanel.activity.limitPlaced', {
      player,
      side,
      count: numberData(event, 'quantity'),
      price: money(numberData(event, 'limit_price')),
    })
  }
  if (event.type === 'investment.limit_order_cancelled') {
    return t('marketPanel.activity.limitCancelled', { player })
  }
  if (event.type === 'investment.order_filled') {
    return t('marketPanel.activity.filled', {
      count: numberData(event, 'quantity'),
      price: money(numberData(event, 'unit_price')),
    })
  }
  if (event.type === 'investment.dividend_paid') {
    const accruedUnits = numberData(event, 'dividend_accrued_units')
    return accruedUnits > 0
      ? t('marketPanel.activity.dividendAccrued', {
          amount: preciseMoney(accruedUnits),
          paid: money(numberData(event, 'dividends')),
        })
      : t('marketPanel.activity.dividend', {
          amount: money(numberData(event, 'dividends')),
        })
  }
  if (event.type === 'investment.institution_revenue') {
    const accruedUnits = numberData(event, 'dividend_accrued_units')
    return accruedUnits > 0
      ? t('marketPanel.activity.revenueAccrued', {
          amount: money(numberData(event, 'amount')),
          accrued: preciseMoney(accruedUnits),
          paid: money(numberData(event, 'dividends')),
        })
      : t('marketPanel.activity.revenue', {
          amount: money(numberData(event, 'amount')),
        })
  }
  return event.type
}

function numberData(event: GameEvent, key: string): number {
  const value = event.data[key]
  return typeof value === 'number' ? value : 0
}
