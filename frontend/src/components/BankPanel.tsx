import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import CreditScoreRoundedIcon from '@mui/icons-material/CreditScoreRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  User,
} from '../types'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
}

export function BankPanel({ game, pack, user, busy, onCommand }: Props) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState(0)
  const [loanAmount, setLoanAmount] = useState('')
  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language],
  )
  const preciseCurrency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 4 }),
    [i18n.language],
  )
  const money = (amount: number) => `$${currency.format(amount)}`
  const preciseMoney = (units: number) =>
    `$${preciseCurrency.format(units / 10_000)}`
  const currentPlayer = game.players[game.current_player_index]
  const player = game.players.find((item) => item.user_id === user.id)
  const activeLoan = game.bank.loans.find((loan) => loan.player_id === user.id)
  const creditProfile = game.bank.credit_profiles[user.id]
  const circulation = game.players.reduce((total, item) => total + item.balance, 0)
  const reserveFloor = Math.ceil(
    (game.bank.monetary_base * game.bank.minimum_reserve_percent) / 100,
  )
  const availableBankCash = Math.max(
    0,
    game.bank.cash - game.bank.dividend_cash_reserve,
  )
  const reserveRatio = game.bank.monetary_base
    ? Math.min(100, (availableBankCash / game.bank.monetary_base) * 100)
    : 0
  const fallbackMaximumInstallment = Math.floor(
    (pack.manifest.pass_start_salary *
      pack.manifest.loan_salary_payment_percent) /
      100,
  )
  const fallbackMaximumLoan = Math.floor(
    (fallbackMaximumInstallment * pack.manifest.loan_max_term_laps * 100) /
      (100 + pack.manifest.loan_interest_percent),
  )
  const maximumLoan = creditProfile?.current_limit ?? fallbackMaximumLoan
  const interestPercent =
    creditProfile?.current_interest_percent ?? pack.manifest.loan_interest_percent
  const maximumTerm =
    creditProfile?.maximum_term_laps ?? pack.manifest.loan_max_term_laps
  const creditScore = creditProfile?.score ?? 600
  const parsedLoanAmount = Number(loanAmount)
  const canUseTurnActions =
    game.status === 'playing' &&
    currentPlayer?.user_id === user.id &&
    player !== undefined &&
    !player.bankrupt &&
    game.active_auction === null &&
    game.pending_auction_selector_id === null
  const canAct = canUseTurnActions && game.active_debt === null
  const canResolveDebtWithBank =
    canUseTurnActions &&
    (game.active_debt === null || game.active_debt.debtor_id === user.id)
  const financialEvents = game.events
    .filter((event) => event.type.startsWith('bank.'))
    .slice(-30)
    .reverse()

  useEffect(() => {
    setLoanAmount('')
  }, [game.id])

  if (!game.bank.initialized) {
    return <Alert severity="info">{t('bankPanel.initializing')}</Alert>
  }

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <AccountBalanceRoundedIcon color="secondary" />
        <Box minWidth={0}>
          <Typography fontWeight={900}>{t('bankPanel.title')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('bankPanel.subtitle')}
          </Typography>
        </Box>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label={t('bankPanel.title')}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          minHeight: 48,
          bgcolor: 'background.paper',
          borderBottom: '1px solid rgba(255,255,255,.1)',
          '& .MuiTab-root': { minHeight: 48, minWidth: 'auto', px: 1.5 },
        }}
      >
        <Tab
          id="bank-tab-summary"
          label={t('bankPanel.tabs.summary')}
          aria-controls="bank-panel-summary"
        />
        <Tab
          id="bank-tab-loans"
          label={t('bankPanel.tabs.loans')}
          aria-controls="bank-panel-loans"
        />
        <Tab
          id="bank-tab-activity"
          label={t('bankPanel.tabs.activity')}
          aria-controls="bank-panel-activity"
        />
      </Tabs>

      {tab === 0 && (
        <Stack
          id="bank-panel-summary"
          role="tabpanel"
          aria-labelledby="bank-tab-summary"
          spacing={1.25}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
              gap: 1,
            }}
          >
            <MetricCard
              label={t('bankPanel.monetaryBase')}
              value={money(game.bank.monetary_base)}
            />
            <MetricCard
              label={t('bankPanel.bankCash')}
              value={money(game.bank.cash)}
            />
            <MetricCard
              label={t('bankPanel.circulation')}
              value={money(circulation)}
            />
            <MetricCard
              label={t('bankPanel.bankPot')}
              value={money(game.bank_pot)}
            />
            <MetricCard
              label={t('bankPanel.activeCredit')}
              value={money(
                game.bank.loans.reduce(
                  (total, loan) => total + loan.remaining_balance,
                  0,
                ),
              )}
            />
            <MetricCard
              label={t('bankPanel.emergencyIssuance')}
              value={money(game.bank.emergency_issuance)}
              warning={game.bank.emergency_issuance > 0}
            />
            <MetricCard
              label={t('bankPanel.dividendReserve')}
              value={preciseMoney(
                game.bank.dividend_cash_reserve * 10_000 +
                  game.bank.dividend_unfunded_units,
              )}
            />
          </Box>
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Stack spacing={0.75}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" fontWeight={800}>
                  {t('bankPanel.reserve')}
                </Typography>
                <Typography variant="body2">
                  {reserveRatio.toFixed(1)}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={reserveRatio}
                color={availableBankCash < reserveFloor ? 'warning' : 'success'}
              />
              <Typography variant="caption" color="text.secondary">
                {t('bankPanel.reserveHelp', {
                  amount: money(reserveFloor),
                  percent: game.bank.minimum_reserve_percent,
                })}
              </Typography>
            </Stack>
          </Paper>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={t('houseSupply', { count: game.houses_remaining })}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t('hotelSupply', { count: game.hotels_remaining })}
            />
            <Chip
              size="small"
              color={game.settings.rules.loans_enabled ? 'success' : 'default'}
              label={
                game.settings.rules.loans_enabled
                  ? t('bankPanel.loansEnabled')
                  : t('bankPanel.loansDisabled')
              }
            />
            <Chip
              size="small"
              color={
                game.settings.rules.stock_market_enabled ? 'success' : 'default'
              }
              label={
                game.settings.rules.stock_market_enabled
                  ? t('bankPanel.marketEnabled')
                  : t('bankPanel.marketDisabled')
              }
            />
          </Stack>
          {game.settings.rules.loans_enabled && !activeLoan && (
            <Button
              variant="outlined"
              startIcon={<CreditScoreRoundedIcon />}
              onClick={() => setTab(1)}
              sx={{ minHeight: 48, alignSelf: { sm: 'flex-start' } }}
            >
              {t('bankPanel.requestLoanAction')}
            </Button>
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Stack
          id="bank-panel-loans"
          role="tabpanel"
          aria-labelledby="bank-tab-loans"
          spacing={1.25}
        >
          {game.settings.rules.loans_enabled && player && (
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography variant="body2" fontWeight={850}>
                    {t('bankPanel.creditProfile')}
                  </Typography>
                  <Chip
                    size="small"
                    color={creditScore >= 660 ? 'success' : creditScore < 580 ? 'warning' : 'default'}
                    label={t('bankPanel.creditScore', { score: creditScore })}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t('bankPanel.creditHistory', {
                    completed: creditProfile?.successful_loans ?? 0,
                    onTime: creditProfile?.on_time_payments ?? 0,
                    late: creditProfile?.late_payments ?? 0,
                    defaults: creditProfile?.defaults ?? 0,
                  })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('bankPanel.creditRewardHelp')}
                </Typography>
              </Stack>
            </Paper>
          )}
          {!game.settings.rules.loans_enabled ? (
            <Alert severity="info">{t('bankPanel.loanFeatureDisabled')}</Alert>
          ) : activeLoan ? (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <CreditScoreRoundedIcon color="secondary" />
                    <Typography fontWeight={850}>
                      {t('bankPanel.activeLoan')}
                    </Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={t('bankPanel.installmentsLeft', {
                      count: activeLoan.installments_remaining,
                    })}
                  />
                </Stack>
                <Divider />
                <Typography variant="body2">
                  {t('bankPanel.loanBalance', {
                    amount: money(activeLoan.remaining_balance),
                  })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('bankPanel.nextInstallment', {
                    amount: money(
                      Math.min(
                        activeLoan.installment_amount,
                        activeLoan.remaining_balance,
                      ),
                    ),
                  })}
                </Typography>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={0.75}
                  useFlexGap
                >
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!canAct || busy || !player || player.balance <= 0}
                    onClick={() =>
                      void onCommand({
                        action: 'repay_loan',
                        amount: Math.min(
                          activeLoan.installment_amount,
                          activeLoan.remaining_balance,
                        ),
                      })
                    }
                    sx={{ minHeight: 48 }}
                  >
                    {t('bankPanel.payInstallment')}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={
                      !canAct ||
                      busy ||
                      !player ||
                      player.balance < activeLoan.remaining_balance
                    }
                    onClick={() =>
                      void onCommand({ action: 'repay_loan', amount: null })
                    }
                    sx={{ minHeight: 48 }}
                  >
                    {t('bankPanel.payFullLoan')}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Typography fontWeight={850}>
                  {t('bankPanel.requestLoan')}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  fullWidth
                  label={t('bankPanel.loanAmount')}
                  value={loanAmount}
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: maximumLoan,
                      step: 1,
                      inputMode: 'numeric',
                    },
                  }}
                  onChange={(event) => setLoanAmount(event.target.value)}
                  helperText={t('bankPanel.loanLimit', {
                    amount: money(maximumLoan),
                    interest: interestPercent,
                    laps: maximumTerm,
                  })}
                />
                <Button
                  variant="contained"
                  disabled={
                    !canResolveDebtWithBank ||
                    busy ||
                    !Number.isInteger(parsedLoanAmount) ||
                    parsedLoanAmount <= 0 ||
                    parsedLoanAmount > maximumLoan
                  }
                  onClick={() =>
                    void onCommand({
                      action: 'request_loan',
                      amount: parsedLoanAmount,
                    }).then((success) => {
                      if (success) setLoanAmount('')
                    })
                  }
                  sx={{ minHeight: 48 }}
                >
                  {t('bankPanel.requestLoanAction')}
                </Button>
                {game.active_debt?.debtor_id === user.id && (
                  <Alert severity="info">{t('bankPanel.creditCanResolveDebt')}</Alert>
                )}
                {!canResolveDebtWithBank && (
                  <Typography variant="caption" color="text.secondary">
                    {currentPlayer?.user_id !== user.id
                      ? t('bankPanel.actionsOnTurn')
                      : t('bankPanel.actionsBlocked')}
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}
        </Stack>
      )}

      {tab === 2 && (
        <Stack
          id="bank-panel-activity"
          role="tabpanel"
          aria-labelledby="bank-tab-activity"
          spacing={0.75}
        >
          {financialEvents.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('bankPanel.noActivity')}
            </Typography>
          ) : (
            financialEvents.map((event) => (
              <Paper key={event.sequence} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <ReceiptLongRoundedIcon fontSize="small" color="action" />
                  <Box minWidth={0}>
                    <Typography variant="body2">
                      {financialEventLabel(event, game, t, money)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{event.sequence}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      )}
    </Stack>
  )
}

function MetricCard({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        fontWeight={900}
        color={warning ? 'warning.light' : 'text.primary'}
        sx={{ overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
    </Paper>
  )
}

function financialEventLabel(
  event: GameEvent,
  game: GameState,
  t: TFunction,
  money: (amount: number) => string,
): string {
  const amount = numberData(event, 'amount')
  const playerId = stringData(event, 'player_id')
  const player =
    game.players.find((item) => item.user_id === playerId)?.display_name ??
    t('bank')
  if (event.type === 'bank.loan_issued') {
    return t('bankPanel.activity.loanIssued', { player, amount: money(amount) })
  }
  if (event.type === 'bank.loan_payment') {
    return t('bankPanel.activity.loanPaid', { player, amount: money(amount) })
  }
  if (event.type === 'bank.loan_payment_missed') {
    return t('bankPanel.activity.loanPaymentMissed', { player })
  }
  if (event.type === 'bank.loan_defaulted') {
    return t('bankPanel.activity.loanDefaulted', { player })
  }
  if (event.type === 'bank.emergency_issued') {
    return t('bankPanel.activity.emergencyIssued', { amount: money(amount) })
  }
  return event.type
}

function numberData(event: GameEvent, key: string): number {
  const value = event.data[key]
  return typeof value === 'number' ? value : 0
}

function stringData(event: GameEvent, key: string): string | null {
  const value = event.data[key]
  return typeof value === 'string' ? value : null
}
