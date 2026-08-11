import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded'
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded'
import MinimizeRoundedIcon from '@mui/icons-material/MinimizeRounded'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { WorkspacePanelWindowGeometry } from '../types'

const MIN_WINDOW_WIDTH = 280
const MIN_WINDOW_HEIGHT = 180
const MINIMIZED_WINDOW_WIDTH = 320
const WINDOW_HEADER_HEIGHT = 44
const WORKSPACE_RAIL_WIDTH = 64
const VISIBLE_HEADER_HEIGHT = 48
const KEYBOARD_RESIZE_STEP = 16
const KEYBOARD_RESIZE_LARGE_STEP = 64

interface Props {
  title: string
  children: ReactNode
  geometry: WorkspacePanelWindowGeometry
  zIndex: number
  moveLabel: string
  resizeLabel: string
  dockLeftLabel: string
  dockRightLabel: string
  minimizeLabel: string
  restoreLabel: string
  closeLabel: string
  closeDisabled?: boolean
  onActivate: () => void
  onGeometryChange: (geometry: WorkspacePanelWindowGeometry) => void
  onDockLeft: () => void
  onDockRight: () => void
  onClose: () => void
}

interface Interaction {
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  startGeometry: WorkspacePanelWindowGeometry
}

export function FloatingWorkspacePanel({
  title,
  children,
  geometry,
  zIndex,
  moveLabel,
  resizeLabel,
  dockLeftLabel,
  dockRightLabel,
  minimizeLabel,
  restoreLabel,
  closeLabel,
  closeDisabled = false,
  onActivate,
  onGeometryChange,
  onDockLeft,
  onDockRight,
  onClose,
}: Props) {
  const interactionRef = useRef<Interaction | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [draft, setDraft] = useState(() => fitGeometryToViewport(geometry))
  const draftRef = useRef(fitGeometryToViewport(geometry))

  useEffect(() => {
    const fitted = fitGeometryToViewport(geometry)
    draftRef.current = fitted
    setDraft(fitted)
  }, [geometry])

  useEffect(() => {
    const fitDraftToViewport = () => {
      const fitted = fitGeometryToViewport(draftRef.current)
      draftRef.current = fitted
      setDraft((current) =>
        sameGeometry(current, fitted) ? current : fitted,
      )
    }

    window.addEventListener('resize', fitDraftToViewport)
    window.addEventListener('orientationchange', fitDraftToViewport)
    return () => {
      window.removeEventListener('resize', fitDraftToViewport)
      window.removeEventListener('orientationchange', fitDraftToViewport)
    }
  }, [])

  const updateDraft = (next: WorkspacePanelWindowGeometry) => {
    draftRef.current = next
    setDraft(next)
  }

  const startInteraction = (
    mode: Interaction['mode'],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startGeometry: draft,
    }
  }

  const moveInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const deltaX = event.clientX - interaction.startX
    const deltaY = event.clientY - interaction.startY
    if (interaction.mode === 'move') {
      const maximumX = Math.max(0, window.innerWidth - draft.width - 64)
      const maximumY = Math.max(0, window.innerHeight - 48)
      updateDraft({
        ...draftRef.current,
        x: Math.min(maximumX, Math.max(0, interaction.startGeometry.x + deltaX)),
        y: Math.min(maximumY, Math.max(0, interaction.startGeometry.y + deltaY)),
      })
      return
    }
    const maximumWidth = Math.max(280, window.innerWidth - draft.x - 64)
    const maximumHeight = Math.max(180, window.innerHeight - draft.y)
    updateDraft({
      ...draftRef.current,
      width: Math.min(
        maximumWidth,
        Math.max(280, interaction.startGeometry.width + deltaX),
      ),
      height: Math.min(
        maximumHeight,
        Math.max(180, interaction.startGeometry.height + deltaY),
      ),
    })
  }

  const finishInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    interactionRef.current = null
    const next = draftRef.current
    onGeometryChange({
      x: Math.round(next.x),
      y: Math.round(next.y),
      width: Math.round(next.width),
      height: Math.round(next.height),
    })
  }

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey
      ? KEYBOARD_RESIZE_LARGE_STEP
      : KEYBOARD_RESIZE_STEP
    const current = draftRef.current
    let width = current.width
    let height = current.height

    if (event.key === 'ArrowLeft') width -= step
    else if (event.key === 'ArrowRight') width += step
    else if (event.key === 'ArrowUp') height -= step
    else if (event.key === 'ArrowDown') height += step
    else return

    event.preventDefault()
    event.stopPropagation()
    onActivate()

    const maximumWidth = Math.max(
      MIN_WINDOW_WIDTH,
      window.innerWidth - current.x - WORKSPACE_RAIL_WIDTH,
    )
    const maximumHeight = Math.max(
      MIN_WINDOW_HEIGHT,
      window.innerHeight - current.y,
    )
    const next = fitGeometryToViewport({
      ...current,
      width: Math.min(maximumWidth, Math.max(MIN_WINDOW_WIDTH, width)),
      height: Math.min(maximumHeight, Math.max(MIN_WINDOW_HEIGHT, height)),
    })
    if (sameGeometry(current, next)) return

    updateDraft(next)
    onGeometryChange(roundGeometry(next))
  }

  const maximumKeyboardWidth = Math.max(
    MIN_WINDOW_WIDTH,
    window.innerWidth - draft.x - WORKSPACE_RAIL_WIDTH,
  )

  return (
    <Paper
      role="dialog"
      aria-label={title}
      elevation={18}
      onPointerDown={onActivate}
      sx={{
        position: 'absolute',
        left: draft.x,
        top: draft.y,
        width: minimized
          ? Math.min(draft.width, MINIMIZED_WINDOW_WIDTH)
          : draft.width,
        height: minimized ? WINDOW_HEADER_HEIGHT : draft.height,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        minWidth: MIN_WINDOW_WIDTH,
        minHeight: minimized ? WINDOW_HEADER_HEIGHT : MIN_WINDOW_HEIGHT,
        overflow: 'hidden',
        border: '1px solid var(--game-theme-border)',
        boxShadow: 'var(--game-theme-shadow)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        onPointerDown={(event) => startInteraction('move', event)}
        onPointerMove={moveInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label={moveLabel}
        sx={{
          minHeight: WINDOW_HEADER_HEIGHT,
          px: 1,
          cursor: 'grab',
          touchAction: 'none',
          borderBottom: '1px solid var(--game-theme-border)',
          bgcolor: 'var(--game-theme-elevated)',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorRoundedIcon fontSize="small" color="disabled" />
        <Typography fontWeight={850} noWrap sx={{ flex: 1 }}>
          {title}
        </Typography>
        <Tooltip title={dockLeftLabel}>
          <IconButton
            size="small"
            aria-label={dockLeftLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onDockLeft}
          >
            <KeyboardDoubleArrowLeftRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={dockRightLabel}>
          <IconButton
            size="small"
            aria-label={dockRightLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onDockRight}
          >
            <KeyboardDoubleArrowRightRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={minimized ? restoreLabel : minimizeLabel}>
          <IconButton
            size="small"
            aria-label={minimized ? restoreLabel : minimizeLabel}
            aria-expanded={!minimized}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onActivate()
              setMinimized((current) => !current)
            }}
          >
            {minimized ? (
              <OpenInFullRoundedIcon fontSize="small" />
            ) : (
              <MinimizeRoundedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={closeLabel}>
          <IconButton
            size="small"
            aria-label={closeLabel}
            disabled={closeDisabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box
        hidden={minimized}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: 1.25,
          scrollbarGutter: 'stable',
          '& > *': { width: '100%' },
        }}
      >
        {children}
      </Box>
      <Box
        hidden={minimized}
        role="separator"
        aria-label={resizeLabel}
        aria-orientation="horizontal"
        aria-valuemin={MIN_WINDOW_WIDTH}
        aria-valuemax={Math.round(maximumKeyboardWidth)}
        aria-valuenow={Math.round(draft.width)}
        aria-valuetext={`${Math.round(draft.width)} × ${Math.round(draft.height)} px`}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
        title={resizeLabel}
        tabIndex={0}
        onPointerDown={(event) => startInteraction('resize', event)}
        onPointerMove={moveInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        onKeyDown={resizeWithKeyboard}
        sx={{
          position: 'absolute',
          display: minimized ? 'none' : 'block',
          right: 0,
          bottom: 0,
          width: 32,
          height: 32,
          cursor: 'nwse-resize',
          touchAction: 'none',
          borderRadius: '8px 0 0 0',
          '&:focus-visible': {
            outline: '3px solid',
            outlineColor: 'primary.main',
            outlineOffset: -3,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 8,
            height: 8,
            borderRight: '2px solid rgba(255,255,255,.45)',
            borderBottom: '2px solid rgba(255,255,255,.45)',
          },
        }}
      />
    </Paper>
  )
}

function fitGeometryToViewport(
  geometry: WorkspacePanelWindowGeometry,
): WorkspacePanelWindowGeometry {
  const width = Math.min(
    geometry.width,
    Math.max(MIN_WINDOW_WIDTH, window.innerWidth - WORKSPACE_RAIL_WIDTH),
  )
  const height = Math.min(
    geometry.height,
    Math.max(MIN_WINDOW_HEIGHT, window.innerHeight),
  )
  return {
    x: Math.min(
      Math.max(0, geometry.x),
      Math.max(0, window.innerWidth - width - WORKSPACE_RAIL_WIDTH),
    ),
    y: Math.min(
      Math.max(0, geometry.y),
      Math.max(0, window.innerHeight - VISIBLE_HEADER_HEIGHT),
    ),
    width,
    height,
  }
}

function roundGeometry(
  geometry: WorkspacePanelWindowGeometry,
): WorkspacePanelWindowGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.round(geometry.width),
    height: Math.round(geometry.height),
  }
}

function sameGeometry(
  first: WorkspacePanelWindowGeometry,
  second: WorkspacePanelWindowGeometry,
): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  )
}
