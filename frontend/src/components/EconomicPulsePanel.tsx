import AcUnitRoundedIcon from '@mui/icons-material/AcUnitRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeviceThermostatRoundedIcon from '@mui/icons-material/DeviceThermostatRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import LandscapeRoundedIcon from '@mui/icons-material/LandscapeRounded'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded'
import SentimentSatisfiedAltRoundedIcon from '@mui/icons-material/SentimentSatisfiedAltRounded'
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded'
import ThunderstormRoundedIcon from '@mui/icons-material/ThunderstormRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded'
import WbSunnyRoundedIcon from '@mui/icons-material/WbSunnyRounded'
import WorkRoundedIcon from '@mui/icons-material/WorkRounded'
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  EconomicCycle,
  EconomicEventState,
  GameState,
  WeatherCondition,
} from '../types'

interface Props {
  game: GameState
  pack: ContentPack
}

const ACCENT = {
  info: '#48c8ff',
  success: '#69db8f',
  warning: '#ffb454',
  danger: '#ff7288',
  secondary: '#a98cff',
  primary: '#b8ff3d',
  neutral: '#b8b3c9',
} as const

const CYCLE_ACCENT: Record<EconomicCycle, string> = {
  expansion: ACCENT.success,
  slowdown: ACCENT.warning,
  recession: ACCENT.danger,
  recovery: ACCENT.info,
}

const FAVORABLE_EVENTS = new Set<EconomicEventState['kind']>([
  'innovation_boom',
  'consumer_boom',
  'fiscal_stimulus',
])

export function EconomicPulsePanel({ game, pack }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const economy = game.economy
  const cycleAccent = CYCLE_ACCENT[economy.cycle]
  const formattedDate = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${economy.current_date}T12:00:00`))
  const percent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
  const signedPercent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
  const signedNumber = new Intl.NumberFormat(i18n.language, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  })
  const instrumentById = new Map(
    game.bank.investments.map((instrument) => [instrument.id, instrument]),
  )
  const companyInstrument = economy.last_company_instrument_id
    ? instrumentById.get(economy.last_company_instrument_id)
    : undefined
  const companyName = companyInstrument
    ? pack.messages[companyInstrument.name_key] ?? t(companyInstrument.name_key)
    : economy.last_company_instrument_id
  const basisPoints = (value: number) => percent.format(value / 10_000)
  const signedBasisPoints = (value: number) =>
    signedPercent.format(value / 10_000)
  const marketAccent =
    economy.market_sentiment > 0
      ? ACCENT.success
      : economy.market_sentiment < 0
        ? ACCENT.danger
        : ACCENT.neutral

  return (
    <>
      <Paper
        component="button"
        type="button"
        variant="outlined"
        aria-label={t('economy.openDetails')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="economic-pulse-dialog"
        onClick={() => setOpen(true)}
        sx={{
          width: 'min(100%, 620px)',
          minHeight: 56,
          px: { xs: 0.8, sm: 1.1 },
          py: 0.75,
          m: 0,
          cursor: 'pointer',
          color: 'text.primary',
          font: 'inherit',
          textAlign: 'initial',
          borderRadius: 2.5,
          borderColor: `${cycleAccent}52`,
          background: `linear-gradient(145deg, ${cycleAccent}12 0%, rgba(29,25,49,.98) 44%, rgba(16,13,29,.99) 100%)`,
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,.055), 0 10px 30px rgba(0,0,0,.18)',
          transition: 'background-color 140ms ease, border-color 140ms ease',
          '&:hover': { bgcolor: `${cycleAccent}0b` },
          '&:focus-visible': {
            outline: `3px solid ${ACCENT.primary}`,
            outlineOffset: -3,
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          gap={{ xs: 0.65, sm: 0.85 }}
        >
          <Box
            aria-hidden
            sx={{
              width: { xs: 32, sm: 36 },
              height: { xs: 32, sm: 36 },
              flex: '0 0 auto',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 1.5,
              color: cycleAccent,
              bgcolor: `${cycleAccent}1f`,
              border: `1px solid ${cycleAccent}38`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 0 16px ${cycleAccent}16`,
              '& svg': { fontSize: { xs: 18, sm: 21 } },
            }}
          >
            <CalendarMonthRoundedIcon />
          </Box>
          <Box sx={{ minWidth: 0, flex: '1 1 170px' }}>
            <Stack direction="row" alignItems="baseline" useFlexGap flexWrap="wrap" gap={0.6}>
              <Typography
                component="time"
                dateTime={economy.current_date}
                fontWeight={900}
                sx={{ fontSize: { xs: '0.78rem', sm: '0.92rem' }, lineHeight: 1.2 }}
              >
                {formattedDate}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('economy.week', { count: economy.elapsed_weeks + 1 })}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.15, lineHeight: 1.25 }}
            >
              {t('economy.summary', {
                season: t(`economy.season.${economy.season}`),
                difficulty: t(
                  `economy.difficulty.${game.settings.economic_difficulty}`,
                ),
              })}
            </Typography>
          </Box>
          <Stack
            direction="row"
            alignItems="center"
            useFlexGap
            flexWrap="wrap"
            gap={0.55}
            sx={{ ml: { sm: 'auto' } }}
          >
            <Chip
              size="small"
              icon={weatherIcon(economy.weather)}
              label={t(`economy.weather.${economy.weather}`)}
              sx={{
                height: 28,
                color: 'text.primary',
                bgcolor: `${ACCENT.info}16`,
                border: `1px solid ${ACCENT.info}2e`,
                '& .MuiChip-icon': { color: ACCENT.info },
              }}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t(`economy.cycle.${economy.cycle}`)}
              sx={{
                height: 28,
                color: cycleAccent,
                borderColor: `${cycleAccent}66`,
                bgcolor: `${cycleAccent}0d`,
                fontWeight: 750,
              }}
            />
            <Box
              aria-hidden
              sx={{
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                color: 'text.secondary',
              }}
            >
              <OpenInFullRoundedIcon fontSize="small" />
            </Box>
          </Stack>
        </Stack>
      </Paper>

      <Dialog
        id="economic-pulse-dialog"
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="economic-pulse-dialog-title"
        PaperProps={{
          sx: {
            maxHeight: { xs: '90dvh', sm: '86dvh' },
            border: `1px solid ${cycleAccent}52`,
            background: `linear-gradient(145deg, ${cycleAccent}12 0%, rgba(29,25,49,.99) 38%, rgba(16,13,29,1) 100%)`,
          },
        }}
      >
        <DialogTitle id="economic-pulse-dialog-title" sx={{ pr: 7 }}>
          <Typography component="span" variant="h6" fontWeight={900}>
            {t('economy.title')}
          </Typography>
          <IconButton
            aria-label={t('economy.closeDetails')}
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', right: 12, top: 10 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, sm: 1.5 } }}>
          <Stack spacing={1.1}>
            <Box component="section" aria-label={t('economy.indicators')}>
              <SectionHeading
                icon={<InsightsRoundedIcon />}
                title={t('economy.indicators')}
                accent={ACCENT.secondary}
              />
              <Box
                component="dl"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(3, minmax(0, 1fr))',
                  },
                  gap: { xs: 0.6, sm: 0.75 },
                  m: 0,
                  mt: 0.65,
                }}
              >
                <Metric
                  icon={
                    economy.annual_growth_basis_points < 0 ? (
                      <TrendingDownRoundedIcon />
                    ) : (
                      <TrendingUpRoundedIcon />
                    )
                  }
                  label={t('economy.growth')}
                  value={basisPoints(economy.annual_growth_basis_points)}
                  accent={
                    economy.annual_growth_basis_points >= 0
                      ? ACCENT.success
                      : ACCENT.danger
                  }
                />
                <Metric
                  icon={<PriceChangeRoundedIcon />}
                  label={t('economy.inflation')}
                  value={basisPoints(economy.annual_inflation_basis_points)}
                  accent={ACCENT.warning}
                />
                <Metric
                  icon={<AccountBalanceRoundedIcon />}
                  label={t('economy.policyRate')}
                  value={basisPoints(economy.policy_rate_basis_points)}
                  accent={ACCENT.secondary}
                />
                <Metric
                  icon={<WorkRoundedIcon />}
                  label={t('economy.unemployment')}
                  value={basisPoints(economy.unemployment_basis_points)}
                  accent={ACCENT.danger}
                />
                <Metric
                  icon={<SentimentSatisfiedAltRoundedIcon />}
                  label={t('economy.confidence')}
                  value={`${economy.consumer_confidence}/200`}
                  accent={ACCENT.primary}
                />
                <Metric
                  icon={<ShowChartRoundedIcon />}
                  label={t('economy.sentiment')}
                  value={signedNumber.format(economy.market_sentiment)}
                  accent={marketAccent}
                />
              </Box>
            </Box>

        {economy.active_events.length > 0 && (
          <Box component="section" aria-label={t('economy.activeEvents')}>
            <SectionHeading
              icon={<BoltRoundedIcon />}
              title={t('economy.activeEvents')}
              accent={ACCENT.warning}
            />
            <Stack
              component="ul"
              spacing={0.5}
              sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.6 }}
            >
              {economy.active_events.map((event) => {
                const accent = FAVORABLE_EVENTS.has(event.kind)
                  ? ACCENT.success
                  : ACCENT.warning
                return (
                  <InformationRow
                    key={event.kind}
                    icon={<BoltRoundedIcon />}
                    title={t(`economy.events.${event.kind}`)}
                    detail={t('economy.weeksRemaining', {
                      count: event.remaining_weeks,
                    })}
                    accent={accent}
                  />
                )
              })}
            </Stack>
          </Box>
        )}

        {economy.last_company_action && economy.last_company_instrument_id && (
          <Box component="section" aria-label={t('economy.companyNews')}>
            <SectionHeading
              icon={<BusinessRoundedIcon />}
              title={t('economy.companyNews')}
              accent={ACCENT.secondary}
            />
            <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.6 }}>
              <InformationRow
                icon={<BusinessRoundedIcon />}
                title={companyName ?? economy.last_company_instrument_id}
                detail={t(`economy.companyActions.${economy.last_company_action}`)}
                accent={companyActionAccent(economy.last_company_action)}
              />
            </Stack>
          </Box>
        )}

        {economy.last_market_movements.length > 0 && (
          <Box component="section" aria-label={t('economy.marketPulse')}>
            <SectionHeading
              icon={<InsightsRoundedIcon />}
              title={t('economy.marketPulse')}
              accent={ACCENT.info}
            />
            <Stack
              component="ul"
              spacing={0.5}
              sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.6 }}
            >
              {economy.last_market_movements.slice(0, 3).map((movement) => {
                const instrument = instrumentById.get(movement.instrument_id)
                const name = instrument
                  ? pack.messages[instrument.name_key] ?? t(instrument.name_key)
                  : movement.instrument_id
                const accent =
                  movement.change_basis_points > 0
                    ? ACCENT.success
                    : movement.change_basis_points < 0
                      ? ACCENT.danger
                      : ACCENT.neutral
                return (
                  <MarketMovementRow
                    key={movement.instrument_id}
                    name={name}
                    cause={t(`economy.causes.${movement.primary_cause}`)}
                    value={signedBasisPoints(movement.change_basis_points)}
                    direction={Math.sign(movement.change_basis_points)}
                    accent={accent}
                  />
                )
              })}
            </Stack>
          </Box>
        )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Metric({
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
      component="div"
      variant="outlined"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: { xs: 64, sm: 66 },
        px: { xs: 0.7, sm: 0.85 },
        py: 0.7,
        borderRadius: 1.75,
        borderColor: `${accent}45`,
        background: `linear-gradient(135deg, ${accent}1a 0%, rgba(29,25,49,.95) 48%, rgba(22,19,39,.98) 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.045)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '10px auto 10px 0',
          width: 3,
          borderRadius: '0 4px 4px 0',
          bgcolor: accent,
          boxShadow: `0 0 10px ${accent}80`,
        },
      }}
    >
      <Stack direction="row" spacing={0.65} alignItems="center" sx={{ height: '100%' }}>
        <Box
          aria-hidden
          sx={{
            width: { xs: 28, sm: 32 },
            height: { xs: 28, sm: 32 },
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1.25,
            color: accent,
            bgcolor: `${accent}1d`,
            border: `1px solid ${accent}32`,
            '& svg': { fontSize: { xs: 16, sm: 18 } },
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="dt"
            color="text.secondary"
            sx={{ fontSize: '0.75rem', lineHeight: 1.15 }}
          >
            {label}
          </Typography>
          <Typography
            component="dd"
            fontWeight={900}
            sx={{
              m: 0,
              mt: 0.1,
              color: accent,
              fontSize: { xs: '0.9rem', sm: '1rem' },
              lineHeight: 1.2,
              textShadow: `0 0 14px ${accent}20`,
            }}
          >
            {value}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  )
}

function SectionHeading({
  icon,
  title,
  accent,
}: {
  icon: ReactNode
  title: string
  accent: string
}) {
  return (
    <Stack direction="row" spacing={0.55} alignItems="center">
      <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: accent, '& svg': { fontSize: 17 } }}>
        {icon}
      </Box>
      <Typography
        variant="overline"
        fontWeight={850}
        sx={{ color: 'text.secondary', lineHeight: 1.2, letterSpacing: '.08em' }}
      >
        {title}
      </Typography>
      <Box
        aria-hidden
        sx={{
          height: '1px',
          flex: 1,
          background: `linear-gradient(90deg, ${accent}55, transparent)`,
        }}
      />
    </Stack>
  )
}

function InformationRow({
  icon,
  title,
  detail,
  accent,
}: {
  icon: ReactNode
  title: string
  detail: string
  accent: string
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 0.7,
        minWidth: 0,
        px: 0.75,
        py: 0.6,
        borderRadius: 1.5,
        borderLeft: `3px solid ${accent}`,
        bgcolor: `${accent}0d`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 25,
          height: 25,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          color: accent,
          bgcolor: `${accent}1d`,
          '& svg': { fontSize: 15 },
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography variant="body2" fontWeight={800} sx={{ lineHeight: 1.25 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function MarketMovementRow({
  name,
  cause,
  value,
  direction,
  accent,
}: {
  name: string
  cause: string
  value: string
  direction: number
  accent: string
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 0.7,
        minWidth: 0,
        px: 0.75,
        py: 0.6,
        borderRadius: 1.5,
        borderLeft: `3px solid ${accent}`,
        bgcolor: `${accent}0d`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 25,
          height: 25,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          color: accent,
          bgcolor: `${accent}1d`,
          '& svg': { fontSize: 15 },
        }}
      >
        {direction < 0 ? (
          <TrendingDownRoundedIcon />
        ) : direction > 0 ? (
          <TrendingUpRoundedIcon />
        ) : (
          <TrendingFlatRoundedIcon />
        )}
      </Box>
      <Box minWidth={0}>
        <Typography
          variant="body2"
          fontWeight={800}
          sx={{ lineHeight: 1.2, overflowWrap: 'anywhere' }}
        >
          {name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ lineHeight: 1.25, overflowWrap: 'anywhere' }}
        >
          {cause}
        </Typography>
      </Box>
      <Typography fontWeight={900} sx={{ color: accent, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  )
}

function weatherIcon(condition: WeatherCondition): ReactElement {
  switch (condition) {
    case 'clear':
      return <WbSunnyRoundedIcon />
    case 'rain':
      return <WaterDropRoundedIcon />
    case 'storm':
      return <ThunderstormRoundedIcon />
    case 'heatwave':
      return <DeviceThermostatRoundedIcon />
    case 'cold_wave':
      return <AcUnitRoundedIcon />
    case 'drought':
      return <LandscapeRoundedIcon />
  }
}

function companyActionAccent(action: string): string {
  if (action === 'expansion' || action === 'new_contract') return ACCENT.success
  if (action === 'dividend_warning' || action === 'labor_conflict') {
    return ACCENT.danger
  }
  if (action === 'debt_restructuring') return ACCENT.warning
  return ACCENT.secondary
}
