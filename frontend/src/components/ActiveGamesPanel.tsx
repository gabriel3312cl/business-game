import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { GameState, User } from '../types'

interface Props {
  games: GameState[]
  user: User
  loading: boolean
  onResume: (game: GameState) => void
  onRefresh: () => void
}

export function ActiveGamesPanel({
  games,
  user,
  loading,
  onResume,
  onRefresh,
}: Props) {
  const { t } = useTranslation()

  return (
    <Box component="section" aria-labelledby="active-games-title" sx={{ mb: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Box minWidth={0}>
          <Typography id="active-games-title" fontWeight={900}>
            {t('activeGames.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('activeGames.subtitle')}
          </Typography>
        </Box>
        <Button
          size="small"
          color="inherit"
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : undefined
          }
          disabled={loading}
          onClick={onRefresh}
        >
          {t('refresh')}
        </Button>
      </Stack>

      {games.length === 0 ? (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: '1px dashed rgba(255,255,255,.14)',
            bgcolor: 'rgba(255,255,255,.025)',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {loading ? t('activeGames.loading') : t('activeGames.empty')}
          </Typography>
        </Box>
      ) : (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            overflowX: 'auto',
            pb: 0.75,
            scrollbarWidth: 'thin',
            scrollSnapType: 'x proximity',
          }}
        >
          {games.map((game) => {
            const player = game.players.find((candidate) => candidate.user_id === user.id)
            const activePlayers = game.players.filter((candidate) => !candidate.bankrupt)
            const currentPlayer = game.players[game.current_player_index]
            const isHost = game.host_user_id === user.id

            return (
              <Box
                key={game.id}
                sx={{
                  minWidth: { xs: 270, sm: 300 },
                  maxWidth: 340,
                  flex: '0 0 auto',
                  scrollSnapAlign: 'start',
                  borderColor: 'rgba(255,255,255,.11)',
                  bgcolor: 'rgba(255,255,255,.035)',
                  border: '1px solid',
                  borderRadius: 2.5,
                }}
              >
                <Box sx={{ p: 1.5 }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box minWidth={0}>
                        <Typography variant="caption" color="text.secondary">
                          {t('activeGames.room')}
                        </Typography>
                        <Typography fontWeight={900}>{game.id.slice(0, 8)}</Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={game.status === 'playing' ? 'success' : 'default'}
                        label={t(`gameStatus.${game.status}`)}
                      />
                    </Stack>

                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          isHost
                            ? t('activeGames.host')
                            : player
                              ? t('activeGames.player')
                              : t('activeGames.spectator')
                        }
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t('activeGames.playerCount', { count: activePlayers.length })}
                      />
                    </Stack>

                    <Typography variant="body2" color="text.secondary" noWrap>
                      {game.status === 'playing' && currentPlayer
                        ? t('activeGames.currentTurn', {
                            player: currentPlayer.display_name,
                          })
                        : t('activeGames.waiting')}
                    </Typography>

                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      onClick={() => onResume(game)}
                    >
                      {t('activeGames.resume')}
                    </Button>
                  </Stack>
                </Box>
              </Box>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}
