import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GAME_SOUNDS, gameAudio, type GameSound } from './gameAudio'

interface SoundGroup {
  id: string
  sounds: readonly GameSound[]
}

const SOUND_GROUPS = [
  {
    id: 'general',
    sounds: [
      'game-started',
      'game-finished',
      'action-rejected',
      'ui-important-click',
      'advisor-response',
    ],
  },
  {
    id: 'playersAndChat',
    sounds: [
      'player-joined',
      'player-left',
      'player-bankrupt',
      'chat-message',
      'chat-mention',
    ],
  },
  {
    id: 'connection',
    sounds: ['connection-lost', 'connection-restored'],
  },
  {
    id: 'turnAndMovement',
    sounds: [
      'turn-yours',
      'turn-extra-roll',
      'dice-roll-a',
      'dice-roll-b',
      'dice-doubles',
      'token-step-metal-soft',
      'token-teleport',
    ],
  },
  {
    id: 'cards',
    sounds: ['card-draw', 'card-positive', 'card-negative'],
  },
  {
    id: 'properties',
    sounds: [
      'property-purchase',
      'property-declined',
      'property-mortgaged',
      'property-unmortgaged',
      'building-house',
      'building-hotel',
      'building-sold',
    ],
  },
  {
    id: 'money',
    sounds: [
      'payment-received',
      'payment-sent',
      'salary-collected',
      'free-parking-collected',
      'tax-or-repairs',
      'debt-created',
      'debt-paid',
    ],
  },
  {
    id: 'bank',
    sounds: [
      'bank-loan-issued',
      'bank-loan-payment',
      'bank-emergency-credit',
      'bank-loan-defaulted',
      'bank-initialized',
    ],
  },
  {
    id: 'market',
    sounds: [
      'market-shares-bought',
      'market-shares-sold',
      'market-order-filled',
      'market-order-placed',
      'market-order-cancelled',
      'market-dividend-paid',
      'market-margin-call',
      'market-position-liquidated',
      'market-opened',
      'economy-week-advanced',
    ],
  },
  {
    id: 'auctions',
    sounds: [
      'auction-start',
      'auction-bid',
      'auction-countdown',
      'auction-completed',
      'auction-lost',
    ],
  },
  {
    id: 'trades',
    sounds: [
      'trade-proposed',
      'trade-accepted',
      'trade-rejected',
      'trade-cancelled',
    ],
  },
  {
    id: 'jail',
    sounds: ['jail-entered', 'jail-released', 'jail-roll-failed'],
  },
] satisfies readonly SoundGroup[]

export function AudioControls() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(() => gameAudio.getSettings())

  useEffect(() => {
    gameAudio.preloadAll()
    return gameAudio.subscribe(() => setSettings({ ...gameAudio.getSettings() }))
  }, [])

  const enabledCount = GAME_SOUNDS.length - settings.disabledSounds.length
  const buttonLabel = settings.muted
    ? t('audio.openSettingsMuted')
    : t('audio.openSettings', {
        enabled: enabledCount,
        total: GAME_SOUNDS.length,
      })

  return (
    <>
      <Tooltip title={buttonLabel}>
        <IconButton
          size="small"
          color={settings.muted || enabledCount === 0 ? 'default' : 'primary'}
          aria-label={buttonLabel}
          onClick={() => setOpen(true)}
        >
          {settings.muted || enabledCount === 0 ? (
            <VolumeOffRoundedIcon fontSize="small" />
          ) : (
            <VolumeUpRoundedIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="audio-settings-title"
      >
        <DialogTitle id="audio-settings-title">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <VolumeUpRoundedIcon color="primary" />
              <Typography component="span" variant="h6" fontWeight={850}>
                {t('audio.title')}
              </Typography>
            </Stack>
            <IconButton aria-label={t('close')} onClick={() => setOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.25}>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={!settings.muted}
                    onChange={(_, enabled) => gameAudio.setMuted(!enabled)}
                  />
                }
                label={t('audio.master')}
              />
              <Typography variant="body2" color="text.secondary">
                {t('audio.enabledSummary', {
                  enabled: enabledCount,
                  total: GAME_SOUNDS.length,
                })}
              </Typography>
            </Box>

            <Box>
              <Typography id="audio-volume-label" variant="subtitle2" gutterBottom>
                {t('audio.volume')}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <VolumeOffRoundedIcon fontSize="small" color="disabled" />
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  disabled={settings.muted}
                  aria-labelledby="audio-volume-label"
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                  onChange={(_, value) =>
                    gameAudio.setVolume(Array.isArray(value) ? value[0] : value)
                  }
                />
                <VolumeUpRoundedIcon fontSize="small" color="disabled" />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                spacing={1}
                mb={1.5}
              >
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>
                    {t('audio.systemSounds')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('audio.systemSoundsHelp')}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => gameAudio.setAllSoundsEnabled(true)}>
                    {t('audio.enableAll')}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => gameAudio.setAllSoundsEnabled(false)}
                  >
                    {t('audio.disableAll')}
                  </Button>
                </Stack>
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  columnGap: 2.5,
                  rowGap: 1.5,
                }}
              >
                {SOUND_GROUPS.map((group) => (
                  <Box key={group.id}>
                    <Typography
                      variant="overline"
                      color="secondary.light"
                      fontWeight={800}
                    >
                      {t(`audio.groups.${group.id}`)}
                    </Typography>
                    <List dense disablePadding>
                      {group.sounds.map((sound) => {
                        const enabled = !settings.disabledSounds.includes(sound)
                        return (
                          <ListItem
                            key={sound}
                            disableGutters
                            secondaryAction={
                              <Stack direction="row" alignItems="center" spacing={0.25}>
                                <Tooltip
                                  title={
                                    settings.muted || settings.volume <= 0
                                      ? t('audio.previewUnavailable')
                                      : t('audio.previewSound', {
                                          sound: t(`audio.sounds.${sound}`),
                                        })
                                  }
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      disabled={settings.muted || settings.volume <= 0}
                                      aria-label={t('audio.previewSound', {
                                        sound: t(`audio.sounds.${sound}`),
                                      })}
                                      onClick={() => gameAudio.preview(sound)}
                                    >
                                      <PlayArrowRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Switch
                                  edge="end"
                                  size="small"
                                  checked={enabled}
                                  inputProps={{
                                    'aria-label': t('audio.toggleSound', {
                                      sound: t(`audio.sounds.${sound}`),
                                    }),
                                  }}
                                  onChange={(_, checked) =>
                                    gameAudio.setSoundEnabled(sound, checked)
                                  }
                                />
                              </Stack>
                            }
                          >
                            <ListItemText primary={t(`audio.sounds.${sound}`)} />
                          </ListItem>
                        )
                      })}
                    </List>
                  </Box>
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="contained" onClick={() => setOpen(false)}>
            {t('audio.done')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
