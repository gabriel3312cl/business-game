import CrownRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { santiagoTokenAssets } from '../assets/monopolySantiago'
import type {
  ContentPack,
  GameEvent,
  GameState,
  TokenAppearanceSettings,
  User,
  VisualEffectsIntensity,
} from '../types'
import { AssetGlyph } from './AssetVisual'
import { playerColors } from './gameColors'
import {
  buildPlayerListEntries,
  type PlayerSortOption,
} from './playerOrdering'
import {
  tokenAssetPath,
  tokenFillStyle,
  tokenShapeStyle,
} from './tokenAppearance'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  useAssetTokens?: boolean
  currentUserTokenAppearance?: TokenAppearanceSettings | null
  showTitle?: boolean
  motionIntensity?: VisualEffectsIntensity
  onHoveredPlayerChange?: (playerId: string | null) => void
}

export function GamePlayersPanel({
  game,
  pack,
  user,
  useAssetTokens = false,
  currentUserTokenAppearance = null,
  showTitle = true,
  motionIntensity = 'full',
  onHoveredPlayerChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState<PlayerSortOption>('turnOrder')
  const players = useMemo(
    () => buildPlayerListEntries(game, pack, sortOption, i18n.language),
    [game, pack, sortOption, i18n.language],
  )
  const selectedBot = game.players.find(
    (player) => player.is_bot && player.user_id === selectedBotId,
  )
  const selectedRelationship = selectedBot
    ? game.bot_relationships.find(
        (item) =>
          item.bot_id === selectedBot.user_id && item.player_id === user.id,
      )
    : undefined
  const selectedScore = selectedRelationship?.score ?? 0
  const selectedPresentation = relationshipLevel(selectedScore)
  const selectedInteractions = selectedBot
    ? relationshipInteractions(game.events, selectedBot.user_id, user.id)
    : []
  const adviceKeys = relationshipAdviceKeys(selectedInteractions)

  useEffect(
    () => () => onHoveredPlayerChange?.(null),
    [onHoveredPlayerChange],
  )

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ px: 1, pt: 0.5 }}
      >
        {showTitle && (
          <Typography fontWeight={850}>{t('playersPanel')}</Typography>
        )}
        <FormControl size="small" sx={{ minWidth: 170, ml: 'auto' }}>
          <InputLabel id="player-sort-label">{t('playerSort.label')}</InputLabel>
          <Select
            labelId="player-sort-label"
            value={sortOption}
            label={t('playerSort.label')}
            onChange={(event) =>
              setSortOption(event.target.value as PlayerSortOption)
            }
          >
            <MenuItem value="turnOrder">{t('playerSort.turnOrder')}</MenuItem>
            <MenuItem value="netWorth">{t('playerSort.netWorth')}</MenuItem>
            <MenuItem value="cash">{t('playerSort.cash')}</MenuItem>
            <MenuItem value="name">{t('playerSort.name')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {players.map(({ player, playerIndex, estimatedNetWorth }) => {
          const active = playerIndex === game.current_player_index
          const customAppearance =
            player.user_id === user.id ? currentUserTokenAppearance : null
          const color =
            customAppearance?.color ??
            playerColors[playerIndex % playerColors.length]
          const assetPath = customAppearance
            ? tokenAssetPath(customAppearance.icon)
            : useAssetTokens
              ? santiagoTokenAssets[
                  playerIndex % santiagoTokenAssets.length
                ].path
              : undefined
          const relationship = player.is_bot
            ? game.bot_relationships.find(
                (item) =>
                  item.bot_id === player.user_id && item.player_id === user.id,
              )
            : undefined
          const relationshipPresentation = relationshipLevel(
            relationship?.score ?? 0,
          )
          return (
            <ListItem
              key={player.user_id}
              data-player-effect-id={player.user_id}
              onMouseEnter={() => onHoveredPlayerChange?.(player.user_id)}
              onMouseLeave={() => onHoveredPlayerChange?.(null)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                px: 1,
                borderLeft: active
                  ? `4px solid ${color}`
                  : '4px solid transparent',
                bgcolor:
                  player.user_id === user.id
                    ? 'rgba(157,140,255,.12)'
                    : 'transparent',
                opacity: player.bankrupt ? 0.45 : 1,
                filter: player.bankrupt ? 'grayscale(1)' : 'none',
                transition:
                  motionIntensity === 'off'
                    ? 'none'
                    : 'background-color 180ms ease, border-color 180ms ease, opacity 180ms ease, filter 180ms ease',
                animation:
                  active && !player.bankrupt && motionIntensity === 'full'
                    ? 'active-player-arrival 760ms ease-out'
                    : undefined,
                '@keyframes active-player-arrival': {
                  '0%': { boxShadow: `0 0 0 0 ${color}00` },
                  '45%': { boxShadow: `0 0 0 4px ${color}50` },
                  '100%': { boxShadow: `0 0 0 0 ${color}00` },
                },
              }}
            >
              <ListItemAvatar sx={{ minWidth: 42 }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    ...(customAppearance
                      ? tokenFillStyle(customAppearance)
                      : { bgcolor: color }),
                    color: '#0b0912',
                    fontWeight: 900,
                    fontSize: 14,
                    ...(customAppearance
                      ? tokenShapeStyle(customAppearance.shape)
                      : {}),
                  }}
                >
                  {customAppearance?.icon === 'emoji' && customAppearance.emoji ? (
                    customAppearance.emoji
                  ) : assetPath ? (
                    <AssetGlyph path={assetPath} size="72%" />
                  ) : (
                    playerIndex + 1
                  )}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box
                    component="span"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: active ? 800 : 600,
                      }}
                    >
                      {player.display_name}
                    </Box>
                    {player.is_bot && (
                      <SmartToyRoundedIcon
                        color="secondary"
                        sx={{ fontSize: 16 }}
                        aria-label={t('bot')}
                      />
                    )}
                    {player.is_bot && (
                      <Tooltip
                        arrow
                        title={
                          <Stack spacing={0.35} sx={{ py: 0.25 }}>
                            <Typography variant="caption" fontWeight={800}>
                              {t('relationships.tooltipWhy', {
                                reason: relationship?.last_reason
                                  ? t(
                                      `relationships.reasons.${relationship.last_reason}`,
                                      {
                                        defaultValue: relationship.last_reason,
                                      },
                                    )
                                  : t('relationships.noInteractions'),
                              })}
                            </Typography>
                            <Typography variant="caption">
                              {t('relationships.details', {
                                score: relationship?.score ?? 0,
                                count: relationship?.interaction_count ?? 0,
                              })}
                            </Typography>
                            <Typography variant="caption" color="inherit">
                              {t('relationships.tooltipAction')}
                            </Typography>
                          </Stack>
                        }
                      >
                        <Chip
                          size="small"
                          clickable
                          onClick={() => setSelectedBotId(player.user_id)}
                          label={t(
                            `relationships.levels.${relationshipPresentation.level}`,
                          )}
                          aria-label={t('relationships.ariaLabel', {
                            bot: player.display_name,
                            level: t(
                              `relationships.levels.${relationshipPresentation.level}`,
                            ),
                          })}
                          sx={{
                            height: 19,
                            bgcolor: relationshipPresentation.background,
                            color: relationshipPresentation.color,
                            border: `1px solid ${relationshipPresentation.border}`,
                            '&:hover': {
                              bgcolor: relationshipPresentation.background,
                              filter: 'brightness(1.2)',
                            },
                            '& .MuiChip-label': {
                              px: 0.65,
                              fontSize: '0.62rem',
                              fontWeight: 850,
                            },
                          }}
                        />
                      </Tooltip>
                    )}
                    {player.user_id === game.host_user_id && (
                      <CrownRoundedIcon
                        color="primary"
                        sx={{ fontSize: 16 }}
                        aria-label={t('host')}
                      />
                    )}
                  </Box>
                }
                secondary={
                  player.bankrupt
                    ? t('bankrupt')
                    : (
                        <Box component="span">
                          <AnimatedBalance
                            value={
                              sortOption === 'netWorth'
                                ? estimatedNetWorth
                                : player.balance
                            }
                            intensity={motionIntensity}
                          />
                          {sortOption === 'netWorth'
                            ? ` ${t('playerSort.netWorthValue')}`
                            : ''}
                          {player.in_jail ? ` · ${t('detained')}` : ''}
                          {player.is_bot
                            ? ` · ${t(
                                `botControllers.${player.bot_controller ?? 'standard'}`,
                              )} · ${t(
                                `botPersonalities.${player.bot_personality ?? 'balanced'}`,
                              )}`
                            : ''}
                        </Box>
                      )
                }
              />
              {active && (
                <Chip size="small" color="secondary" label={t('turn')} />
              )}
            </ListItem>
          )
        })}
        {game.spectators.map((spectator) => (
          <ListItem key={spectator.user_id} sx={{ px: 1 }}>
            <ListItemAvatar sx={{ minWidth: 42 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.800' }}>
                <VisibilityRoundedIcon sx={{ fontSize: 17 }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={spectator.display_name}
              secondary={t('spectator')}
            />
          </ListItem>
        ))}
      </List>
      {selectedBot && (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={() => setSelectedBotId(null)}
          aria-labelledby="relationship-dialog-title"
        >
          <DialogTitle id="relationship-dialog-title" sx={{ pr: 7 }}>
            {t('relationships.modalTitle', { bot: selectedBot.display_name })}
            <IconButton
              aria-label={t('close')}
              onClick={() => setSelectedBotId(null)}
              sx={{ position: 'absolute', top: 12, right: 12 }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.25}>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderColor: selectedPresentation.border,
                  bgcolor: selectedPresentation.background,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography fontWeight={850}>
                      {t('relationships.modalSummary', {
                        bot: selectedBot.display_name,
                        level: t(
                          `relationships.levels.${selectedPresentation.level}`,
                        ),
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('relationships.details', {
                        score: selectedScore,
                        count: selectedRelationship?.interaction_count ?? 0,
                      })}
                    </Typography>
                  </Box>
                  <Chip
                    label={t(
                      `relationships.levels.${selectedPresentation.level}`,
                    )}
                    sx={{
                      bgcolor: selectedPresentation.background,
                      color: selectedPresentation.color,
                      border: `1px solid ${selectedPresentation.border}`,
                      fontWeight: 850,
                    }}
                  />
                </Stack>
              </Paper>

              <Box>
                <Typography fontWeight={850}>
                  {t('relationships.historyTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('relationships.historyHelp')}
                </Typography>
                {selectedInteractions.length === 0 ? (
                  <Typography variant="body2" sx={{ mt: 1.25 }}>
                    {t('relationships.emptyHistory')}
                  </Typography>
                ) : (
                  <List disablePadding sx={{ mt: 1 }}>
                    {selectedInteractions.map((interaction, index) => {
                      const result = relationshipLevel(interaction.score)
                      return (
                        <Box key={interaction.sequence}>
                          {index > 0 && <Divider />}
                          <ListItem disableGutters alignItems="flex-start">
                            <ListItemText
                              primary={t(
                                `relationships.reasons.${interaction.reason}`,
                                { defaultValue: interaction.reason },
                              )}
                              secondary={formatRelationshipTime(
                                interaction.occurredAt,
                                i18n.language,
                              )}
                              slotProps={{
                                primary: { fontWeight: 700 },
                                secondary: { variant: 'caption' },
                              }}
                            />
                            <Stack alignItems="flex-end" spacing={0.4} sx={{ pl: 1 }}>
                              <Typography
                                fontWeight={900}
                                color={
                                  interaction.delta > 0
                                    ? 'success.main'
                                    : interaction.delta < 0
                                      ? 'error.main'
                                      : 'text.secondary'
                                }
                              >
                                {formatDelta(interaction.delta)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {t('relationships.resultingScore', {
                                  score: interaction.score,
                                  level: t(`relationships.levels.${result.level}`),
                                })}
                              </Typography>
                            </Stack>
                          </ListItem>
                        </Box>
                      )
                    })}
                  </List>
                )}
                {!game.events_complete && selectedInteractions.length > 0 && (
                  <Typography variant="caption" color="warning.main">
                    {t('relationships.partialHistory')}
                  </Typography>
                )}
              </Box>

              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={0.8} alignItems="center">
                  <LightbulbRoundedIcon color="primary" fontSize="small" />
                  <Typography fontWeight={850}>
                    {t('relationships.adviceTitle')}
                  </Typography>
                </Stack>
                <List dense disablePadding sx={{ mt: 0.75, pl: 2.5, listStyle: 'disc' }}>
                  {adviceKeys.map((key) => (
                    <ListItem
                      key={key}
                      disableGutters
                      sx={{ display: 'list-item', py: 0.3 }}
                    >
                      <Typography variant="body2">
                        {t(`relationships.advice.${key}`)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedBotId(null)}>{t('close')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}

function AnimatedBalance({
  value,
  intensity,
}: {
  value: number
  intensity: VisualEffectsIntensity
}) {
  const previousValue = useRef(value)
  const [displayedValue, setDisplayedValue] = useState(value)

  useEffect(() => {
    const from = previousValue.current
    previousValue.current = value
    if (from === value || intensity === 'off') {
      setDisplayedValue(value)
      return
    }

    const duration = intensity === 'soft' ? 280 : 650
    const startedAt = performance.now()
    let frame = 0
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayedValue(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [intensity, value])

  return <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>${displayedValue}</Box>
}

interface RelationshipInteraction {
  sequence: number
  occurredAt: string
  delta: number
  score: number
  reason: string
}

function relationshipInteractions(
  events: GameEvent[],
  botId: string,
  playerId: string,
): RelationshipInteraction[] {
  return events
    .filter(
      (event) =>
        event.type === 'relationship.changed' &&
        event.data.bot_id === botId &&
        event.data.player_id === playerId,
    )
    .map((event) => ({
      sequence: event.sequence,
      occurredAt: event.occurred_at,
      delta: numberEventData(event, 'delta'),
      score: numberEventData(event, 'score'),
      reason: stringEventData(event, 'reason') ?? 'unknown',
    }))
    .sort((first, second) => second.sequence - first.sequence)
}

type RelationshipAdviceKey =
  | 'acceptedTrade'
  | 'counterOffer'
  | 'blockedGroup'
  | 'lostAuction'
  | 'paidRent'

function relationshipAdviceKeys(
  interactions: RelationshipInteraction[],
): RelationshipAdviceKey[] {
  const adviceByReason: Record<string, RelationshipAdviceKey> = {
    trade_rejected: 'counterOffer',
    trade_cancelled: 'counterOffer',
    blocked_group: 'blockedGroup',
    lost_auction: 'lostAuction',
    paid_rent: 'paidRent',
  }
  const keys = interactions
    .map((interaction) => adviceByReason[interaction.reason])
    .filter((key): key is RelationshipAdviceKey => Boolean(key))
  const defaults: RelationshipAdviceKey[] = ['acceptedTrade', 'counterOffer']
  return [...new Set<RelationshipAdviceKey>([...keys, ...defaults])].slice(0, 3)
}

function numberEventData(event: GameEvent, key: string): number {
  const value = event.data[key]
  return typeof value === 'number' ? value : 0
}

function stringEventData(event: GameEvent, key: string): string | undefined {
  const value = event.data[key]
  return typeof value === 'string' ? value : undefined
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

function formatRelationshipTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

type RelationshipLevel =
  | 'enemy'
  | 'hostile'
  | 'neutral'
  | 'ally'
  | 'superFriend'

function relationshipLevel(score: number): {
  level: RelationshipLevel
  background: string
  border: string
  color: string
} {
  if (score <= -41) {
    return {
      level: 'enemy',
      background: 'rgba(239,83,80,.18)',
      border: 'rgba(239,83,80,.72)',
      color: '#ff8a80',
    }
  }
  if (score <= -16) {
    return {
      level: 'hostile',
      background: 'rgba(255,152,0,.16)',
      border: 'rgba(255,152,0,.7)',
      color: '#ffb74d',
    }
  }
  if (score <= 15) {
    return {
      level: 'neutral',
      background: 'rgba(255,255,255,.07)',
      border: 'rgba(255,255,255,.32)',
      color: '#f3f0ff',
    }
  }
  if (score <= 40) {
    return {
      level: 'ally',
      background: 'rgba(102,187,106,.16)',
      border: 'rgba(102,187,106,.68)',
      color: '#81c784',
    }
  }
  return {
    level: 'superFriend',
    background: 'rgba(184,255,61,.2)',
    border: 'rgba(184,255,61,.78)',
    color: '#c9ff70',
  }
}
