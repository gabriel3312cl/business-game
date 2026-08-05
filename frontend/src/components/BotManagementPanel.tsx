import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BotController, BotPersonality, GameState } from '../types'

interface Props {
  game: GameState
  isHost: boolean
  busy: boolean
  onAdd: (
    controller: BotController,
    personality: BotPersonality,
    displayName?: string,
  ) => Promise<boolean>
  onRemove: (botId: string) => Promise<boolean>
}

const personalities: BotPersonality[] = [
  'conservative',
  'balanced',
  'aggressive',
  'negotiator',
]

export function BotManagementPanel({
  game,
  isHost,
  busy,
  onAdd,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  const [controller, setController] = useState<BotController>('standard')
  const [personality, setPersonality] = useState<BotPersonality>('balanced')
  const [displayName, setDisplayName] = useState('')
  const bots = game.players.filter((player) => player.is_bot)
  const maximum = game.settings.max_players ?? 12
  const roomIsFull = game.players.length >= maximum

  return (
    <Box>
      <Stack direction="row" spacing={0.75} alignItems="center" mb={1}>
        <SmartToyRoundedIcon color="secondary" fontSize="small" />
        <Typography fontWeight={800}>{t('bots')}</Typography>
      </Stack>
      {bots.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" mb={1.5}>
          {bots.map((bot) => (
            <Chip
              key={bot.user_id}
              sx={{
                maxWidth: '100%',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
              icon={<SmartToyRoundedIcon />}
              label={`${bot.display_name} · ${t(
                `botControllers.${bot.bot_controller ?? 'standard'}`,
              )} · ${t(`botPersonalities.${bot.bot_personality ?? 'balanced'}`)}`}
              onDelete={
                isHost && !busy
                  ? () => void onRemove(bot.user_id)
                  : undefined
              }
              deleteIcon={<DeleteOutlineRoundedIcon />}
              variant="outlined"
              color="secondary"
            />
          ))}
        </Stack>
      )}
      {isHost ? (
        <Stack spacing={1}>
          <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
            <InputLabel>{t('botController')}</InputLabel>
            <Select
              value={controller}
              label={t('botController')}
              disabled={busy || roomIsFull}
              onChange={(event) =>
                setController(event.target.value as BotController)
              }
            >
              <MenuItem value="standard">{t('botControllers.standard')}</MenuItem>
              <MenuItem value="ai">{t('botControllers.ai')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: '100%', minWidth: 0 }}>
            <InputLabel>{t('botPersonality')}</InputLabel>
            <Select
              value={personality}
              label={t('botPersonality')}
              disabled={busy || roomIsFull}
              onChange={(event) =>
                setPersonality(event.target.value as BotPersonality)
              }
            >
              {personalities.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`botPersonalities.${option}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            size="small"
            label={t('botNameOptional')}
            value={displayName}
            disabled={busy || roomIsFull}
            inputProps={{ maxLength: 40 }}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            startIcon={<SmartToyRoundedIcon />}
            disabled={busy || roomIsFull}
            onClick={async () => {
              const added = await onAdd(
                controller,
                personality,
                displayName || undefined,
              )
              if (added) setDisplayName('')
            }}
          >
            {roomIsFull ? t('roomFull') : t('addBot')}
          </Button>
          {controller === 'ai' && (
            <Typography variant="caption" color="text.secondary">
              {t('aiBotHint')}
            </Typography>
          )}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">
          {t('hostControlsBots')}
        </Typography>
      )}
    </Box>
  )
}
