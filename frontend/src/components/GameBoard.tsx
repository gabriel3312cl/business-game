import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameState } from '../types'
import { BoardTile, type BoardToken } from './BoardTile'

interface GameBoardProps {
  pack: ContentPack
  zoom: number
  game?: GameState | null
  currentUserId?: string
  onCreateGame?: () => void
}

const playerColors = [
  '#b8ff3d',
  '#70b7ff',
  '#ff6ea8',
  '#ffb45c',
  '#9d8cff',
  '#55d6be',
  '#ff6b6b',
  '#f4e66a',
  '#cb8cff',
  '#78e08f',
  '#f7a8d8',
  '#91a7ff',
]

export function GameBoard({
  pack,
  zoom,
  game = null,
  currentUserId,
  onCreateGame,
}: GameBoardProps) {
  const { t } = useTranslation()
  const side = pack.manifest.side_length
  const compact = side > 11
  const tileSize = (compact ? 58 : 76) * zoom
  const currentPlayer = game?.players[game.current_player_index]
  const tokensByPosition = new Map<number, BoardToken[]>()
  game?.players.forEach((player, index) => {
    if (player.bankrupt) return
    const tokens = tokensByPosition.get(player.position) ?? []
    tokens.push({
      playerNumber: index + 1,
      displayName: player.display_name,
      color: playerColors[index % playerColors.length],
      active: index === game.current_player_index,
      currentUser: player.user_id === currentUserId,
    })
    tokensByPosition.set(player.position, tokens)
  })

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${side}, ${tileSize}px)`,
        gridTemplateRows: `repeat(${side}, ${tileSize}px)`,
        bgcolor: '#100d1d',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 2.5,
        overflow: 'hidden',
        boxShadow: '0 26px 80px rgba(0,0,0,.45)',
      }}
    >
      {pack.board.tiles.map((tile, index) => {
        const position = perimeterPosition(index, side)
        return (
          <BoardTile
            key={tile.id}
            tile={tile}
            name={pack.messages[tile.name_key]}
            gridColumn={position.column}
            gridRow={position.row}
            compact={compact}
            tokens={tokensByPosition.get(index)}
          />
        )
      })}

      <Stack
        sx={{
          gridColumn: `2 / ${side}`,
          gridRow: `2 / ${side}`,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background:
            'radial-gradient(circle at center, rgba(91,73,143,.18), transparent 58%)',
          p: 3,
        }}
        spacing={1.5}
      >
        <Chip
          label={game ? t(`gameStatus.${game.status}`) : t('preview')}
          size="small"
          color={game?.status === 'playing' ? 'success' : 'secondary'}
          variant="outlined"
        />
        <Typography variant={compact ? 'h4' : 'h3'} fontWeight={850}>
          {pack.messages[pack.manifest.name_key]}
        </Typography>
        {game ? (
          <>
            <Typography color="text.secondary">
              {game.status === 'lobby'
                ? t('waitingForPlayers', {
                    current: game.players.length,
                    minimum: pack.manifest.min_players,
                  })
                : game.status === 'playing'
                  ? t('currentTurn', {
                      player: currentPlayer?.display_name ?? t('bank'),
                    })
                  : t(`gameStatusMessage.${game.status}`)}
            </Typography>
            {game.last_roll && (
              <Chip
                label={t('lastRoll', {
                  first: game.last_roll[0],
                  second: game.last_roll[1],
                })}
                size="small"
              />
            )}
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              flexWrap="wrap"
              justifyContent="center"
            >
              {game.players.map((player, index) => (
                <Chip
                  key={player.user_id}
                  size="small"
                  disabled={player.bankrupt}
                  label={`${index + 1} · ${player.display_name}`}
                  sx={{
                    '&::before': {
                      content: '""',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: playerColors[index % playerColors.length],
                      ml: 1,
                    },
                  }}
                />
              ))}
            </Stack>
          </>
        ) : (
          <>
            <Typography color="text.secondary">
              {t('spaces', { count: pack.manifest.tile_count })} ·{' '}
              {t('players', {
                min: pack.manifest.min_players,
                max: pack.manifest.max_players,
              })}
            </Typography>
            <Button
              variant="contained"
              startIcon={<CasinoRoundedIcon />}
              onClick={onCreateGame}
              sx={{ mt: 1, color: '#142000' }}
            >
              {t('createGame')}
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}

function perimeterPosition(
  index: number,
  side: number,
): { column: number; row: number } {
  if (index < side) {
    return { column: index + 1, row: 1 }
  }
  if (index < side * 2 - 1) {
    return { column: side, row: index - side + 2 }
  }
  if (index < side * 3 - 2) {
    return { column: side - (index - (side * 2 - 1)), row: side }
  }
  return { column: 1, row: side - 1 - (index - (side * 3 - 2)) }
}
