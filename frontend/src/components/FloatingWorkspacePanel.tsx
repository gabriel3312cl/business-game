import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded'
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded'
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { WorkspacePanelWindowGeometry } from '../types'

interface Props {
  title: string
  children: ReactNode
  geometry: WorkspacePanelWindowGeometry
  zIndex: number
  moveLabel: string
  resizeLabel: string
  dockLeftLabel: string
  dockRightLabel: string
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
  closeLabel,
  closeDisabled = false,
  onActivate,
  onGeometryChange,
  onDockLeft,
  onDockRight,
  onClose,
}: Props) {
  const interactionRef = useRef<Interaction | null>(null)
  const [draft, setDraft] = useState(() => fitGeometryToViewport(geometry))
  const draftRef = useRef(fitGeometryToViewport(geometry))

  useEffect(() => {
    const fitted = fitGeometryToViewport(geometry)
    draftRef.current = fitted
    setDraft(fitted)
  }, [geometry])

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
        width: draft.width,
        height: draft.height,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 280,
        minHeight: 180,
        overflow: 'hidden',
        border: '1px solid rgba(184,255,61,.32)',
        boxShadow: '0 22px 70px rgba(0,0,0,.65)',
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
          minHeight: 44,
          px: 1,
          cursor: 'grab',
          touchAction: 'none',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          bgcolor: 'rgba(26,22,40,.98)',
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
        role="separator"
        aria-label={resizeLabel}
        title={resizeLabel}
        onPointerDown={(event) => startInteraction('resize', event)}
        onPointerMove={moveInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        sx={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 20,
          height: 20,
          cursor: 'nwse-resize',
          touchAction: 'none',
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
  const width = Math.min(geometry.width, Math.max(280, window.innerWidth - 64))
  const height = Math.min(geometry.height, Math.max(180, window.innerHeight))
  return {
    x: Math.min(Math.max(0, geometry.x), Math.max(0, window.innerWidth - width - 64)),
    y: Math.min(Math.max(0, geometry.y), Math.max(0, window.innerHeight - 48)),
    width,
    height,
  }
}
