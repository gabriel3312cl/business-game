import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  ListSubheader,
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
  ContentPack,
  RentDebtPlanTemplate,
  User,
} from '../types'
import { groupPropertyIds } from './propertyGrouping'

interface Props {
  game: GameState
  pack: ContentPack
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
  pack,
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
  const [includeInstallments, setIncludeInstallments] = useState(
    proposal ? proposal.installments > 0 : true,
  )
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<string[]>(
    proposal?.requested_property_ids ?? [],
  )

  useEffect(() => {
    setTemplate(proposal?.template ?? 'standard')
    setInstallments(proposal?.installments ?? TEMPLATES.standard.installments)
    setInterestPercent(
      proposal?.interest_percent ?? TEMPLATES.standard.interestPercent,
    )
    setIncludeInstallments(proposal ? proposal.installments > 0 : true)
    setRequestedPropertyIds(proposal?.requested_property_ids ?? [])
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
    debt.collection_demanded
  const settlementAmount = activePlan?.remaining_amount ?? debt.amount
  const totalWithInterest = Math.ceil(
    (settlementAmount * (100 + interestPercent)) / 100,
  )
  const debtorPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === debt.debtor_id &&
        (game.building_levels[propertyId] ?? 0) === 0,
    )
    .map(([propertyId]) => propertyId)
  const debtorPropertyGroups = groupPropertyIds(pack, debtorPropertyIds)
  const propertyName = (propertyId: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === propertyId)
    return tile ? pack.messages[tile.name_key] : propertyId
  }
  const propertyContext = (propertyId: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === propertyId)
    const group = pack.board.groups?.find(
      (candidate) => candidate.id === tile?.group,
    )
    const ownedInGroup = tile?.group
      ? pack.board.tiles.filter(
          (candidate) =>
            candidate.group === tile.group && game.owners[candidate.id] === user.id,
        ).length
      : 0
    return {
      name: tile ? pack.messages[tile.name_key] : propertyId,
      groupName: group
        ? (pack.messages[group.name_key] ?? group.id)
        : t('rentDebt.noPropertyGroup'),
      color: group?.color ?? tile?.color ?? '#8f8a9d',
      ownedInGroup,
    }
  }

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
        <Stack spacing={0.25}>
          {proposal.installments > 0 && (
            <Typography variant="caption" fontWeight={700}>
              {t('rentDebt.proposalSummary', {
                total: Math.ceil(
                  (settlementAmount * (100 + proposal.interest_percent)) / 100,
                ),
                installments: proposal.installments,
                interest: proposal.interest_percent,
              })}
            </Typography>
          )}
          {proposal.requested_property_ids.length > 0 && (
            <Typography variant="caption" fontWeight={700}>
              {t('rentDebt.proposalProperties', {
                properties: proposal.requested_property_ids
                  .map(propertyName)
                  .join(', '),
              })}
            </Typography>
          )}
        </Stack>
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
          {debt.collection_demanded && !activePlan ? (
            <Typography variant="caption" fontWeight={700}>
              {t('rentDebt.collectionDemanded')}
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {!debt.collection_demanded && (
                <Button
                  color="inherit"
                  variant="contained"
                  disabled={busy}
                  onClick={() => void onCommand({ action: 'demand_rent_debt' })}
                >
                  {t('rentDebt.demandNow')}
                </Button>
              )}
              <Button
                color="inherit"
                variant="outlined"
                disabled={busy}
                onClick={() => void onCommand({ action: 'forgive_rent_debt' })}
              >
                {activePlan
                  ? t('rentDebt.forgivePlan')
                  : t('rentDebt.forgiveDebt')}
              </Button>
            </Stack>
          )}

          {((debt.reason === 'rent' && !debt.collection_demanded) ||
            activePlan) && (
            <>
              {activePlan && (
                <Typography variant="caption" fontWeight={700}>
                  {t('rentDebt.renegotiateBalance', {
                    amount: activePlan.remaining_amount,
                  })}
                </Typography>
              )}
              <FormControl size="small" sx={{ width: '100%' }}>
                <InputLabel>{t('rentDebt.requestProperties')}</InputLabel>
                <Select
                  multiple
                  value={requestedPropertyIds}
                  label={t('rentDebt.requestProperties')}
                  disabled={busy || debtorPropertyIds.length === 0}
                  onChange={(event) => {
                    const value = event.target.value
                    setRequestedPropertyIds(
                      typeof value === 'string' ? value.split(',') : value,
                    )
                  }}
                  renderValue={(selected) => (
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      {selected.map((propertyId) => {
                        const context = propertyContext(propertyId)
                        return (
                          <Chip
                            key={propertyId}
                            size="small"
                            label={`${context.name}${
                              context.ownedInGroup > 0
                                ? ` · +${context.ownedInGroup}`
                                : ''
                            }`}
                            sx={{
                              borderLeft: `5px solid ${context.color}`,
                              bgcolor: `${context.color}18`,
                            }}
                          />
                        )
                      })}
                    </Stack>
                  )}
                >
                  {debtorPropertyGroups.flatMap((group) => [
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
                          boxShadow: `0 0 8px ${group.accent}88`,
                        }}
                      />
                      <Box component="span" sx={{ flexGrow: 1, fontWeight: 850 }}>
                        {group.name ?? t(`tileKind.${group.kind}`)}
                      </Box>
                      <Chip size="small" label={group.propertyIds.length} />
                    </ListSubheader>,
                    ...group.propertyIds.map((propertyId) => {
                      const context = propertyContext(propertyId)
                      return (
                        <MenuItem key={propertyId} value={propertyId}>
                          <Box
                            aria-hidden="true"
                            sx={{
                              width: 8,
                              height: 36,
                              flexShrink: 0,
                              borderRadius: 1,
                              bgcolor: context.color,
                              boxShadow: `0 0 9px ${context.color}66`,
                            }}
                          />
                          <Checkbox
                            checked={requestedPropertyIds.includes(propertyId)}
                          />
                          <ListItemText
                            primary={context.name}
                            secondary={context.groupName}
                          />
                          {context.ownedInGroup > 0 && (
                            <Chip
                              size="small"
                              label={t('rentDebt.ownedInPropertyGroup', {
                                count: context.ownedInGroup,
                              })}
                              sx={{
                                ml: 1,
                                fontWeight: 800,
                                color: context.color,
                                borderColor: `${context.color}99`,
                                bgcolor: `${context.color}14`,
                              }}
                              variant="outlined"
                            />
                          )}
                        </MenuItem>
                      )
                    }),
                  ])}
                </Select>
              </FormControl>
              {debtorPropertyIds.length === 0 && (
                <Typography variant="caption">
                  {t('rentDebt.noTransferableProperties')}
                </Typography>
              )}
              <Typography variant="caption">
                {t('rentDebt.propertyTermsHelp')}
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeInstallments}
                    disabled={busy}
                    onChange={(_, checked) => setIncludeInstallments(checked)}
                  />
                }
                label={t('rentDebt.includeInstallments')}
              />

              {includeInstallments && (
                <>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>{t('rentDebt.template')}</InputLabel>
                      <Select
                        value={template}
                        label={t('rentDebt.template')}
                        disabled={busy}
                        onChange={(event) =>
                          selectTemplate(
                            event.target.value as RentDebtPlanTemplate,
                          )
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
                </>
              )}
              <Button
                color="inherit"
                variant="contained"
                disabled={
                  busy ||
                  (!includeInstallments && requestedPropertyIds.length === 0) ||
                  (includeInstallments &&
                    (installments < 2 ||
                      installments > 12 ||
                      interestPercent < 0 ||
                      interestPercent > 100))
                }
                onClick={() =>
                  void onCommand({
                    action: 'propose_rent_debt_plan',
                    installments: includeInstallments ? installments : 0,
                    interest_percent: includeInstallments ? interestPercent : 0,
                    template: includeInstallments ? template : 'custom',
                    requested_property_ids: requestedPropertyIds,
                  })
                }
                sx={{ alignSelf: 'flex-start' }}
              >
                {proposal
                  ? t('rentDebt.updateSettlement')
                  : t('rentDebt.proposeSettlement')}
              </Button>
            </>
          )}
        </Stack>
      )}
    </Stack>
  )
}
