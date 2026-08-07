import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { santiagoTokenAssets } from '../assets/monopolySantiago'
import type {
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  TokenAppearanceSettings,
} from '../types'
import {
  BoardTile,
  type BoardOwner,
  type BoardTileHeatmap,
  type BoardToken,
} from './BoardTile'
import { BoardTileDialog } from './BoardTileDialog'
import { affectedTileIds } from './boardActionPulse'
import { perimeterPosition } from './boardGeometry'
import type { BoardHeatmap } from './boardHeatmap'
import { playerColors } from './gameColors'
import { tokenAssetPath } from './tokenAppearance'
import {
  type MotionAudioCue,
  type MotionSettlement,
  useVisualPlayerPositions,
} from './gameMotion'

interface GameBoardProps {
  pack: ContentPack
  zoom: number
  game?: GameState | null
  currentUserId?: string
  currentUserTokenAppearance?: TokenAppearanceSettings | null
  onCreateGame?: () => void
  centerContent?: ReactNode
  syncMotionKey?: string | number
  onMotionSettled?: (settlement: MotionSettlement) => void
  onTokenStep?: (cue: MotionAudioCue) => void
  onTokenTeleport?: (cue: MotionAudioCue) => void
  motionPending?: boolean
  fitAvailableHeight?: boolean
  busy?: boolean
  onCommand?: (command: GameCommand) => Promise<boolean>
  heatmap?: BoardHeatmap | null
  actionEvents?: GameEvent[]
}

interface TilePulseState {
  gameId: string | null
  sequences: Map<string, number>
}

export function GameBoard({
  pack,
  zoom,
  game = null,
  currentUserId,
  currentUserTokenAppearance = null,
  onCreateGame,
  centerContent,
  syncMotionKey,
  onMotionSettled,
  onTokenStep,
  onTokenTeleport,
  motionPending = false,
  fitAvailableHeight = false,
  busy = false,
  onCommand,
  heatmap = null,
  actionEvents = [],
}: GameBoardProps) {
  const { t, i18n } = useTranslation()
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const side = pack.manifest.side_length
  const compact = side > 11
  const currentPlayer = game?.players[game.current_player_index]
  const useAssetTokens = pack.board.tiles.some((tile) => tile.asset_path)
  const visualPositions = useVisualPlayerPositions(
    game,
    pack.manifest.tile_count,
    syncMotionKey,
    onMotionSettled,
    onTokenStep,
    onTokenTeleport,
  )
  const tokensByPosition = new Map<number, BoardToken[]>()
  const ownersById = new Map<string, BoardOwner>()
  game?.players.forEach((player, index) => {
    const currentUser = player.user_id === currentUserId
    const customAppearance = currentUser ? currentUserTokenAppearance : null
    const presentation = {
      playerNumber: index + 1,
      displayName: player.display_name,
      color: customAppearance?.color ?? playerColors[index % playerColors.length],
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
      shape: customAppearance?.shape,
      assetPath: customAppearance
        ? tokenAssetPath(customAppearance.icon)
        : useAssetTokens
          ? santiagoTokenAssets[index % santiagoTokenAssets.length]?.path
          : undefined,
      active: index === game.current_player_index,
      currentUser,
    })
    tokensByPosition.set(position, tokens)
  })

  const maximumSize = compact ? 1040 : 900
  const trackTemplate = boardTrackTemplate(side)
  const boardSize = centerContent
    ? `min(${zoom * 100}%, calc(100dvh * ${zoom}))`
    : `min(${zoom * 100}%, ${maximumSize * zoom}px, calc((100dvh - 160px) * ${zoom}))`
  const fittedHeight = `min(${Math.min(zoom, 1) * 100}%, ${maximumSize * zoom}px)`
  const selectedTile =
    pack.board.tiles.find((tile) => tile.id === selectedTileId) ?? null
  const tileIds = useMemo(
    () => new Set(pack.board.tiles.map((tile) => tile.id)),
    [pack.board.tiles],
  )
  const startTileId = useMemo(
    () => pack.board.tiles.find((tile) => tile.kind === 'start')?.id,
    [pack.board.tiles],
  )
  const tradePropertyIds = useMemo(
    () =>
      new Map(
        (game?.trades ?? []).map((trade) => [
          trade.id,
          [...trade.offered_property_ids, ...trade.requested_property_ids],
        ]),
      ),
    [game?.trades],
  )
  const actionCursor = useRef({
    gameId: game?.id ?? null,
    sequence: latestEventSequence(actionEvents),
  })
  const [tilePulses, setTilePulses] = useState<TilePulseState>(() => ({
    gameId: game?.id ?? null,
    sequences: new Map(),
  }))

  useEffect(() => {
    const gameId = game?.id ?? null
    const latestSequence = latestEventSequence(actionEvents)
    if (actionCursor.current.gameId !== gameId) {
      actionCursor.current = { gameId, sequence: latestSequence }
      setTilePulses({ gameId, sequences: new Map() })
      return
    }

    const newEvents = actionEvents.filter(
      (event) => event.sequence > actionCursor.current.sequence,
    )
    actionCursor.current.sequence = Math.max(
      actionCursor.current.sequence,
      latestSequence,
    )
    if (newEvents.length === 0 || gameId === null) return

    const updates = new Map<string, number>()
    for (const event of newEvents) {
      for (const tileId of affectedTileIds(event, {
        tileIds,
        startTileId,
        tradePropertyIds,
      })) {
        updates.set(tileId, event.sequence)
      }
    }
    if (updates.size === 0) return

    setTilePulses((current) => {
      const sequences =
        current.gameId === gameId ? new Map(current.sequences) : new Map()
      for (const [tileId, sequence] of updates) sequences.set(tileId, sequence)
      return { gameId, sequences }
    })
  }, [actionEvents, game?.id, startTileId, tileIds, tradePropertyIds])

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
        const name = pack.messages[tile.name_key] ?? tile.id
        const owner = ownersById.get(game?.owners[tile.id] ?? '')
        const buildingLevel = game?.building_levels[tile.id] ?? 0
        const mortgaged = game?.mortgaged_property_ids.includes(tile.id) ?? false
        const actionPulseSequence =
          tilePulses.gameId === game?.id
            ? tilePulses.sequences.get(tile.id)
            : undefined
        const buildingLabel =
          tile.kind !== 'property' || buildingLevel <= 0
            ? undefined
            : buildingLevel >= 5
              ? t('hotel')
              : t('houseCount', { count: buildingLevel })
        const heatmapCell = heatmap?.cells.get(index)
        const tileHeatmap = heatmap && heatmapCell
          ? boardTileHeatmap(heatmap, heatmapCell, t, i18n.language)
          : undefined
        return (
          <BoardTile
            key={`${tile.id}:${actionPulseSequence ?? 'idle'}`}
            tile={tile}
            name={name}
            gridColumn={position.column}
            gridRow={position.row}
            edge={position.edge}
            rotation={position.rotation}
            compact={compact}
            buildingLevel={buildingLevel}
            buildingLabel={buildingLabel}
            mortgaged={mortgaged}
            mortgageLabel={t('mortgaged')}
            actionPulse={actionPulseSequence !== undefined}
            tokens={tokensByPosition.get(index)}
            owner={owner}
            heatmap={tileHeatmap}
            tooltip={
              <Stack spacing={0.25}>
                <Typography variant="subtitle2" fontWeight={850}>
                  {name}
                </Typography>
                {tile.price != null && (
                  <Typography variant="caption">
                    {t('purchasePrice', { amount: tile.price })}
                  </Typography>
                )}
                <Typography variant="caption">
                  {owner
                    ? t('ownedBy', { player: owner.displayName })
                    : tile.price != null
                      ? t('unownedProperty')
                      : t(`tileKind.${tile.kind}`)}
                </Typography>
                {buildingLabel && (
                  <Typography variant="caption" color="success.light" fontWeight={800}>
                    {buildingLabel}
                  </Typography>
                )}
                {mortgaged && (
                  <Typography variant="caption" color="warning.light" fontWeight={850}>
                    {t('mortgaged')}
                  </Typography>
                )}
                <Typography variant="caption" color="secondary.light">
                  {t('clickForTileDetails')}
                </Typography>
                {tileHeatmap && (
                  <Typography variant="caption" color="info.light" fontWeight={800}>
                    {tileHeatmap.ariaLabel}
                  </Typography>
                )}
              </Stack>
            }
            onClick={() => setSelectedTileId(tile.id)}
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
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          scrollbarGutter: 'stable',
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
                          bgcolor:
                            player.user_id === currentUserId
                              ? currentUserTokenAppearance?.color ??
                                playerColors[index % playerColors.length]
                              : playerColors[index % playerColors.length],
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

      <BoardTileDialog
        tile={selectedTile}
        pack={pack}
        game={game}
        currentUserId={currentUserId}
        busy={busy}
        onClose={() => setSelectedTileId(null)}
        onSelectTile={setSelectedTileId}
        onCommand={onCommand}
      />
    </Box>
  )
}

function latestEventSequence(events: GameEvent[]): number {
  return events.reduce(
    (latest, event) => Math.max(latest, event.sequence),
    0,
  )
}

function boardTileHeatmap(
  heatmap: BoardHeatmap,
  cell: BoardHeatmap['cells'] extends Map<number, infer Value> ? Value : never,
  t: ReturnType<typeof useTranslation>['t'],
  locale: string,
): BoardTileHeatmap {
  if (heatmap.mode === 'history') {
    return {
      intensity: cell.intensity,
      color: '#ff7043',
      valueLabel: String(cell.value),
      ariaLabel: t('heatmap.visitCount', { count: cell.value }),
    }
  }

  const percentage = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format((cell.value / heatmap.total) * 100)
  return {
    intensity: cell.intensity,
    color: '#35d7ff',
    valueLabel: `${percentage}%`,
    ariaLabel: t('heatmap.probabilityValue', { value: percentage }),
  }
}

function boardTrackTemplate(side: number): string {
  if (side <= 2) return `repeat(${side}, minmax(0, 1fr))`
  return `1.35fr repeat(${side - 2}, minmax(0, 1fr)) 1.35fr`
}
