import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  GameCommand,
  GameState,
  RentDebtPlanTemplate,
  User,
} from '../types'

interface Props {
  game: GameState
  user: User
  busy: boolean
  playerName: (playerId: string | null) => string
  onCommand: (command: GameCommand) => Promise<boolean>
}

const TEMPLATES: Record<
  Exclude<RentDebtPlanTemplate, 'custom'>,
  { installments: number; interestPercent: number }
> = {
  friendly: { installments: 2, interestPercent: 0 },
  standard: { installments: 3, interestPercent: 5 },
  flexible: { installments: 4, interestPercent: 10 },
}

export function RentDebtResolutionPanel({
  game,
  user,
  busy,
  playerName,
  onCommand,
}: Props) {
  const { t } = useTranslation()
  const debt = game.active_debt
  const proposal = debt?.plan_proposal
  const [template, setTemplate] = useState<RentDebtPlanTemplate>(
    proposal?.template ?? 'standard',
  )
  const [installments, setInstallments] = useState(
    proposal?.installments ?? TEMPLATES.standard.installments,
  )
  const [interestPercent, setInterestPercent] = useState(
    proposal?.interest_percent ?? TEMPLATES.standard.interestPercent,
  )

  useEffect(() => {
    setTemplate(proposal?.template ?? 'standard')
    setInstallments(proposal?.installments ?? TEMPLATES.standard.installments)
    setInterestPercent(
      proposal?.interest_percent ?? TEMPLATES.standard.interestPercent,
    )
  }, [debt?.debtor_id, debt?.tile_id, proposal])

  const activePlan = useMemo(
    () =>
      debt?.installment_plan_id
        ? game.rent_debt_plans.find(
            (candidate) => candidate.id === debt.installment_plan_id,
          )
        : undefined,
    [debt?.installment_plan_id, game.rent_debt_plans],
  )

  if (!debt) return null

  const isDebtor = debt.debtor_id === user.id
  const isCreditor = debt.creditor_id === user.id
  const isCustomRentDebt =
    game.settings.rules.custom_rent_debts_enabled &&
    debt.creditor_id !== null &&
    (debt.reason === 'rent' || debt.reason === 'rent_installment')
  const debtorCanResolve =
    !isCustomRentDebt ||
    debt.reason === 'rent_installment' ||
    debt.collection_demanded
  const totalWithInterest = Math.ceil(
    (debt.amount * (100 + interestPercent)) / 100,
  )

  const selectTemplate = (next: RentDebtPlanTemplate) => {
    setTemplate(next)
    if (next === 'custom') return
    setInstallments(TEMPLATES[next].installments)
    setInterestPercent(TEMPLATES[next].interestPercent)
  }

  return (
    <Stack spacing={1} sx={{ width: '100%', minWidth: 0 }}>
      <Typography variant="body2">
        {t('debtSummary', {
          debtor: playerName(debt.debtor_id),
          amount: debt.amount,
          creditor: playerName(debt.creditor_id),
        })}
      </Typography>

      {activePlan && (
        <Typography variant="caption">
          {t('rentDebt.activePlan', {
            remaining: activePlan.remaining_amount,
            installments: activePlan.installments_remaining,
          })}
        </Typography>
      )}

      {proposal && (
        <Typography variant="caption" fontWeight={700}>
          {t('rentDebt.proposalSummary', {
            total: Math.ceil(
              (debt.amount * (100 + proposal.interest_percent)) / 100,
            ),
            installments: proposal.installments,
            interest: proposal.interest_percent,
          })}
        </Typography>
      )}

      {isDebtor && proposal && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          <Button
            color="inherit"
            variant="contained"
            disabled={busy}
            onClick={() => void onCommand({ action: 'accept_rent_debt_plan' })}
          >
            {t('rentDebt.acceptPlan')}
          </Button>
          <Button
            color="inherit"
            disabled={busy}
            onClick={() => void onCommand({ action: 'reject_rent_debt_plan' })}
          >
            {t('rentDebt.rejectPlan')}
          </Button>
        </Stack>
      )}

      {isDebtor && !proposal && debtorCanResolve && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          <Button
            color="inherit"
            variant="outlined"
            disabled={busy}
            onClick={() => void onCommand({ action: 'pay_debt' })}
          >
            {t('payDebt')}
          </Button>
          <Button
            color="inherit"
            disabled={busy}
            onClick={() => void onCommand({ action: 'declare_bankruptcy' })}
          >
            {t('declareBankruptcy')}
          </Button>
        </Stack>
      )}

      {isDebtor && !proposal && !debtorCanResolve && (
        <Typography variant="caption" fontWeight={700}>
          {t('rentDebt.awaitingCreditor')}
        </Typography>
      )}

      {isCustomRentDebt && isCreditor && (
        <Stack spacing={1}>
          {activePlan ? (
            <Button
              color="inherit"
              variant="outlined"
              disabled={busy}
              onClick={() => void onCommand({ action: 'forgive_rent_debt' })}
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('rentDebt.forgivePlan')}
            </Button>
          ) : debt.collection_demanded ? (
            <Typography variant="caption" fontWeight={700}>
              {t('rentDebt.collectionDemanded')}
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              <Button
                color="inherit"
                variant="contained"
                disabled={busy}
                onClick={() => void onCommand({ action: 'demand_rent_debt' })}
              >
                {t('rentDebt.demandNow')}
              </Button>
              <Button
                color="inherit"
                variant="outlined"
                disabled={busy}
                onClick={() => void onCommand({ action: 'forgive_rent_debt' })}
              >
                {t('rentDebt.forgiveDebt')}
              </Button>
            </Stack>
          )}

          {debt.reason === 'rent' && !debt.collection_demanded && (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>{t('rentDebt.template')}</InputLabel>
                  <Select
                    value={template}
                    label={t('rentDebt.template')}
                    disabled={busy}
                    onChange={(event) =>
                      selectTemplate(event.target.value as RentDebtPlanTemplate)
                    }
                  >
                    {(
                      ['friendly', 'standard', 'flexible', 'custom'] as const
                    ).map((option) => (
                      <MenuItem key={option} value={option}>
                        {t(`rentDebt.templates.${option}`)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label={t('rentDebt.installments')}
                  value={installments}
                  disabled={busy}
                  slotProps={{ htmlInput: { min: 2, max: 12 } }}
                  onChange={(event) => {
                    setTemplate('custom')
                    setInstallments(Number(event.target.value))
                  }}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t('rentDebt.interest')}
                  value={interestPercent}
                  disabled={busy}
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  onChange={(event) => {
                    setTemplate('custom')
                    setInterestPercent(Number(event.target.value))
                  }}
                />
              </Stack>
              <Typography variant="caption">
                {t('rentDebt.preview', {
                  total: totalWithInterest,
                  installments,
                })}
              </Typography>
              <Button
                color="inherit"
                variant="contained"
                disabled={
                  busy ||
                  installments < 2 ||
                  installments > 12 ||
                  interestPercent < 0 ||
                  interestPercent > 100
                }
                onClick={() =>
                  void onCommand({
                    action: 'propose_rent_debt_plan',
                    installments,
                    interest_percent: interestPercent,
                    template,
                  })
                }
                sx={{ alignSelf: 'flex-start' }}
              >
                {proposal
                  ? t('rentDebt.updatePlan')
                  : t('rentDebt.proposePlan')}
              </Button>
            </>
          )}
        </Stack>
      )}
    </Stack>
  )
}
