import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import type {
  BoardMovementPreviewMode,
  BoardTileViewMode,
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  TokenAppearanceSettings,
  VisualEffectsIntensity,
} from '../types'
import type { PropertyEffectAction } from '../visualEffects'
import {
  BoardTile,
  type BoardOwner,
  type BoardTileHeatmap,
  type BoardToken,
} from './BoardTile'
import { BoardTileDialog } from './BoardTileDialog'
import { TileVisual } from './AssetVisual'
import { affectedTileIds } from './boardActionPulse'
import { perimeterPosition } from './boardGeometry'
import { boardHeatmapColor, type BoardHeatmap } from './boardHeatmap'
import { defaultTileColor, tileIconBackgroundStyle } from './tilePresentation'
import { tokenAssetPath } from './tokenAppearance'
import { resolvedPlayerAppearance } from './playerAppearance'
import {
  type MotionAudioCue,
  type MotionSettlement,
  useVisualPlayerPositions,
} from './gameMotion'

interface GameBoardProps {
  pack: ContentPack
  zoom: number
  game?: GameState | null
  motionGame?: GameState | null
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
  onTrade?: (ownerId: string, propertyId: string) => void
  heatmap?: BoardHeatmap | null
  actionEvents?: GameEvent[]
  motionIntensity?: VisualEffectsIntensity
  highlightedTileId?: string | null
  highlightedPlayerId?: string | null
  tileViewMode?: BoardTileViewMode
  movementPreviewMode?: BoardMovementPreviewMode
}

interface TileEffect {
  sequence: number
  action: PropertyEffectAction | 'pulse'
}

interface TilePulseState {
  gameId: string | null
  sequences: Map<string, TileEffect>
}

interface TilePreviewState {
  tileIndex: number
  kind: 'tile' | 'group'
  source: 'manual' | 'movement'
  playerId?: string
  final?: boolean
}

export function GameBoard({
  pack,
  zoom,
  game = null,
  motionGame,
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
  onTrade,
  heatmap = null,
  actionEvents = [],
  motionIntensity = 'full',
  highlightedTileId = null,
  highlightedPlayerId = null,
  tileViewMode = 'detailed',
  movementPreviewMode = 'steps',
}: GameBoardProps) {
  const { t, i18n } = useTranslation()
  const authoritativeMotionGame = motionGame === undefined ? game : motionGame
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [tilePreview, setTilePreview] = useState<TilePreviewState | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const [focusableTileId, setFocusableTileId] = useState<string | null>(
    () => pack.board.tiles[0]?.id ?? null,
  )
  const tileButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const keyboardInstructionsId = useId()
  const side = pack.manifest.side_length
  const compact = side > 11
  const currentPlayer = game?.players[game.current_player_index]
  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }, [])
  const showMovementPreview = useCallback(
    (cue: MotionAudioCue) => {
      if (
        movementPreviewMode === 'off' ||
        (movementPreviewMode === 'landing' && !cue.final)
      ) {
        return
      }
      clearPreviewTimer()
      setTilePreview({
        tileIndex: cue.position,
        kind: 'tile',
        source: 'movement',
        playerId: cue.playerId,
        final: cue.final,
      })
      if (cue.final) {
        previewTimerRef.current = window.setTimeout(() => {
          setTilePreview((current) =>
            current?.source === 'movement' ? null : current,
          )
          previewTimerRef.current = null
        }, 2600)
      }
    },
    [clearPreviewTimer, movementPreviewMode],
  )
  const handleTokenStep = useCallback(
    (cue: MotionAudioCue) => {
      onTokenStep?.(cue)
      showMovementPreview(cue)
    },
    [onTokenStep, showMovementPreview],
  )
  const handleTokenTeleport = useCallback(
    (cue: MotionAudioCue) => {
      onTokenTeleport?.(cue)
      showMovementPreview(cue)
    },
    [onTokenTeleport, showMovementPreview],
  )
  const visualPositions = useVisualPlayerPositions(
    authoritativeMotionGame,
    pack.manifest.tile_count,
    syncMotionKey,
    onMotionSettled,
    handleTokenStep,
    handleTokenTeleport,
    motionIntensity,
  )
  useEffect(() => clearPreviewTimer, [clearPreviewTimer])
  useEffect(() => {
    clearPreviewTimer()
    setTilePreview(null)
  }, [clearPreviewTimer, game?.id])
  const tokensByPosition = new Map<number, BoardToken[]>()
  const ownersById = new Map<string, BoardOwner>()
  game?.players.forEach((player, index) => {
    const currentUser = player.user_id === currentUserId
    const appearance = resolvedPlayerAppearance(
      player,
      index,
      currentUser ? currentUserTokenAppearance : null,
    )
    const presentation = {
      playerNumber: index + 1,
      displayName: player.display_name,
      color: appearance.color,
    }
    ownersById.set(player.user_id, {
      ...presentation,
      appearance,
      ariaLabel: `${t('player')} ${index + 1}: ${player.display_name}`,
    })
    if (player.bankrupt) return
    const position = visualPositions[player.user_id] ?? player.position
    const tokens = tokensByPosition.get(position) ?? []
    tokens.push({
      playerId: player.user_id,
      ...presentation,
      shape: appearance.shape,
      appearance,
      emoji:
        appearance.icon === 'emoji'
          ? appearance.emoji ?? undefined
          : undefined,
      assetPath: tokenAssetPath(appearance.icon),
      active: index === game.current_player_index,
      currentUser,
      highlighted: player.user_id === highlightedPlayerId,
    })
    tokensByPosition.set(position, tokens)
  })

  const maximumSize = compact ? 1040 : 900
  const trackTemplate = boardTrackTemplate(side)
  const boardSize = centerContent
    ? `min(${zoom * 100}%, calc(100dvh * ${zoom}))`
    : `min(${zoom * 100}%, ${maximumSize * zoom}px, calc((100dvh - 160px) * ${zoom}))`
  const fittedSize = `min(100%, calc(100dvh - 56px), ${maximumSize}px)`
  const requestedFocusableTileIndex = pack.board.tiles.findIndex(
    (tile) => tile.id === focusableTileId,
  )
  const focusableTileIndex = requestedFocusableTileIndex >= 0
    ? requestedFocusableTileIndex
    : 0
  const selectedTile =
    pack.board.tiles.find((tile) => tile.id === selectedTileId) ?? null
  const previewTile = tilePreview
    ? pack.board.tiles[tilePreview.tileIndex] ?? null
    : null
  const previewOwner = previewTile
    ? ownersById.get(game?.owners[previewTile.id] ?? '')
    : undefined
  const previewGroup = previewTile?.group
    ? pack.board.groups?.find((group) => group.id === previewTile.group)
    : undefined
  const previewGroupTiles = previewTile?.group
    ? pack.board.tiles.filter((tile) => tile.group === previewTile.group)
    : []
  const previewPlayer = tilePreview?.playerId
    ? game?.players.find((player) => player.user_id === tilePreview.playerId)
    : undefined
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

  const focusTileAt = (index: number) => {
    const tileCount = pack.board.tiles.length
    if (tileCount === 0) return
    const nextIndex = (index + tileCount) % tileCount
    setFocusableTileId(pack.board.tiles[nextIndex].id)
    tileButtonRefs.current[nextIndex]?.focus()
  }

  const handleTileKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = pack.board.tiles.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    focusTileAt(nextIndex)
  }

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

    const updates = new Map<string, TileEffect>()
    for (const event of newEvents) {
      for (const tileId of affectedTileIds(event, {
        tileIds,
        startTileId,
        tradePropertyIds,
      })) {
        updates.set(tileId, {
          sequence: event.sequence,
          action: tileEffectAction(event),
        })
      }
    }
    if (updates.size === 0) return

    setTilePulses((current) => {
      const sequences =
        current.gameId === gameId ? new Map(current.sequences) : new Map()
      for (const [tileId, effect] of updates) sequences.set(tileId, effect)
      return { gameId, sequences }
    })
  }, [actionEvents, game?.id, startTileId, tileIds, tradePropertyIds])

  return (
    <Box
      data-testid="game-board"
      data-effect-anchor="bank"
      role="group"
      aria-label={t('board')}
      aria-describedby={keyboardInstructionsId}
      aria-busy={motionPending}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: trackTemplate,
        gridTemplateRows: trackTemplate,
        width: fitAvailableHeight ? fittedSize : boardSize,
        height: undefined,
        maxWidth: fitAvailableHeight ? '100%' : undefined,
        maxHeight: fitAvailableHeight ? '100%' : undefined,
        aspectRatio: '1',
        flex: '0 0 auto',
        background: 'var(--game-theme-board)',
        border: '1px solid var(--game-theme-border)',
        borderRadius: 2.5,
        overflow: 'hidden',
        boxShadow: 'var(--game-theme-shadow)',
      }}
    >
      <Box
        component="span"
        id={keyboardInstructionsId}
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {t('boardKeyboardInstructions')}
      </Box>
      {pack.board.tiles.map((tile, index) => {
        const position = perimeterPosition(index, side)
        const name = pack.messages[tile.name_key] ?? tile.id
        const tileAccent = tile.color ?? defaultTileColor(tile.kind)
        const owner = ownersById.get(game?.owners[tile.id] ?? '')
        const buildingLevel = game?.building_levels[tile.id] ?? 0
        const mortgaged = game?.mortgaged_property_ids.includes(tile.id) ?? false
        const tileEffect =
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
            key={`${tile.id}:${tileEffect?.sequence ?? 'idle'}`}
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
            actionPulse={tileEffect !== undefined}
            actionEffect={tileEffect?.action}
            actionEffectLabel={
              tileEffect && tileEffect.action !== 'pulse'
                ? t(`visualEffects.property.${tileEffect.action}`)
                : undefined
            }
            motionIntensity={motionIntensity}
            highlighted={tile.id === highlightedTileId}
            tokens={tokensByPosition.get(index)}
            owner={owner}
            heatmap={tileHeatmap}
            viewMode={tileViewMode}
            buttonRef={(node) => {
              tileButtonRefs.current[index] = node
            }}
            tabIndex={index === focusableTileIndex ? 0 : -1}
            onFocus={() => setFocusableTileId(tile.id)}
            onKeyDown={(event) => handleTileKeyDown(event, index)}
            tooltip={
              <Stack spacing={0.85}>
                <Stack direction="row" spacing={0.85} alignItems="center">
                  <Box
                    aria-hidden
                    sx={{
                      width: 32,
                      height: 32,
                      flex: '0 0 auto',
                      display: 'grid',
                      placeItems: 'center',
                      ...tileIconBackgroundStyle(tile.icon_background, tileAccent),
                      '& svg': { fontSize: 18 },
                    }}
                  >
                    <TileVisual
                      kind={tile.kind}
                      icon={tile.icon}
                      assetPath={tile.asset_path}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: tileAccent,
                        fontSize: 9,
                        fontWeight: 900,
                        lineHeight: 1.2,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t(`tileKind.${tile.kind}`)}
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontSize: 15, fontWeight: 900, lineHeight: 1.15 }}
                    >
                      {name}
                    </Typography>
                  </Box>
                </Stack>

                <Stack spacing={0.35}>
                  {tile.price != null && (
                    <Typography variant="caption" sx={{ fontSize: 12 }}>
                      {t('purchasePrice', { amount: tile.price })}
                    </Typography>
                  )}
                  {(owner || tile.price != null) && (
                    <Stack direction="row" spacing={0.7} alignItems="center">
                      <Box
                        aria-hidden
                        sx={{
                          width: 9,
                          height: 9,
                          flex: '0 0 auto',
                          borderRadius: '50%',
                          bgcolor: owner?.color ?? 'rgba(255,255,255,.4)',
                          border: '1px solid rgba(255,255,255,.65)',
                          boxShadow: owner ? `0 0 8px ${owner.color}` : 'none',
                        }}
                      />
                      <Typography variant="caption" sx={{ fontSize: 12 }}>
                        {owner
                          ? t('ownedBy', { player: owner.displayName })
                          : t('unownedProperty')}
                      </Typography>
                    </Stack>
                  )}
                  {buildingLabel && (
                    <Typography
                      variant="caption"
                      sx={{ color: '#79e691', fontSize: 12, fontWeight: 850 }}
                    >
                      {buildingLabel}
                    </Typography>
                  )}
                  {mortgaged && (
                    <Typography
                      variant="caption"
                      sx={{ color: '#ffbd5c', fontSize: 12, fontWeight: 900 }}
                    >
                      {t('mortgaged')}
                    </Typography>
                  )}
                  {tileHeatmap && (
                    <Typography
                      variant="caption"
                      sx={{ color: '#70dcff', fontSize: 12, fontWeight: 850 }}
                    >
                      {tileHeatmap.ariaLabel}
                    </Typography>
                  )}
                </Stack>

                <Typography
                  variant="caption"
                  sx={{
                    pt: 0.7,
                    borderTop: `1px solid color-mix(in srgb, ${tileAccent} 35%, transparent)`,
                    color: 'secondary.light',
                    fontSize: 11,
                    fontWeight: 750,
                  }}
                >
                  {t('clickForTileDetails')}
                </Typography>
              </Stack>
            }
            onClick={() => {
              setFocusableTileId(tile.id)
              if (tileViewMode === 'detailed') {
                setSelectedTileId(tile.id)
                return
              }
              clearPreviewTimer()
              setTilePreview({
                tileIndex: index,
                kind: tile.group ? 'group' : 'tile',
                source: 'manual',
              })
            }}
          />
        )
      })}

      {previewTile && tilePreview && (
        <Paper
          role={tilePreview.source === 'manual' ? 'region' : 'status'}
          aria-live={
            tilePreview.source === 'movement' && tilePreview.final
              ? 'polite'
              : 'off'
          }
          aria-label={t('boardView.previewLabel')}
          elevation={12}
          sx={{
            position: 'absolute',
            zIndex: 20,
            left: '50%',
            bottom: { xs: 6, sm: 10 },
            transform: 'translateX(-50%)',
            width: { xs: 'min(88%, 310px)', sm: 'min(68%, 380px)' },
            maxHeight: '46%',
            overflowY: 'auto',
            p: { xs: 1, sm: 1.5 },
            border: `1px solid ${previewTile.color ?? 'var(--game-theme-primary)'}`,
            bgcolor: 'var(--game-theme-surface)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 18px 50px rgba(0,0,0,.58)',
          }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box
              aria-hidden
              sx={{
                width: 12,
                alignSelf: 'stretch',
                minHeight: 44,
                flexShrink: 0,
                borderRadius: 99,
                bgcolor: previewTile.color ?? 'secondary.main',
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              {previewPlayer && (
                <Typography variant="caption" color="secondary.light" fontWeight={800}>
                  {tilePreview.final
                    ? t('boardView.playerLanded', { player: previewPlayer.display_name })
                    : t('boardView.playerPassing', { player: previewPlayer.display_name })}
                </Typography>
              )}
              <Typography fontWeight={900} lineHeight={1.2}>
                {tilePreview.kind === 'group'
                  ? pack.messages[previewGroup?.name_key ?? ''] ??
                    previewTile.group ??
                    (pack.messages[previewTile.name_key] ?? previewTile.id)
                  : pack.messages[previewTile.name_key] ?? previewTile.id}
              </Typography>
              {tilePreview.kind === 'group' ? (
                <Typography variant="body2" color="text.secondary">
                  {t('boardView.groupSummary', {
                    count: previewGroupTiles.length,
                    owned: previewGroupTiles.filter((tile) => game?.owners[tile.id])
                      .length,
                  })}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {previewTile.price != null
                    ? previewOwner
                      ? t('ownedBy', { player: previewOwner.displayName })
                      : t('purchasePrice', { amount: previewTile.price })
                    : t(`tileKind.${previewTile.kind}`)}
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              aria-label={t('close')}
              onClick={() => {
                clearPreviewTimer()
                setTilePreview(null)
              }}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
          {tilePreview.source === 'manual' && (
            <Button
              fullWidth
              size="small"
              variant="outlined"
              startIcon={<InfoOutlinedIcon />}
              onClick={() => setSelectedTileId(previewTile.id)}
              sx={{ mt: 1, minHeight: 44 }}
            >
              {t('boardView.openDetails')}
            </Button>
          )}
        </Paper>
      )}

      <Stack
        data-board-center
        sx={{
          gridColumn: `2 / ${side}`,
          gridRow: `2 / ${side}`,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: 'var(--game-theme-board-center)',
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
                {authoritativeMotionGame?.last_roll && (
                  <Chip
                    label={t('lastRoll', {
                      first: authoritativeMotionGame.last_roll[0],
                      second: authoritativeMotionGame.last_roll[1],
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
                  {game.players.map((player, index) => {
                    const appearance = resolvedPlayerAppearance(
                      player,
                      index,
                      player.user_id === currentUserId
                        ? currentUserTokenAppearance
                        : null,
                    )
                    return (
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
                            bgcolor: appearance.color,
                            ml: 1,
                          },
                        }}
                      />
                    )
                  })}
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
        onTrade={onTrade}
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

function tileEffectAction(
  event: GameEvent,
): PropertyEffectAction | 'pulse' {
  switch (event.type) {
    case 'property.purchased':
      return 'purchased'
    case 'property.mortgaged':
      return 'mortgaged'
    case 'property.unmortgaged':
      return 'unmortgaged'
    case 'building.purchased':
      return 'built'
    case 'building.sold':
      return 'sold'
    case 'trade.accepted':
    case 'auction.completed':
      return 'transferred'
    default:
      return 'pulse'
  }
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
      color: boardHeatmapColor(cell.intensity),
      valueLabel: String(cell.value),
      ariaLabel: t('heatmap.visitCount', { count: cell.value }),
    }
  }

  const percentage = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format((cell.value / heatmap.total) * 100)
  return {
    intensity: cell.intensity,
    color: boardHeatmapColor(cell.intensity),
    valueLabel: `${percentage}%`,
    ariaLabel: t('heatmap.probabilityValue', { value: percentage }),
  }
}

function boardTrackTemplate(side: number): string {
  if (side <= 2) return `repeat(${side}, minmax(0, 1fr))`
  return `1.35fr repeat(${side - 2}, minmax(0, 1fr)) 1.35fr`
}
