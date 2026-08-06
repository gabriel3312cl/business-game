import CrownRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import {
  Avatar,
  Box,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { santiagoTokenAssets } from '../assets/monopolySantiago'
import type { GameState, TokenAppearanceSettings, User } from '../types'
import { AssetGlyph } from './AssetVisual'
import { playerColors } from './gameColors'
import { tokenAssetPath, tokenShapeStyle } from './tokenAppearance'

interface Props {
  game: GameState
  user: User
  useAssetTokens?: boolean
  currentUserTokenAppearance?: TokenAppearanceSettings | null
  showTitle?: boolean
}

export function GamePlayersPanel({
  game,
  user,
  useAssetTokens = false,
  currentUserTokenAppearance = null,
  showTitle = true,
}: Props) {
  const { t } = useTranslation()

  return (
    <Box>
      {showTitle && (
        <Typography fontWeight={850} sx={{ px: 1, pt: 0.5 }}>
          {t('playersPanel')}
        </Typography>
      )}
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {game.players.map((player, index) => {
          const active = index === game.current_player_index
          const customAppearance =
            player.user_id === user.id ? currentUserTokenAppearance : null
          const color =
            customAppearance?.color ?? playerColors[index % playerColors.length]
          const assetPath = customAppearance
            ? tokenAssetPath(customAppearance.icon)
            : useAssetTokens
              ? santiagoTokenAssets[index % santiagoTokenAssets.length].path
              : undefined
          return (
            <ListItem
              key={player.user_id}
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
              }}
            >
              <ListItemAvatar sx={{ minWidth: 42 }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: color,
                    color: '#0b0912',
                    fontWeight: 900,
                    fontSize: 14,
                    ...(customAppearance
                      ? tokenShapeStyle(customAppearance.shape)
                      : {}),
                  }}
                >
                  {assetPath ? (
                    <AssetGlyph path={assetPath} size="72%" />
                  ) : (
                    index + 1
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
                    : `$${player.balance}${
                        player.in_jail ? ` · ${t('detained')}` : ''
                      }${
                        player.is_bot
                          ? ` · ${t(
                              `botControllers.${player.bot_controller ?? 'standard'}`,
                            )} · ${t(
                              `botPersonalities.${player.bot_personality ?? 'balanced'}`,
                            )}`
                          : ''
                      }`
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
    </Box>
  )
}
