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
import type { ContentPack, GameState, OptionalRules } from '../types'

interface Props {
  game: GameState
  pack: ContentPack
  isHost: boolean
  busy: boolean
  onUpdate: (data: {
    max_players?: number
    allow_spectators?: boolean
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

  return (
    <Box>
      <Typography fontWeight={800} sx={{ mb: 1 }}>
        {t('roomSettings')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
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
        <FormControlLabel
          control={
            <Switch
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
      {pack.manifest.configurable_rules.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <Typography variant="subtitle2">{t('optionalRules')}</Typography>
          {pack.manifest.configurable_rules.map((ruleName) => (
            <FormControlLabel
              key={ruleName}
              control={
                <Switch
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
