import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import AssuredWorkloadRoundedIcon from '@mui/icons-material/AssuredWorkloadRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded'
import { Box, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameState } from '../types'
import { buildPlayerStatusSnapshot } from './playerStatusSnapshot'

interface Props {
  game: GameState
  pack: ContentPack
  playerId: string
}

export function PlayerStatusSummary({ game, pack, playerId }: Props) {
  const { t, i18n } = useTranslation()
  const snapshot = useMemo(
    () => buildPlayerStatusSnapshot(game, pack, playerId),
    [game, pack, playerId],
  )
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language],
  )
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  )

  if (!snapshot) return null

  const money = (value: number) => `$${number.format(value)}`
  const portfolioReturn = snapshot.hasPortfolioActivity
    ? `${snapshot.portfolioReturnPercent > 0 ? '+' : ''}${percent.format(
        snapshot.portfolioReturnPercent,
      )}%`
    : t('playerStatus.noInvestments')
  const portfolioColor = !snapshot.hasPortfolioActivity
    ? 'text.secondary'
    : snapshot.portfolioReturnPercent > 0
      ? 'success.light'
      : snapshot.portfolioReturnPercent < 0
        ? 'error.light'
        : 'text.primary'

  return (
    <Stack
      component="section"
      spacing={0.45}
      aria-label={t('playerStatus.title')}
      sx={{ width: 'min(100%, 720px)', px: { xs: 0.5, sm: 1.5 } }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={850}
        sx={{ lineHeight: 1.2, letterSpacing: '0.08em' }}
      >
        {t('playerStatus.title')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(4, minmax(0, 1fr))',
          },
          gap: { xs: 0.45, sm: 0.75 },
        }}
      >
        <StatusMetric
          icon={<AccountBalanceWalletRoundedIcon />}
          label={t('playerStatus.cash')}
          value={money(snapshot.cash)}
          color="info.light"
        />
        <StatusMetric
          icon={<AssuredWorkloadRoundedIcon />}
          label={t('playerStatus.netWorth')}
          value={money(snapshot.netWorth)}
          color="secondary.light"
        />
        <StatusMetric
          icon={<ReceiptLongRoundedIcon />}
          label={t('playerStatus.debt')}
          value={money(snapshot.totalDebt)}
          color={snapshot.totalDebt > 0 ? 'warning.light' : 'success.light'}
        />
        <StatusMetric
          icon={<ShowChartRoundedIcon />}
          label={t('playerStatus.portfolioReturn')}
          value={portfolioReturn}
          color={portfolioColor}
        />
      </Box>
    </Stack>
  )
}

function StatusMetric({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 0,
        px: { xs: 0.7, sm: 1 },
        py: { xs: 0.55, sm: 0.75 },
        borderColor: 'rgba(255,255,255,.1)',
        bgcolor: 'rgba(28,24,48,.82)',
      }}
    >
      <Stack direction="row" spacing={0.6} alignItems="center">
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            color,
            '& svg': { fontSize: { xs: 15, sm: 18 } },
          }}
        >
          {icon}
        </Box>
        <Box minWidth={0} textAlign="left">
          <Typography
            color="text.secondary"
            sx={{
              fontSize: { xs: '0.54rem', sm: '0.63rem' },
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Typography>
          <Typography
            fontWeight={900}
            color={color}
            sx={{
              fontSize: { xs: '0.7rem', sm: '0.86rem' },
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  )
}
