import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameState, WeatherCondition } from '../types'

interface Props {
  game: GameState
  pack: ContentPack
}

const WEATHER_SYMBOL: Record<WeatherCondition, string> = {
  clear: '☀️',
  rain: '🌧️',
  storm: '⛈️',
  heatwave: '🌡️',
  cold_wave: '❄️',
  drought: '🏜️',
}

export function EconomicPulsePanel({ game, pack }: Props) {
  const { t, i18n } = useTranslation()
  const economy = game.economy
  const formattedDate = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${economy.current_date}T12:00:00`))
  const instrumentById = new Map(
    game.bank.investments.map((instrument) => [instrument.id, instrument]),
  )
  const companyInstrument = economy.last_company_instrument_id
    ? instrumentById.get(economy.last_company_instrument_id)
    : undefined
  const companyName = companyInstrument
    ? pack.messages[companyInstrument.name_key] ?? t(companyInstrument.name_key)
    : economy.last_company_instrument_id

  return (
    <Box
      component="section"
      aria-label={t('economy.title')}
      sx={{
        width: 'min(100%, 620px)',
        borderRadius: 2.5,
        border: '1px solid rgba(83,196,255,.28)',
        bgcolor: 'rgba(13,35,49,.76)',
        boxShadow: '0 8px 28px rgba(0,0,0,.2)',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        useFlexGap
        flexWrap="wrap"
        gap={0.65}
        sx={{ px: { xs: 0.75, sm: 1.1 }, py: 0.8 }}
      >
        <CalendarMonthRoundedIcon color="info" fontSize="small" />
        <Typography
          component="time"
          dateTime={economy.current_date}
          fontWeight={850}
          sx={{ fontSize: { xs: '0.76rem', sm: '0.9rem' } }}
        >
          {formattedDate}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('economy.week', { count: economy.elapsed_weeks + 1 })}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={`${WEATHER_SYMBOL[economy.weather]} ${t(
            `economy.weather.${economy.weather}`,
          )}`}
          sx={{ height: 25 }}
        />
        <Chip
          size="small"
          color={economy.cycle === 'recession' ? 'warning' : 'info'}
          variant="outlined"
          label={t(`economy.cycle.${economy.cycle}`)}
          sx={{ height: 25 }}
        />
      </Stack>

      <Box
        component="details"
        sx={{
          borderTop: '1px solid rgba(83,196,255,.14)',
          '&[open]': { pb: 1 },
        }}
      >
        <Typography
          component="summary"
          variant="caption"
          color="info.light"
          fontWeight={750}
          sx={{ cursor: 'pointer', px: 1.1, py: 0.55 }}
        >
          {t('economy.summary', {
            season: t(`economy.season.${economy.season}`),
            difficulty: t(
              `economy.difficulty.${game.settings.economic_difficulty}`,
            ),
          })}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 0.65,
            px: 1,
          }}
        >
          <Metric label={t('economy.growth')} value={basisPoints(economy.annual_growth_basis_points)} />
          <Metric label={t('economy.inflation')} value={basisPoints(economy.annual_inflation_basis_points)} />
          <Metric label={t('economy.policyRate')} value={basisPoints(economy.policy_rate_basis_points)} />
          <Metric label={t('economy.unemployment')} value={basisPoints(economy.unemployment_basis_points)} />
          <Metric label={t('economy.confidence')} value={`${economy.consumer_confidence}/200`} />
          <Metric label={t('economy.sentiment')} value={signed(economy.market_sentiment)} />
        </Box>

        {economy.active_events.length > 0 && (
          <Stack spacing={0.35} sx={{ px: 1, mt: 0.8 }}>
            {economy.active_events.map((event) => (
              <Typography key={event.kind} variant="caption" color="warning.light">
                {t(`economy.events.${event.kind}`)} · {t('economy.weeksRemaining', {
                  count: event.remaining_weeks,
                })}
              </Typography>
            ))}
          </Stack>
        )}

        {economy.last_company_action && economy.last_company_instrument_id && (
          <Typography variant="caption" color="secondary.light" sx={{ px: 1, mt: 0.8, display: 'block' }}>
            {t('economy.companyAction', {
              company: companyName,
              action: t(`economy.companyActions.${economy.last_company_action}`),
            })}
          </Typography>
        )}

        {economy.last_market_movements.length > 0 && (
          <Stack spacing={0.35} sx={{ px: 1, mt: 0.8 }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <InsightsRoundedIcon sx={{ fontSize: 16 }} color="secondary" />
              <Typography variant="caption" fontWeight={800}>
                {t('economy.marketPulse')}
              </Typography>
            </Stack>
            {economy.last_market_movements.slice(0, 3).map((movement) => {
              const instrument = instrumentById.get(movement.instrument_id)
              const name = instrument
                ? pack.messages[instrument.name_key] ?? t(instrument.name_key)
                : movement.instrument_id
              return (
                <Typography key={movement.instrument_id} variant="caption">
                  {name}: {basisPoints(movement.change_basis_points)} ·{' '}
                  {t(`economy.causes.${movement.primary_cause}`)}
                </Typography>
              )
            })}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0, p: 0.55, borderRadius: 1.25, bgcolor: 'rgba(255,255,255,.045)' }}>
      <Typography variant="caption" color="text.secondary" noWrap display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={850}>
        {value}
      </Typography>
    </Box>
  )
}

function basisPoints(value: number): string {
  return `${(value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}
