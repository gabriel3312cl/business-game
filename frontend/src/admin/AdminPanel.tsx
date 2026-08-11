import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteRestoreRoundedIcon from '@mui/icons-material/SettingsBackupRestoreRounded'
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { GAME_SOUNDS, gameAudio, type GameSound } from '../audio/gameAudio'
import type {
  AdminRoomSummary,
  AdminUserSummary,
  GameAudioCatalogItem,
  User,
} from '../types'

interface Props {
  user: User
  onClose: () => void
}

type AdminTab = 'users' | 'rooms' | 'audio'

const ADMIN_SOUND_GROUPS = [
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
] satisfies ReadonlyArray<{ id: string; sounds: readonly GameSound[] }>

export function AdminPanel({ user, onClose }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([])
  const [audio, setAudio] = useState<GameAudioCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextUsers, nextRooms, nextAudio] = await Promise.all([
        api.listAdminUsers(),
        api.listAdminRooms(),
        api.listAdminAudio(),
      ])
      setUsers(nextUsers)
      setRooms(nextRooms)
      setAudio(nextAudio)
      gameAudio.applyCatalog(nextAudio)
    } catch {
      setError(t('admin.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const updateUser = async (
    target: AdminUserSummary,
    update: { role?: 'player' | 'admin'; is_active?: boolean },
  ) => {
    setBusyKey(`user:${target.id}`)
    setError(null)
    try {
      const updated = await api.updateAdminUser(target.id, update)
      setUsers((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      )
    } catch {
      setError(t('admin.users.updateError'))
    } finally {
      setBusyKey(null)
    }
  }

  const cancelRoom = async (room: AdminRoomSummary) => {
    if (!window.confirm(t('admin.rooms.confirmCancel', { id: room.id }))) return
    setBusyKey(`room:${room.id}`)
    setError(null)
    try {
      await api.cancelAdminRoom(room.id)
      setRooms(await api.listAdminRooms())
    } catch {
      setError(t('admin.rooms.cancelError'))
    } finally {
      setBusyKey(null)
    }
  }

  const replaceAudio = async (sound: GameSound, file: File) => {
    setBusyKey(`audio:${sound}`)
    setError(null)
    try {
      const updated = await api.replaceAdminAudio(sound, file)
      const next = audio.map((item) =>
        item.sound_id === updated.sound_id ? updated : item,
      )
      setAudio(next)
      gameAudio.applyCatalog(next)
      gameAudio.preview(sound)
    } catch {
      setError(t('admin.audio.replaceError'))
    } finally {
      setBusyKey(null)
    }
  }

  const resetAudio = async (sound: GameSound) => {
    setBusyKey(`audio:${sound}`)
    setError(null)
    try {
      await api.resetAdminAudio(sound)
      const next = audio.map((item) =>
        item.sound_id === sound
          ? {
              sound_id: sound,
              custom: false,
              source_url: null,
              original_filename: null,
              content_type: null,
              size_bytes: null,
              updated_at: null,
            }
          : item,
      )
      setAudio(next)
      gameAudio.applyCatalog(next)
    } catch {
      setError(t('admin.audio.resetError'))
    } finally {
      setBusyKey(null)
    }
  }

  const audioById = new Map(audio.map((item) => [item.sound_id, item]))

  return (
    <Paper sx={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ px: { xs: 1.5, md: 2.5 }, py: 1.5 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <AdminPanelSettingsRoundedIcon color="secondary" />
          <Box>
            <Typography variant="h6" fontWeight={900}>
              {t('admin.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('admin.subtitle')}
            </Typography>
          </Box>
        </Stack>
        <IconButton aria-label={t('close')} onClick={onClose}>
          <CloseRoundedIcon />
        </IconButton>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, value: AdminTab) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ px: { xs: 1, md: 2 } }}
      >
        <Tab value="users" label={t('admin.tabs.users')} />
        <Tab value="rooms" label={t('admin.tabs.rooms')} />
        <Tab value="audio" label={t('admin.tabs.audio')} />
      </Tabs>

      <Box sx={{ p: { xs: 1.5, md: 2.5 }, overflow: 'auto', minHeight: 0 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Stack alignItems="center" py={8}>
            <CircularProgress />
          </Stack>
        ) : tab === 'users' ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.users.user')}</TableCell>
                  <TableCell>{t('admin.users.role')}</TableCell>
                  <TableCell align="center">{t('admin.users.active')}</TableCell>
                  <TableCell>{t('admin.users.created')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((item) => {
                  const self = item.id === user.id
                  const busy = busyKey === `user:${item.id}`
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={750}>
                          {item.display_name}
                          {self ? ` · ${t('admin.users.you')}` : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <Select
                            value={item.role}
                            disabled={busy || self}
                            onChange={(event) =>
                              void updateUser(item, {
                                role: event.target.value as 'player' | 'admin',
                              })
                            }
                          >
                            <MenuItem value="player">{t('admin.users.player')}</MenuItem>
                            <MenuItem value="admin">{t('admin.users.admin')}</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={item.is_active}
                          disabled={busy || self}
                          onChange={(_, checked) =>
                            void updateUser(item, { is_active: checked })
                          }
                          inputProps={{
                            'aria-label': t('admin.users.activeAccount', {
                              name: item.display_name,
                            }),
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                        }).format(new Date(item.created_at))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : tab === 'rooms' ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.rooms.room')}</TableCell>
                  <TableCell>{t('admin.rooms.status')}</TableCell>
                  <TableCell>{t('admin.rooms.host')}</TableCell>
                  <TableCell>{t('admin.rooms.members')}</TableCell>
                  <TableCell align="right">{t('admin.rooms.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rooms.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary" sx={{ py: 4 }}>
                        {t('admin.rooms.empty')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rooms.map((room) => {
                  const active = room.status === 'lobby' || room.status === 'playing'
                  return (
                    <TableRow key={room.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={750}>
                          {room.pack_id} · v{room.pack_version}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {room.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={t(`admin.rooms.statuses.${room.status}`)} />
                      </TableCell>
                      <TableCell>{room.host_name || room.host_user_id}</TableCell>
                      <TableCell>
                        {t('admin.rooms.memberSummary', {
                          humans: room.human_player_count,
                          bots: room.bot_count,
                          spectators: room.spectator_count,
                        })}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          disabled={!active || busyKey === `room:${room.id}`}
                          onClick={() => void cancelRoom(room)}
                        >
                          {t('admin.rooms.cancel')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Stack spacing={3}>
            <Paper
              variant="outlined"
              sx={(theme) => ({
                p: { xs: 1.5, sm: 2 },
                borderColor: 'primary.dark',
                background: `linear-gradient(135deg, ${alpha(
                  theme.palette.primary.main,
                  0.12,
                )}, ${alpha(theme.palette.secondary.main, 0.08)})`,
              })}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                spacing={1.5}
              >
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box
                    sx={(theme) => ({
                      width: 42,
                      height: 42,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      boxShadow: `0 8px 24px ${alpha(
                        theme.palette.primary.main,
                        0.22,
                      )}`,
                      flexShrink: 0,
                    })}
                  >
                    <VolumeUpRoundedIcon />
                  </Box>
                  <Box>
                    <Typography fontWeight={900}>
                      {t('admin.audio.libraryTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('admin.audio.help')}
                    </Typography>
                  </Box>
                </Stack>
                <Chip
                  color="primary"
                  variant="outlined"
                  label={t('admin.audio.soundCount', { count: GAME_SOUNDS.length })}
                />
              </Stack>
            </Paper>

            {ADMIN_SOUND_GROUPS.map((group) => (
              <Box key={group.id} component="section">
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={1}
                  sx={{ mb: 1 }}
                >
                  <Typography
                    component="h3"
                    variant="subtitle1"
                    fontWeight={900}
                    color="secondary.light"
                  >
                    {t(`audio.groups.${group.id}`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('admin.audio.soundCount', { count: group.sounds.length })}
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'minmax(0, 1fr)',
                      md: 'repeat(2, minmax(0, 1fr))',
                      xl: 'repeat(3, minmax(0, 1fr))',
                    },
                    gap: 1.25,
                  }}
                >
                  {group.sounds.map((sound) => {
                    const item = audioById.get(sound)
                    const busy = busyKey === `audio:${sound}`
                    const soundName = t(`audio.sounds.${sound}`)
                    return (
                      <Paper
                        key={sound}
                        variant="outlined"
                        sx={(theme) => ({
                          p: 1.5,
                          minHeight: 176,
                          display: 'flex',
                          flexDirection: 'column',
                          borderColor: item?.custom ? 'primary.main' : 'divider',
                          bgcolor: item?.custom
                            ? alpha(theme.palette.primary.main, 0.055)
                            : 'background.paper',
                          '&:hover': {
                            borderColor: 'primary.main',
                            boxShadow: theme.shadows[4],
                          },
                        })}
                      >
                        <Stack direction="row" alignItems="flex-start" spacing={1}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: 1.5,
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: 'action.hover',
                              color: 'primary.main',
                              flexShrink: 0,
                            }}
                          >
                            <GraphicEqRoundedIcon fontSize="small" />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={850}>
                              {soundName}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 0.35, lineHeight: 1.4 }}
                            >
                              {t(`audio.contexts.${sound}`)}
                            </Typography>
                          </Box>
                        </Stack>

                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.75}
                          sx={{ mt: 1.25, minWidth: 0 }}
                        >
                          <Chip
                            size="small"
                            color={item?.custom ? 'primary' : 'default'}
                            variant={item?.custom ? 'filled' : 'outlined'}
                            label={
                              item?.custom
                                ? t('admin.audio.custom')
                                : t('admin.audio.original')
                            }
                            sx={{ flexShrink: 0 }}
                          />
                          {item?.custom && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              title={item.original_filename ?? undefined}
                            >
                              {item.original_filename}
                            </Typography>
                          )}
                        </Stack>

                        <Stack
                          direction="row"
                          spacing={0.75}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mt: 'auto', pt: 1.5 }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PlayArrowRoundedIcon />}
                            aria-label={t('audio.previewSound', { sound: soundName })}
                            onClick={() => gameAudio.preview(sound)}
                          >
                            {t('admin.audio.preview')}
                          </Button>
                          {item?.custom && (
                            <Button
                              size="small"
                              color="inherit"
                              startIcon={<DeleteRestoreRoundedIcon />}
                              disabled={busy}
                              aria-label={t('admin.audio.restore', { sound: soundName })}
                              onClick={() => void resetAudio(sound)}
                            >
                              {t('admin.audio.restoreOriginal')}
                            </Button>
                          )}
                          <Button
                            component="label"
                            size="small"
                            variant="contained"
                            startIcon={
                              busy ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <UploadFileRoundedIcon />
                              )
                            }
                            disabled={busy}
                            sx={{ ml: { sm: 'auto' } }}
                          >
                            {t('admin.audio.change')}
                            <input
                              hidden
                              type="file"
                              accept=".ogg,.mp3,.wav,audio/ogg,audio/mpeg,audio/wav"
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0]
                                event.currentTarget.value = ''
                                if (file) void replaceAudio(sound, file)
                              }}
                            />
                          </Button>
                        </Stack>
                      </Paper>
                    )
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  )
}
