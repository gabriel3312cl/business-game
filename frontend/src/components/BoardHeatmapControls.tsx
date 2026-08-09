import LayersRoundedIcon from '@mui/icons-material/LayersRounded'
import {
  Button,
  FormControl,
  MenuItem,
  Select,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { PlayerState } from '../types'
import type { BoardHeatmapMode } from './boardHeatmap'

export type BoardHeatmapSource = 'current' | 'historical'

interface Props {
  mode: BoardHeatmapMode
  playerId: string | null
  players: PlayerState[]
  range: [number, number]
  maximumSequence: number
  probabilityAvailable: boolean
  source: BoardHeatmapSource
  historicalAvailable: boolean
  historicalGameCount: number
  historicalLoading: boolean
  showTitle?: boolean
  onModeChange: (mode: BoardHeatmapMode) => void
  onSourceChange: (source: BoardHeatmapSource) => void
  onPlayerChange: (playerId: string | null) => void
  onRangeChange: (range: [number, number]) => void
  onShowAllHistory: () => void
}

export function BoardHeatmapControls({
  mode,
  playerId,
  players,
  range,
  maximumSequence,
  probabilityAvailable,
  source,
  historicalAvailable,
  historicalGameCount,
  historicalLoading,
  showTitle = true,
  onModeChange,
  onSourceChange,
  onPlayerChange,
  onRangeChange,
  onShowAllHistory,
}: Props) {
  const { t } = useTranslation()
  const sliderMaximum = Math.max(1, maximumSequence)
  const fullHistory = range[0] === 1 && range[1] === maximumSequence

  return (
    <Stack spacing={1.25}>
      {showTitle && (
        <Stack direction="row" spacing={0.75} alignItems="center">
          <LayersRoundedIcon color="secondary" fontSize="small" />
          <Typography fontWeight={850}>{t('heatmap.title')}</Typography>
        </Stack>
      )}

      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={mode}
        aria-label={t('heatmap.layer')}
        onChange={(_, value: BoardHeatmapMode | null) => {
          if (value !== null) onModeChange(value)
        }}
      >
        <ToggleButton value="off">{t('heatmap.off')}</ToggleButton>
        <ToggleButton value="history">{t('heatmap.history')}</ToggleButton>
        <ToggleButton value="probability" disabled={!probabilityAvailable}>
          {t('heatmap.probability')}
        </ToggleButton>
      </ToggleButtonGroup>

      {mode === 'history' && (
        <Stack spacing={1}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={source}
            aria-label={t('heatmap.dataSource')}
            onChange={(_, value: BoardHeatmapSource | null) => {
              if (value !== null) onSourceChange(value)
            }}
          >
            <ToggleButton value="current">{t('heatmap.currentGame')}</ToggleButton>
            <ToggleButton value="historical" disabled={!historicalAvailable}>
              {historicalLoading
                ? t('heatmap.loadingHistorical')
                : t('heatmap.allBoardGames')}
            </ToggleButton>
          </ToggleButtonGroup>

          {source === 'current' ? (
            <>
              <FormControl size="small" fullWidth>
                <Select
                  value={playerId ?? 'all'}
                  aria-label={t('heatmap.playerFilter')}
                  onChange={(event) =>
                    onPlayerChange(event.target.value === 'all' ? null : event.target.value)
                  }
                >
                  <MenuItem value="all">{t('heatmap.allPlayers')}</MenuItem>
                  {players.map((player) => (
                    <MenuItem key={player.user_id} value={player.user_id}>
                      {player.display_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack spacing={0.25} sx={{ px: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('heatmap.eventRange', {
                    from: range[0],
                    to: range[1],
                  })}
                </Typography>
                <Slider
                  value={range}
                  min={1}
                  max={sliderMaximum}
                  step={1}
                  disableSwap
                  disabled={maximumSequence <= 1}
                  valueLabelDisplay="auto"
                  aria-label={t('heatmap.historyRange')}
                  onChange={(_, value) => {
                    if (Array.isArray(value)) {
                      onRangeChange([value[0], value[1]])
                    }
                  }}
                />
              </Stack>

              {!fullHistory && (
                <Button size="small" onClick={onShowAllHistory}>
                  {t('heatmap.showAllHistory')}
                </Button>
              )}
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t('heatmap.historicalSample', { count: historicalGameCount })}
            </Typography>
          )}
          <HeatmapLegend color="#ff7043" />
        </Stack>
      )}

      {mode === 'probability' && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">
            {t('heatmap.probabilityHelp')}
          </Typography>
          <HeatmapLegend color="#35d7ff" />
        </Stack>
      )}
    </Stack>
  )
}

function HeatmapLegend({ color }: { color: string }) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography variant="caption" color="text.secondary">
        {t('heatmap.low')}
      </Typography>
      <Stack
        aria-hidden
        sx={{
          height: 8,
          flex: 1,
          borderRadius: 999,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 18%, transparent), ${color})`,
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {t('heatmap.high')}
      </Typography>
    </Stack>
  )
}
