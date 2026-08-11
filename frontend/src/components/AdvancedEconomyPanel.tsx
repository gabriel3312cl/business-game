import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded'
import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import HowToVoteRoundedIcon from '@mui/icons-material/HowToVoteRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded'
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameCommand, GameState, User } from '../types'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
}

const ACCENT = {
  info: '#48c8ff',
  success: '#69db8f',
  warning: '#ffb454',
  danger: '#ff7288',
  secondary: '#a98cff',
} as const

export function AdvancedEconomyPanel({ game, pack, user, busy, onCommand }: Props) {
  const { t, i18n } = useTranslation()
  const economy = game.economy
  const assessment = economy.operating_cost_assessment
  const operatingAmount = assessment?.amounts[user.id] ?? 0
  const operatingResolved = assessment?.resolved_player_ids.includes(user.id) ?? false
  const operatingDue =
    assessment !== null &&
    assessment.due_week <= economy.elapsed_weeks &&
    operatingAmount > 0 &&
    !operatingResolved
  const isCurrentPlayer = game.players[game.current_player_index]?.user_id === user.id
  const currentPlayer = game.players.find((player) => player.user_id === user.id)
  const availableCash = currentPlayer?.balance ?? 0
  const operatingDebt = economy.operating_debts.find(
    (item) => item.player_id === user.id,
  )
  const openProject = useMemo(
    () =>
      [...economy.public_projects]
        .reverse()
        .find((item) => item.status === 'bidding'),
    [economy.public_projects],
  )
  const [projectBid, setProjectBid] = useState('')

  useEffect(() => {
    setProjectBid(openProject ? String(openProject.minimum_bid) : '')
  }, [openProject])

  const qualifiesForProject = useMemo(() => {
    if (!openProject) return false
    const qualifyingTiles = pack.board.tiles.filter(
      (tile) =>
        tile.kind === openProject.required_tile_kind &&
        game.owners[tile.id] === user.id &&
        !game.mortgaged_property_ids.includes(tile.id),
    )
    return (
      qualifyingTiles.length > 0 &&
      qualifyingTiles.reduce(
        (sum, tile) => sum + (game.building_levels[tile.id] ?? 0),
        0,
      ) >= openProject.required_building_levels
    )
  }, [game.building_levels, game.mortgaged_property_ids, game.owners, openProject, pack, user.id])

  if (!game.settings.advanced_economy_enabled || game.status !== 'playing') {
    return null
  }

  const parsedBid = Number(projectBid)
  const projectClosed = Boolean(
    openProject && economy.elapsed_weeks >= openProject.bidding_ends_week,
  )
  const validProjectBid = Boolean(
    openProject &&
      Number.isInteger(parsedBid) &&
      parsedBid >= openProject.minimum_bid,
  )
  const enoughProjectCash = parsedBid <= availableCash
  const projectBlockedReason = !openProject
    ? null
    : projectClosed
      ? t('economy.advanced.projectClosedReason', {
          week: openProject.bidding_ends_week,
        })
      : !qualifiesForProject
        ? t('economy.advanced.projectNotQualified')
        : !validProjectBid
          ? t('economy.advanced.projectInvalidBid', {
              amount: openProject.minimum_bid,
            })
          : !enoughProjectCash
            ? t('economy.advanced.projectInsufficientCash', {
                amount: availableCash,
              })
            : null
  const vote = economy.finale_vote
  const canVote = vote?.eligible_player_ids.includes(user.id) ?? false
  const finaleWeeks = economy.finale
    ? Math.max(0, economy.finale.ends_week - economy.elapsed_weeks)
    : null
  const indexValue = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(economy.price_index_basis_points / 10_000)
  const accumulatedInflation = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format((economy.price_index_basis_points - 10_000) / 10_000)

  return (
    <Paper
      variant="outlined"
      sx={{
        width: 'min(100%, 620px)',
        p: { xs: 0.85, sm: 1.1 },
        borderRadius: 3,
        borderColor: `${ACCENT.info}42`,
        background:
          'linear-gradient(145deg, rgba(72,200,255,.06) 0%, rgba(22,27,48,.98) 44%, rgba(12,17,31,.99) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,.055), 0 14px 34px rgba(0,0,0,.2)',
      }}
    >
      <Stack spacing={0.9}>
        <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={0.75}>
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
              borderRadius: 1.6,
              color: ACCENT.info,
              bgcolor: `${ACCENT.info}1a`,
              border: `1px solid ${ACCENT.info}36`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 0 18px ${ACCENT.info}18`,
            }}
          >
            <AccountBalanceRoundedIcon fontSize="small" />
          </Box>
          <Typography fontWeight={900} sx={{ flex: '1 1 180px' }}>
            {t('economy.advanced.title')}
          </Typography>
          <Tooltip
            arrow
            title={t('economy.advanced.priceIndexHelp', {
              value: indexValue,
              percent: accumulatedInflation,
            })}
          >
            <Chip
              size="small"
              icon={<PriceChangeRoundedIcon />}
              label={t('economy.advanced.priceIndex', {
                percent: accumulatedInflation,
              })}
              sx={{
                height: 30,
                color: ACCENT.warning,
                bgcolor: `${ACCENT.warning}16`,
                border: `1px solid ${ACCENT.warning}38`,
                fontWeight: 800,
                '& .MuiChip-icon': { color: ACCENT.warning },
              }}
            />
          </Tooltip>
          {finaleWeeks !== null && (
            <Chip
              size="small"
              label={t('economy.advanced.finaleRemaining', { count: finaleWeeks })}
              sx={{
                color: ACCENT.warning,
                bgcolor: `${ACCENT.warning}14`,
                border: `1px solid ${ACCENT.warning}38`,
                fontWeight: 800,
              }}
            />
          )}
        </Stack>

        {economy.forecast_events.length > 0 && (
          <Box sx={cardSx(ACCENT.secondary)}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>
              {t('economy.advanced.forecast')}
            </Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.5} mt={0.4}>
              {economy.forecast_events.map((event) => (
                <Chip
                  key={`${event.kind}-${event.starts_in_weeks}`}
                  size="small"
                  variant="outlined"
                  label={t('economy.advanced.forecastEvent', {
                    event: t(`economy.events.${event.kind}`),
                    count: event.starts_in_weeks,
                  })}
                  sx={{ borderColor: `${ACCENT.secondary}48`, color: 'text.primary' }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {operatingAmount > 0 && !operatingResolved && (
          <Box
            component="section"
            role={operatingDue ? 'alert' : undefined}
            sx={cardSx(operatingDue ? ACCENT.warning : ACCENT.info)}
          >
            <Stack direction="row" alignItems="flex-start" spacing={0.9}>
              <CardIcon accent={operatingDue ? ACCENT.warning : ACCENT.info}>
                <EngineeringRoundedIcon fontSize="small" />
              </CardIcon>
              <Stack spacing={0.7} sx={{ minWidth: 0, flex: 1 }}>
                <Box>
                  <Typography variant="body2" fontWeight={850}>
                    {operatingDue
                      ? t('economy.advanced.operatingDue', { amount: operatingAmount })
                      : t('economy.advanced.operatingAnnounced', {
                          amount: operatingAmount,
                          week: assessment?.due_week,
                        })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {operatingDue
                      ? t('economy.advanced.operatingDueDetail')
                      : t('economy.advanced.operatingAnnouncementDetail')}
                  </Typography>
                </Box>
                {operatingDue && isCurrentPlayer && (
                  <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.7}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={busy || availableCash < operatingAmount}
                      onClick={() => void onCommand({ action: 'pay_operating_costs' })}
                    >
                      {t('economy.advanced.payOperating')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => void onCommand({ action: 'defer_operating_costs' })}
                    >
                      {t('economy.advanced.deferOperating')}
                    </Button>
                  </Stack>
                )}
                {operatingDue && availableCash < operatingAmount && (
                  <Typography variant="caption" sx={{ color: ACCENT.warning }}>
                    {t('economy.advanced.operatingInsufficientCash', {
                      amount: availableCash,
                    })}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

        {operatingDebt && (
          <Box component="section" sx={cardSx(ACCENT.danger)}>
            <Stack direction="row" alignItems="center" spacing={0.9}>
              <CardIcon accent={ACCENT.danger}>
                <PaidRoundedIcon fontSize="small" />
              </CardIcon>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800}>
                  {t('economy.advanced.operatingDebt', {
                    amount: operatingDebt.remaining_amount,
                  })}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                disabled={busy || availableCash < operatingDebt.remaining_amount}
                onClick={() => void onCommand({ action: 'repay_operating_debt' })}
              >
                {t('economy.advanced.repayDebt')}
              </Button>
            </Stack>
          </Box>
        )}

        {openProject && (
          <Box
            component="section"
            sx={cardSx(projectClosed ? ACCENT.danger : ACCENT.success)}
          >
            <Stack direction="row" alignItems="flex-start" spacing={0.9}>
              <CardIcon accent={projectClosed ? ACCENT.danger : ACCENT.success}>
                <GavelRoundedIcon fontSize="small" />
              </CardIcon>
              <Stack spacing={0.65} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={0.6}>
                  <Typography variant="body2" fontWeight={900} sx={{ flex: '1 1 180px' }}>
                    {t(`economy.advanced.projects.${openProject.kind}`)}
                  </Typography>
                  <Chip
                    size="small"
                    label={
                      projectClosed
                        ? t('economy.advanced.projectClosed')
                        : t('economy.advanced.projectLastBidWeek', {
                            week: openProject.bidding_ends_week - 1,
                          })
                    }
                    sx={{
                      height: 24,
                      color: projectClosed ? ACCENT.danger : ACCENT.success,
                      bgcolor: projectClosed
                        ? `${ACCENT.danger}12`
                        : `${ACCENT.success}12`,
                      border: `1px solid ${projectClosed ? ACCENT.danger : ACCENT.success}3d`,
                      fontWeight: 800,
                    }}
                  />
                </Stack>
                <Typography variant="caption">
                  {t('economy.advanced.projectTerms', {
                    minimum: openProject.minimum_bid,
                    reward: openProject.reward_amount,
                  })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {openProject.required_building_levels > 0
                    ? t('economy.advanced.projectBuildingRequirement', {
                        kind: t(openProject.required_tile_kind),
                        count: openProject.required_building_levels,
                      })
                    : t('economy.advanced.projectRequirement', {
                        kind: t(openProject.required_tile_kind),
                      })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('economy.advanced.projectRewardHelp')}
                </Typography>
                <Stack direction="row" alignItems="flex-start" useFlexGap flexWrap="wrap" gap={0.7}>
                  <TextField
                    size="small"
                    type="number"
                    label={t('economy.advanced.projectBid')}
                    value={projectBid}
                    disabled={busy || projectClosed}
                    onChange={(event) => setProjectBid(event.target.value)}
                    slotProps={{ htmlInput: { min: openProject.minimum_bid } }}
                    sx={{ width: 155 }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || projectBlockedReason !== null}
                    onClick={() =>
                      void onCommand({
                        action: 'bid_public_project',
                        project_id: openProject.id,
                        amount: parsedBid,
                      })
                    }
                  >
                    {projectClosed
                      ? t('economy.advanced.projectClosed')
                      : t('economy.advanced.bidProject')}
                  </Button>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ alignSelf: 'center', ml: { sm: 'auto' } }}
                  >
                    {t('economy.advanced.projectAvailableCash', {
                      amount: availableCash,
                    })}
                  </Typography>
                </Stack>
                {projectBlockedReason && !busy && (
                  <Typography
                    role="status"
                    variant="caption"
                    sx={{ color: projectClosed ? ACCENT.danger : ACCENT.warning }}
                  >
                    {projectBlockedReason}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

        {vote && canVote && (
          <Box component="section" role="alert" sx={cardSx(ACCENT.warning)}>
            <Stack direction="row" alignItems="flex-start" spacing={0.9}>
              <CardIcon accent={ACCENT.warning}>
                <HowToVoteRoundedIcon fontSize="small" />
              </CardIcon>
              <Stack spacing={0.7} sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={850}>
                  {t('economy.advanced.voteQuestion', {
                    count: game.settings.finale_duration_weeks,
                  })}
                </Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.7}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => void onCommand({ action: 'vote_finale', approve: true })}
                  >
                    {t('economy.advanced.voteYes')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void onCommand({ action: 'vote_finale', approve: false })}
                  >
                    {t('economy.advanced.voteNo')}
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

function CardIcon({
  accent,
  children,
}: {
  accent: string
  children: ReactNode
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 34,
        height: 34,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        borderRadius: 1.5,
        color: accent,
        bgcolor: `${accent}18`,
        border: `1px solid ${accent}34`,
      }}
    >
      {children}
    </Box>
  )
}

function cardSx(accent: string) {
  return {
    p: { xs: 0.9, sm: 1.05 },
    borderRadius: 2.4,
    border: `1px solid ${accent}2f`,
    background: `linear-gradient(135deg, ${accent}0d 0%, rgba(8,14,24,.84) 58%, rgba(7,11,20,.92) 100%)`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
  }
}
