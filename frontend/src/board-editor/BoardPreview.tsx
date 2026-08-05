import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded'
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded'
import {
  Box,
  IconButton,
  Paper,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMemo, useRef, useState } from 'react'
import {
  defaultTileColor,
  tileIconBackgroundStyle,
  tileIconComponent,
} from '../components/tilePresentation'
import { textForLocale } from './defaults'
import type {
  BoardDraftDocument,
  BoardTileDraft,
} from './types'

interface BoardPreviewProps {
  document: BoardDraftDocument
  locale: string
  selectedTileId?: string
  onSelectTile?: (tileId: string) => void
  onReorderTile?: (sourceTileId: string, targetTileId: string) => void
}

interface DragState {
  x: number
  y: number
  left: number
  top: number
}

export function BoardPreview({
  document,
  locale,
  selectedTileId,
  onSelectTile,
  onReorderTile,
}: BoardPreviewProps) {
  const [zoom, setZoom] = useState(0.8)
  const [draggedTileId, setDraggedTileId] = useState<string | null>(null)
  const [dropTargetTileId, setDropTargetTileId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const baseCell = document.side_length <= 10 ? 76 : 62
  const cellSize = Math.round(baseCell * zoom)
  const canvasSize = document.side_length * cellSize
  const groups = useMemo(
    () => new Map(document.groups.map((group) => [group.id, group])),
    [document.groups],
  )

  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 0,
        height: { xs: 460, lg: '100%' },
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#0d0a16',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={850} noWrap>
            {textForLocale(
              document.information.name,
              locale,
              document.information.default_locale,
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {document.side_length} × {document.side_length} ·{' '}
            {document.tiles.length} casillas perimetrales
          </Typography>
        </Box>
        <Tooltip title="Alejar">
          <IconButton
            size="small"
            aria-label="Alejar vista previa"
            onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))}
          >
            <ZoomOutRoundedIcon />
          </IconButton>
        </Tooltip>
        <Slider
          aria-label="Zoom de la vista previa"
          min={0.35}
          max={1.35}
          step={0.05}
          value={zoom}
          onChange={(_, value) => setZoom(value as number)}
          size="small"
          sx={{ width: { xs: 72, sm: 110 } }}
        />
        <Tooltip title="Acercar">
          <IconButton
            size="small"
            aria-label="Acercar vista previa"
            onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}
          >
            <ZoomInRoundedIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box
        ref={scrollRef}
        onPointerDown={(event) => {
          const element = scrollRef.current
          if (!element || (event.target as HTMLElement).closest('button')) return
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          }
          element.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const element = scrollRef.current
          const drag = dragRef.current
          if (!element || !drag) return
          element.scrollLeft = drag.left - (event.clientX - drag.x)
          element.scrollTop = drag.top - (event.clientY - drag.y)
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          scrollRef.current?.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          cursor: 'grab',
          touchAction: 'pan-x pan-y',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Box
          sx={{
            width: canvasSize,
            height: canvasSize,
            minWidth: canvasSize,
            display: 'grid',
            gridTemplateColumns: `repeat(${document.side_length}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${document.side_length}, ${cellSize}px)`,
            borderRadius: `${Math.max(14, cellSize * 0.32)}px`,
            overflow: 'hidden',
            bgcolor: '#100d1d',
            backgroundImage:
              'radial-gradient(circle at center, rgba(157,140,255,.11), transparent 52%)',
            outline: '1px solid rgba(255,255,255,.08)',
            outlineOffset: '-1px',
            boxShadow: '0 20px 70px rgba(0,0,0,.45)',
          }}
        >
          {document.tiles.map((tile, index) => {
            const position = perimeterPosition(index, document.side_length)
            const group = tile.group_id ? groups.get(tile.group_id) : undefined
            return (
              <PreviewTile
                key={tile.id}
                tile={tile}
                index={index}
                locale={locale}
                defaultLocale={document.information.default_locale}
                cellSize={cellSize}
                selected={selectedTileId === tile.id}
                color={tile.color ?? group?.color ?? defaultTileColor(tile.kind)}
                gridColumn={position.column}
                gridRow={position.row}
                onSelect={onSelectTile}
                onReorder={onReorderTile}
                dragging={draggedTileId === tile.id}
                dropTarget={dropTargetTileId === tile.id}
                onDragStartTile={(tileId) => {
                  setDraggedTileId(tileId)
                  setDropTargetTileId(null)
                }}
                onDragEnterTile={setDropTargetTileId}
                onDragEndTile={() => {
                  setDraggedTileId(null)
                  setDropTargetTileId(null)
                }}
              />
            )
          })}
          <Stack
            sx={{
              gridColumn: `2 / ${document.side_length}`,
              gridRow: `2 / ${document.side_length}`,
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              p: 2,
              pointerEvents: 'none',
            }}
          >
            <Typography
              sx={{
                color: 'secondary.main',
                fontWeight: 950,
                fontSize: Math.max(13, cellSize * 0.26),
                letterSpacing: '-0.03em',
              }}
            >
              BUSINESS GAME
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ fontSize: Math.max(9, cellSize * 0.16) }}
            >
              Arrastra una casilla para cambiar su posición
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Paper>
  )
}

function PreviewTile({
  tile,
  index,
  locale,
  defaultLocale,
  cellSize,
  color,
  selected,
  gridColumn,
  gridRow,
  onSelect,
  onReorder,
  dragging,
  dropTarget,
  onDragStartTile,
  onDragEnterTile,
  onDragEndTile,
}: {
  tile: BoardTileDraft
  index: number
  locale: string
  defaultLocale: string
  cellSize: number
  color: string
  selected: boolean
  gridColumn: number
  gridRow: number
  onSelect?: (tileId: string) => void
  onReorder?: (sourceTileId: string, targetTileId: string) => void
  dragging: boolean
  dropTarget: boolean
  onDragStartTile: (tileId: string) => void
  onDragEnterTile: (tileId: string) => void
  onDragEndTile: () => void
}) {
  const Icon = tileIconComponent(tile.kind, tile.icon)
  const name = textForLocale(tile.name, locale, defaultLocale)
  const showName = cellSize >= 42
  return (
    <Box
      component="button"
      type="button"
      draggable={Boolean(onReorder)}
      onClick={() => onSelect?.(tile.id)}
      onDragStart={(event) => {
        if (!onReorder) return
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tile.id)
        onDragStartTile(tile.id)
      }}
      onDragEnter={() => {
        if (onReorder && !dragging) onDragEnterTile(tile.id)
      }}
      onDragOver={(event) => {
        if (!onReorder || dragging) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        if (!onReorder) return
        event.preventDefault()
        const sourceTileId = event.dataTransfer.getData('text/plain')
        if (sourceTileId && sourceTileId !== tile.id) {
          onReorder(sourceTileId, tile.id)
        }
        onDragEndTile()
      }}
      onDragEnd={onDragEndTile}
      aria-label={`Casilla ${index + 1}: ${name}`}
      aria-pressed={selected}
      sx={{
        gridColumn,
        gridRow,
        appearance: 'none',
        border:
          selected || dropTarget
            ? '2px solid #b8ff3d'
            : '1px solid rgba(255,255,255,.09)',
        m: '1px',
        borderRadius: `${Math.max(4, Math.min(9, cellSize * 0.14))}px`,
        bgcolor: selected ? 'rgba(62,55,91,.98)' : 'rgba(38,33,58,.97)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,.045), 0 1px 4px rgba(0,0,0,.28)',
        color: 'text.primary',
        p: Math.max(2, cellSize * 0.06),
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: onReorder ? 'grab' : 'pointer',
        opacity: dragging ? 0.45 : 1,
        transform: dropTarget ? 'scale(.94)' : 'none',
        transition: 'transform 100ms ease, opacity 100ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        font: 'inherit',
        '&:focus-visible': {
          outline: '3px solid #b8ff3d',
          outlineOffset: -3,
          zIndex: 2,
        },
        '&:hover': { bgcolor: 'rgba(54,47,80,.98)' },
      }}
    >
      <Box
        sx={{
          width: Math.max(12, cellSize * 0.34),
          height: Math.max(12, cellSize * 0.34),
          ...tileIconBackgroundStyle(tile.icon_background, color),
          display: 'grid',
          placeItems: 'center',
          '& svg': { fontSize: Math.max(8, cellSize * 0.2) },
        }}
      >
        <Icon />
      </Box>
      {showName && (
        <Typography
          component="span"
          sx={{
            width: '100%',
            fontWeight: 800,
            lineHeight: 1,
            fontSize: Math.max(7, cellSize * 0.13),
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {name}
        </Typography>
      )}
      {tile.price != null && cellSize >= 34 && (
        <Typography
          component="span"
          sx={{
            px: 0.4,
            borderRadius: 0.75,
            bgcolor: 'rgba(255,255,255,.13)',
            fontSize: Math.max(7, cellSize * 0.12),
            fontWeight: 800,
            lineHeight: 1.3,
          }}
        >
          ${tile.price}
        </Typography>
      )}
    </Box>
  )
}

function perimeterPosition(index: number, sideLength: number) {
  if (index < sideLength) {
    return { row: 1, column: index + 1 }
  }
  if (index < sideLength * 2 - 1) {
    return { row: index - sideLength + 2, column: sideLength }
  }
  if (index < sideLength * 3 - 2) {
    return {
      row: sideLength,
      column: sideLength - 1 - (index - (sideLength * 2 - 1)),
    }
  }
  return {
    row: sideLength - 1 - (index - (sideLength * 3 - 2)),
    column: 1,
  }
}
