import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameState } from '../types'
import {
  BoardTile,
  type BoardEdge,
  type BoardOwner,
  type BoardToken,
} from './BoardTile'
import { playerColors } from './gameColors'
import {
  type MotionSettlement,
  useVisualPlayerPositions,
} from './gameMotion'

interface GameBoardProps {
  pack: ContentPack
  zoom: number
  game?: GameState | null
  currentUserId?: string
  onCreateGame?: () => void
  centerContent?: ReactNode
  syncMotionKey?: string | number
  onMotionSettled?: (settlement: MotionSettlement) => void
  motionPending?: boolean
  fitAvailableHeight?: boolean
}

export function GameBoard({
  pack,
  zoom,
  game = null,
  currentUserId,
  onCreateGame,
  centerContent,
  syncMotionKey,
  onMotionSettled,
  motionPending = false,
  fitAvailableHeight = false,
}: GameBoardProps) {
  const { t } = useTranslation()
  const side = pack.manifest.side_length
  const compact = side > 11
  const currentPlayer = game?.players[game.current_player_index]
  const visualPositions = useVisualPlayerPositions(
    game,
    pack.manifest.tile_count,
    syncMotionKey,
    onMotionSettled,
  )
  const tokensByPosition = new Map<number, BoardToken[]>()
  const ownersById = new Map<string, BoardOwner>()
  game?.players.forEach((player, index) => {
    const presentation = {
      playerNumber: index + 1,
      displayName: player.display_name,
      color: playerColors[index % playerColors.length],
    }
    ownersById.set(player.user_id, {
      ...presentation,
      ariaLabel: `${t('player')} ${index + 1}: ${player.display_name}`,
    })
    if (player.bankrupt) return
    const position = visualPositions[player.user_id] ?? player.position
    const tokens = tokensByPosition.get(position) ?? []
    tokens.push({
      playerId: player.user_id,
      ...presentation,
      active: index === game.current_player_index,
      currentUser: player.user_id === currentUserId,
    })
    tokensByPosition.set(position, tokens)
  })

  const maximumSize = compact ? 1040 : 900
  const trackTemplate = boardTrackTemplate(side)
  const boardSize = centerContent
    ? `min(${zoom * 100}%, calc(100dvh * ${zoom}))`
    : `min(${zoom * 100}%, ${maximumSize * zoom}px, calc((100dvh - 160px) * ${zoom}))`
  const fittedHeight = `min(${Math.min(zoom, 1) * 100}%, ${maximumSize * zoom}px)`

  return (
    <Box
      data-testid="game-board"
      aria-busy={motionPending}
      sx={{
        display: 'grid',
        gridTemplateColumns: trackTemplate,
        gridTemplateRows: trackTemplate,
        width: fitAvailableHeight ? 'auto' : boardSize,
        height: fitAvailableHeight ? fittedHeight : undefined,
        maxWidth: fitAvailableHeight ? '100%' : undefined,
        maxHeight: fitAvailableHeight ? '100%' : undefined,
        aspectRatio: '1',
        flex: '0 0 auto',
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
            edge={position.edge}
            compact={compact}
            tokens={tokensByPosition.get(index)}
            owner={ownersById.get(game?.owners[tile.id] ?? '')}
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
          p: { xs: 0.75, sm: 1.5, md: 2.5 },
          minWidth: 0,
          overflow: 'hidden',
        }}
        spacing={{ xs: 0.5, sm: 1, md: 1.5 }}
      >
        {centerContent ?? (
          <>
            <Chip
              label={game ? t(`gameStatus.${game.status}`) : t('preview')}
              size="small"
              color={game?.status === 'playing' ? 'success' : 'secondary'}
              variant="outlined"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            />
            <Typography
              variant={compact ? 'h4' : 'h3'}
              fontWeight={850}
              sx={{
                fontSize: {
                  xs: compact ? '0.85rem' : '1rem',
                  sm: compact ? '1.5rem' : '2rem',
                  md: compact ? '2rem' : '3rem',
                },
              }}
            >
              {pack.messages[pack.manifest.name_key]}
            </Typography>
            {game ? (
              <>
                <Typography
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: '0.6rem', sm: '0.85rem', md: '1rem' },
                  }}
                >
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
                    sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                  />
                )}
                <Stack
                  direction="row"
                  spacing={0.75}
                  useFlexGap
                  flexWrap="wrap"
                  justifyContent="center"
                  sx={{ display: { xs: 'none', md: 'flex' } }}
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
                <Typography
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.6rem', sm: '0.85rem' } }}
                >
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
                  sx={{
                    mt: { xs: 0, sm: 1 },
                    minHeight: { xs: 30, sm: 40 },
                    color: '#142000',
                    fontSize: { xs: '0.65rem', sm: '0.875rem' },
                  }}
                >
                  {t('createGame')}
                </Button>
              </>
            )}
          </>
        )}
      </Stack>
    </Box>
  )
}

function perimeterPosition(
  index: number,
  side: number,
): { column: number; row: number; edge: BoardEdge } {
  let column: number
  let row: number
  if (index < side) {
    column = index + 1
    row = 1
  } else if (index < side * 2 - 1) {
    column = side
    row = index - side + 2
  } else if (index < side * 3 - 2) {
    column = side - 1 - (index - (side * 2 - 1))
    row = side
  } else {
    column = 1
    row = side - 1 - (index - (side * 3 - 2))
  }

  const corner =
    (column === 1 || column === side) && (row === 1 || row === side)
  const edge: BoardEdge = corner
    ? 'corner'
    : row === 1
      ? 'top'
      : column === side
        ? 'right'
        : row === side
          ? 'bottom'
          : 'left'
  return { column, row, edge }
}

function boardTrackTemplate(side: number): string {
  if (side <= 2) return `repeat(${side}, minmax(0, 1fr))`
  return `1.35fr repeat(${side - 2}, minmax(0, 1fr)) 1.35fr`
}
