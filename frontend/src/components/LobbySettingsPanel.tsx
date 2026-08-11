import {
  Box,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  EconomicDifficulty,
  GameState,
  OptionalRules,
  RuleOptionName,
} from '../types'

const FINANCIAL_RULES: RuleOptionName[] = [
  'loans_enabled',
  'stock_market_enabled',
  'custom_rent_debts_enabled',
]
const AUCTION_DEPOSIT_OPTIONS = [0, 5, 10, 15, 20, 25]
const AUCTION_MINIMUM_OPTIONS = [0, 25, 50, 70, 75, 100]

interface Props {
  game: GameState
  pack: ContentPack
  isHost: boolean
  busy: boolean
  onUpdate: (data: {
    max_players?: number
    allow_spectators?: boolean
    auction_deposit_percent?: number
    auction_minimum_bid_percent?: number
    economic_difficulty?: EconomicDifficulty
    advanced_economy_enabled?: boolean
    operating_cost_percent?: number
    finale_trigger_week?: number
    finale_duration_weeks?: number
    finale_vote_interval_weeks?: number
    rules?: Partial<OptionalRules>
  }) => void
}

export function LobbySettingsPanel({
  game,
  pack,
  isHost,
  busy,
  onUpdate,
}: Props) {
  const { t } = useTranslation()
  const maximum = game.settings.max_players ?? pack.manifest.max_players
  const configurableRules = [
    ...new Set<RuleOptionName>([
      ...pack.manifest.configurable_rules,
      ...FINANCIAL_RULES,
    ]),
  ]

  return (
    <Box>
      <Typography fontWeight={800} sx={{ mb: 1 }}>
        {t('roomSettings')}
      </Typography>
      <Stack spacing={1.25}>
        <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
          <InputLabel>{t('economy.difficultyLabel')}</InputLabel>
          <Select
            value={game.settings.economic_difficulty}
            label={t('economy.difficultyLabel')}
            disabled={!isHost || busy}
            onChange={(event) =>
              onUpdate({
                economic_difficulty: event.target.value as EconomicDifficulty,
              })
            }
          >
            {(['novice', 'easy', 'standard', 'pro', 'realistic'] as const).map(
              (difficulty) => (
                <MenuItem key={difficulty} value={difficulty}>
                  {t(`economy.difficulty.${difficulty}`)}
                </MenuItem>
              ),
            )}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          {t(
            `economy.difficultyDescription.${game.settings.economic_difficulty}`,
          )}
        </Typography>
        <FormControlLabel
          labelPlacement="start"
          sx={{ m: 0, justifyContent: 'space-between', gap: 1 }}
          control={
            <Switch
              checked={game.settings.advanced_economy_enabled}
              disabled={!isHost || busy}
              onChange={(_, checked) =>
                onUpdate({ advanced_economy_enabled: checked })
              }
            />
          }
          label={t('economy.advanced.enabled')}
        />
        {game.settings.advanced_economy_enabled && (
          <>
            <FormControl size="small" sx={{ width: '100%' }}>
              <InputLabel>{t('economy.advanced.operatingCost')}</InputLabel>
              <Select
                value={game.settings.operating_cost_percent}
                label={t('economy.advanced.operatingCost')}
                disabled={!isHost || busy}
                onChange={(event) =>
                  onUpdate({ operating_cost_percent: Number(event.target.value) })
                }
              >
                {[0, 1, 2, 3, 4, 5, 7, 10].map((percent) => (
                  <MenuItem key={percent} value={percent}>
                    {t('economy.advanced.percentEveryFourWeeks', { percent })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ width: '100%' }}>
              <InputLabel>{t('economy.advanced.finaleTrigger')}</InputLabel>
              <Select
                value={game.settings.finale_trigger_week}
                label={t('economy.advanced.finaleTrigger')}
                disabled={!isHost || busy}
                onChange={(event) =>
                  onUpdate({ finale_trigger_week: Number(event.target.value) })
                }
              >
                {[40, 60, 80, 100, 120].map((week) => (
                  <MenuItem key={week} value={week}>
                    {t('economy.week', { count: week })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ width: '100%' }}>
              <InputLabel>{t('economy.advanced.finaleDuration')}</InputLabel>
              <Select
                value={game.settings.finale_duration_weeks}
                label={t('economy.advanced.finaleDuration')}
                disabled={!isHost || busy}
                onChange={(event) =>
                  onUpdate({ finale_duration_weeks: Number(event.target.value) })
                }
              >
                {[8, 12, 16, 20].map((week) => (
                  <MenuItem key={week} value={week}>
                    {t('economy.advanced.weeks', { count: week })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}
        <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
          <InputLabel>{t('maximumPlayers')}</InputLabel>
          <Select
            value={maximum}
            label={t('maximumPlayers')}
            disabled={!isHost || busy}
            onChange={(event) =>
              onUpdate({ max_players: Number(event.target.value) })
            }
          >
            {Array.from(
              {
                length:
                  pack.manifest.max_players - pack.manifest.min_players + 1,
              },
              (_, index) => pack.manifest.min_players + index,
            ).map((count) => (
              <MenuItem
                key={count}
                value={count}
                disabled={count < game.players.length}
              >
                {count}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
          <InputLabel>{t('auctionDepositSetting')}</InputLabel>
          <Select
            value={game.settings.auction_deposit_percent}
            label={t('auctionDepositSetting')}
            disabled={!isHost || busy}
            onChange={(event) =>
              onUpdate({
                auction_deposit_percent: Number(event.target.value),
              })
            }
          >
            {AUCTION_DEPOSIT_OPTIONS.map((percent) => (
              <MenuItem key={percent} value={percent}>
                {percent === 0
                  ? t('auctionDepositDisabled')
                  : t('percentOfOriginalPrice', { percent })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
          <InputLabel>{t('auctionMinimumSetting')}</InputLabel>
          <Select
            value={game.settings.auction_minimum_bid_percent}
            label={t('auctionMinimumSetting')}
            disabled={!isHost || busy}
            onChange={(event) =>
              onUpdate({
                auction_minimum_bid_percent: Number(event.target.value),
              })
            }
          >
            {AUCTION_MINIMUM_OPTIONS.map((percent) => (
              <MenuItem key={percent} value={percent}>
                {percent === 0
                  ? t('auctionMinimumNoReserve')
                  : t('percentOfOriginalPrice', { percent })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          labelPlacement="start"
          sx={{
            m: 0,
            width: '100%',
            justifyContent: 'space-between',
            gap: 1,
            '& .MuiFormControlLabel-label': {
              minWidth: 0,
              overflowWrap: 'anywhere',
            },
          }}
          control={
            <Switch
              sx={{ flexShrink: 0 }}
              checked={game.settings.allow_spectators}
              disabled={!isHost || busy || game.spectators.length > 0}
              onChange={(_, checked) =>
                onUpdate({ allow_spectators: checked })
              }
            />
          }
          label={t('allowSpectators')}
        />
      </Stack>
      {configurableRules.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <Typography variant="subtitle2">{t('optionalRules')}</Typography>
          {configurableRules.map((ruleName) => (
            <FormControlLabel
              key={ruleName}
              labelPlacement="start"
              sx={{
                m: 0,
                width: '100%',
                justifyContent: 'space-between',
                gap: 1,
                '& .MuiFormControlLabel-label': {
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                },
              }}
              control={
                <Switch
                  sx={{ flexShrink: 0 }}
                  checked={game.settings.rules[ruleName]}
                  disabled={!isHost || busy}
                  onChange={(_, checked) =>
                    onUpdate({ rules: { [ruleName]: checked } })
                  }
                />
              }
              label={t(`rules.${ruleName}`)}
            />
          ))}
        </Stack>
      )}
      {!isHost && (
        <Typography variant="caption" color="text.secondary">
          {t('hostControlsSettings')}
        </Typography>
      )}
    </Box>
  )
}
