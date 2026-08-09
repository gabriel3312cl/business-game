import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DebtState,
  GameCommand,
  GameState,
  PlayerState,
  RentDebtPlanState,
  User,
} from '../types'
import { nextRentInstallmentAmount, playerDebtAccounts } from './debtAccounts'

interface Props {
  game: GameState
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
}

export function DebtAccountsPanel({ game, user, busy, onCommand }: Props) {
  const { t, i18n } = useTranslation()
  const currency = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language],
  )
  const money = (amount: number) => `$${currency.format(amount)}`
  const accounts = playerDebtAccounts(game, user.id)
  const currentPlayer = game.players.find((player) => player.user_id === user.id)
  const activeDebt = relatedActiveDebt(game, user.id)
  const activePlanId = activeDebt?.installment_plan_id ?? null
  const standaloneActiveDebt =
    activeDebt &&
    !game.rent_debt_plans.some((plan) => plan.id === activeDebt.installment_plan_id)
      ? activeDebt
      : null
  const payableActiveDebt =
    standaloneActiveDebt?.debtor_id === user.id ? standaloneActiveDebt : null
  const receivableActiveDebt =
    standaloneActiveDebt?.creditor_id === user.id ? standaloneActiveDebt : null
  const canPay =
    game.status === 'playing' &&
    currentPlayer !== undefined &&
    !currentPlayer.bankrupt &&
    game.active_debt === null &&
    game.active_auction === null &&
    game.pending_auction_selector_id === null &&
    game.pending_card_draw === null &&
    game.pending_card_choice === null

  return (
    <Stack spacing={2}>
      <Box>
        <Typography fontWeight={900}>{t('debtAccounts.title')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('debtAccounts.subtitle')}
        </Typography>
      </Box>

      <DebtSection
        title={t('debtAccounts.payable')}
        empty={t('debtAccounts.payableEmpty')}
        plans={accounts.payable}
        activeDebt={payableActiveDebt}
        activePlanId={activePlanId}
        players={game.players}
        currentPlayer={currentPlayer}
        canPay={canPay}
        busy={busy}
        money={money}
        onCommand={onCommand}
      />

      <Divider />

      <DebtSection
        title={t('debtAccounts.receivable')}
        empty={t('debtAccounts.receivableEmpty')}
        plans={accounts.receivable}
        activeDebt={receivableActiveDebt}
        activePlanId={activePlanId}
        players={game.players}
        currentPlayer={currentPlayer}
        canPay={false}
        busy={busy}
        money={money}
        onCommand={onCommand}
      />
    </Stack>
  )
}

interface DebtSectionProps {
  title: string
  empty: string
  plans: RentDebtPlanState[]
  activeDebt: DebtState | null
  activePlanId: string | null
  players: PlayerState[]
  currentPlayer: PlayerState | undefined
  canPay: boolean
  busy: boolean
  money: (amount: number) => string
  onCommand: (command: GameCommand) => Promise<boolean>
}

function DebtSection({
  title,
  empty,
  plans,
  activeDebt,
  activePlanId,
  players,
  currentPlayer,
  canPay,
  busy,
  money,
  onCommand,
}: DebtSectionProps) {
  const { t } = useTranslation()
  const count = plans.length + (activeDebt ? 1 : 0)
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" fontWeight={900} sx={{ flex: 1 }}>
          {title}
        </Typography>
        <Chip size="small" label={count} />
      </Stack>
      {count === 0 && <Alert severity="info">{empty}</Alert>}
      {activeDebt && (
        <ActiveDebtCard
          debt={activeDebt}
          players={players}
          viewerId={currentPlayer?.user_id ?? ''}
          money={money}
        />
      )}
      {plans.map((plan) => {
        const counterpartId =
          plan.debtor_id === currentPlayer?.user_id
            ? plan.creditor_id
            : plan.debtor_id
        const counterpart = players.find(
          (player) => player.user_id === counterpartId,
        )
        const nextInstallment = nextRentInstallmentAmount(plan)
        const overdue = activePlanId === plan.id
        const canPayInstallment =
          canPay && (currentPlayer?.balance ?? 0) >= nextInstallment
        const canPayFull =
          canPay && (currentPlayer?.balance ?? 0) >= plan.remaining_amount
        const paidPercent = Math.max(
          0,
          Math.min(
            100,
            ((plan.total_amount - plan.remaining_amount) * 100) /
              plan.total_amount,
          ),
        )
        return (
          <Paper key={plan.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Counterpart player={counterpart} fallback={counterpartId} />
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="caption" color="text.secondary">
                  {t('debtAccounts.remaining')}
                </Typography>
                <Typography variant="h6" fontWeight={900} sx={{ flex: 1 }}>
                  {money(plan.remaining_amount)}
                </Typography>
                <Chip
                  size="small"
                  color={overdue ? 'warning' : 'success'}
                  label={
                    overdue
                      ? t('debtAccounts.overdue')
                      : t('debtAccounts.current')
                  }
                />
              </Stack>
              <LinearProgress variant="determinate" value={paidPercent} />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('debtAccounts.original', {
                    amount: money(plan.original_amount),
                  })}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('debtAccounts.interest', {
                    percent: plan.interest_percent,
                    amount: money(plan.total_amount - plan.original_amount),
                  })}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('debtAccounts.installments', {
                    remaining: plan.installments_remaining,
                    total: plan.installments_total,
                  })}
                />
              </Stack>
              <Typography variant="body2">
                {t('debtAccounts.nextInstallment', {
                  amount: money(nextInstallment),
                })}
              </Typography>
              {overdue && (
                <Alert severity="warning">{t('debtAccounts.resolveOverdue')}</Alert>
              )}
              {plan.debtor_id === currentPlayer?.user_id && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  {nextInstallment < plan.remaining_amount && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || overdue || !canPayInstallment}
                      onClick={() =>
                        void onCommand({
                          action: 'pay_rent_debt_plan',
                          plan_id: plan.id,
                          payment_kind: 'installment',
                        })
                      }
                    >
                      {t('debtAccounts.payInstallment', {
                        amount: money(nextInstallment),
                      })}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || overdue || !canPayFull}
                    onClick={() =>
                      void onCommand({
                        action: 'pay_rent_debt_plan',
                        plan_id: plan.id,
                        payment_kind: 'full',
                      })
                    }
                  >
                    {t('debtAccounts.settle', {
                      amount: money(plan.remaining_amount),
                    })}
                  </Button>
                </Stack>
              )}
              {plan.debtor_id === currentPlayer?.user_id &&
                !overdue &&
                (currentPlayer?.balance ?? 0) < plan.remaining_amount && (
                  <Typography variant="caption" color="text.secondary">
                    {t('debtAccounts.insufficientFunds')}
                  </Typography>
                )}
            </Stack>
          </Paper>
        )
      })}
    </Stack>
  )
}

function Counterpart({
  player,
  fallback,
}: {
  player: PlayerState | undefined
  fallback: string
}) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography variant="subtitle2" fontWeight={800} sx={{ flex: 1 }}>
        {player?.display_name ?? fallback}
      </Typography>
      {player?.is_bot && (
        <Chip
          size="small"
          icon={<SmartToyRoundedIcon />}
          label={t('debtAccounts.bot')}
        />
      )}
    </Stack>
  )
}

function ActiveDebtCard({
  debt,
  players,
  viewerId,
  money,
}: {
  debt: DebtState
  players: PlayerState[]
  viewerId: string
  money: (amount: number) => string
}) {
  const { t } = useTranslation()
  const counterpartId =
    debt.debtor_id === viewerId ? debt.creditor_id : debt.debtor_id
  const counterpart = players.find((player) => player.user_id === counterpartId)
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Counterpart
          player={counterpart}
          fallback={counterpartId ?? t('debtAccounts.bank')}
        />
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" fontWeight={900} sx={{ flex: 1 }}>
            {money(debt.amount)}
          </Typography>
          <Chip size="small" color="warning" label={t('debtAccounts.pending')} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t(`debtAccounts.reasons.${debt.reason}`)}
        </Typography>
        <Alert severity="info">{t('debtAccounts.resolveActive')}</Alert>
      </Stack>
    </Paper>
  )
}

function relatedActiveDebt(game: GameState, playerId: string): DebtState | null {
  const debt = game.active_debt
  return debt &&
    debt.creditor_id !== null &&
    (debt.debtor_id === playerId || debt.creditor_id === playerId)
    ? debt
    : null
}
