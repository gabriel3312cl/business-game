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
  const portfolioAccent = !snapshot.hasPortfolioActivity
    ? '#b8b3c9'
    : snapshot.portfolioReturnPercent > 0
      ? '#69db8f'
      : snapshot.portfolioReturnPercent < 0
        ? '#ff7288'
        : '#e8e4f2'

  return (
    <Stack
      component="section"
      spacing={0.45}
      aria-label={t('playerStatus.title')}
      sx={{
        width: 'min(100%, 620px)',
        px: { xs: 0.5, sm: 1.5 },
        pb: { xs: 0.5, sm: 0.75, lg: 1 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          sx={{
            height: 1,
            flex: 1,
            background:
              'linear-gradient(90deg, transparent, rgba(169,140,255,.48))',
          }}
        />
        <Typography
          variant="overline"
          fontWeight={900}
          sx={{
            color: '#d8cff8',
            lineHeight: 1.2,
            letterSpacing: '0.14em',
            textShadow: '0 0 18px rgba(169,140,255,.25)',
          }}
        >
          {t('playerStatus.title')}
        </Typography>
        <Box
          sx={{
            height: 1,
            flex: 1,
            background:
              'linear-gradient(90deg, rgba(169,140,255,.48), transparent)',
          }}
        />
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
          },
          gap: { xs: 0.75, sm: 1, md: 0.65 },
        }}
      >
        <StatusMetric
          icon={<AccountBalanceWalletRoundedIcon />}
          label={t('playerStatus.cash')}
          value={money(snapshot.cash)}
          accent="#48c8ff"
        />
        <StatusMetric
          icon={<AssuredWorkloadRoundedIcon />}
          label={t('playerStatus.netWorth')}
          value={money(snapshot.netWorth)}
          accent="#a98cff"
        />
        <StatusMetric
          icon={<ReceiptLongRoundedIcon />}
          label={t('playerStatus.debt')}
          value={money(snapshot.totalDebt)}
          accent={snapshot.totalDebt > 0 ? '#ffb454' : '#69db8f'}
        />
        <StatusMetric
          icon={<ShowChartRoundedIcon />}
          label={t('playerStatus.portfolioReturn')}
          value={portfolioReturn}
          accent={portfolioAccent}
        />
      </Box>
    </Stack>
  )
}

function StatusMetric({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: { xs: 58, sm: 64, md: 58 },
        px: { xs: 0.85, sm: 1.15 },
        py: { xs: 0.75, sm: 1 },
        borderRadius: 2.25,
        borderColor: `${accent}55`,
        background: `linear-gradient(135deg, ${accent}1f 0%, rgba(29,25,49,.97) 46%, rgba(22,19,39,.98) 100%)`,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,.055), 0 10px 28px rgba(0,0,0,.16)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '12px auto 12px 0',
          width: 3,
          borderRadius: '0 4px 4px 0',
          bgcolor: accent,
          boxShadow: `0 0 12px ${accent}99`,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          width: 70,
          height: 70,
          right: -28,
          top: -34,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}1c, transparent 68%)`,
          pointerEvents: 'none',
        },
      }}
    >
      <Stack
        direction="row"
        spacing={{ xs: 0.75, sm: 1.05 }}
        alignItems="center"
        sx={{ height: '100%', position: 'relative', zIndex: 1 }}
      >
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            width: { xs: 30, sm: 36 },
            height: { xs: 30, sm: 36 },
            borderRadius: 1.5,
            color: accent,
            bgcolor: `${accent}1f`,
            border: `1px solid ${accent}38`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 0 16px ${accent}16`,
            '& svg': { fontSize: { xs: 17, sm: 21 } },
          }}
        >
          {icon}
        </Box>
        <Box minWidth={0} textAlign="left">
          <Typography
            color="text.secondary"
            sx={{
              fontSize: { xs: '0.58rem', sm: '0.7rem' },
              lineHeight: 1.15,
              letterSpacing: '0.015em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Typography>
          <Typography
            fontWeight={900}
            sx={{
              color: accent,
              fontSize: { xs: '0.76rem', sm: '1rem' },
              lineHeight: 1.25,
              textShadow: `0 0 16px ${accent}22`,
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
