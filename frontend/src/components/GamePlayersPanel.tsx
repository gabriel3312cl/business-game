import CrownRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
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
import type { GameState, User } from '../types'
import { playerColors } from './gameColors'

interface Props {
  game: GameState
  user: User
}

export function GamePlayersPanel({ game, user }: Props) {
  const { t } = useTranslation()

  return (
    <Box>
      <Typography fontWeight={850} sx={{ px: 1, pt: 0.5 }}>
        {t('playersPanel')}
      </Typography>
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {game.players.map((player, index) => {
          const active = index === game.current_player_index
          return (
            <ListItem
              key={player.user_id}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                px: 1,
                borderLeft: active
                  ? `4px solid ${playerColors[index % playerColors.length]}`
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
                    bgcolor: playerColors[index % playerColors.length],
                    color: '#0b0912',
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {index + 1}
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
