import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material'
import {
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { VisualEffectsIntensity } from '../types'

const MIN_PANEL_HEIGHT = 144

interface Props {
  id: string
  title: string
  children: ReactNode
  height?: number
  defaultHeight?: number | string
  fillAvailableHeight?: boolean
  personalizable?: boolean
  dragging?: boolean
  dragLabel?: string
  resizeLabel?: string
  headerActions?: ReactNode
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void
  onDrop?: (event: DragEvent<HTMLDivElement>) => void
  onHeightChange?: (height: number) => void
  motionIntensity?: VisualEffectsIntensity
}

interface ResizeState {
  pointerId: number
  startY: number
  startHeight: number
  currentHeight: number
}

export function PersonalizablePanel({
  id,
  title,
  children,
  height,
  defaultHeight,
  fillAvailableHeight = false,
  personalizable = false,
  dragging = false,
  dragLabel,
  resizeLabel,
  headerActions,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onHeightChange,
  motionIntensity = 'full',
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [draftHeight, setDraftHeight] = useState<number | null>(null)

  useEffect(() => setDraftHeight(null), [height])

  const currentHeight = draftHeight ?? height ?? defaultHeight
  const fillsAvailableHeight = expanded && fillAvailableHeight && !currentHeight
  const keepsContentHeight = expanded && Boolean(currentHeight)

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const measuredHeight = panelRef.current?.getBoundingClientRect().height
    if (!measuredHeight) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: measuredHeight,
      currentHeight: measuredHeight,
    }
    setDraftHeight(measuredHeight)
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId) return
    const maximumHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 16)
    const nextHeight = Math.min(
      maximumHeight,
      Math.max(
        MIN_PANEL_HEIGHT,
        resizeState.startHeight + event.clientY - resizeState.startY,
      ),
    )
    resizeState.currentHeight = nextHeight
    setDraftHeight(nextHeight)
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStateRef.current = null
    onHeightChange?.(Math.round(resizeState.currentHeight))
  }

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const maximumHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 16)
    const measuredHeight =
      panelRef.current?.getBoundingClientRect().height ?? MIN_PANEL_HEIGHT
    const step = event.shiftKey ? 96 : 24
    const nextHeight =
      event.key === 'Home'
        ? MIN_PANEL_HEIGHT
        : event.key === 'End'
          ? maximumHeight
          : Math.min(
              maximumHeight,
              Math.max(
                MIN_PANEL_HEIGHT,
                measuredHeight + (event.key === 'ArrowDown' ? step : -step),
              ),
            )
    setDraftHeight(nextHeight)
    onHeightChange?.(Math.round(nextHeight))
  }

  return (
    <Box
      ref={panelRef}
      data-panel-id={id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      sx={{
        position: 'relative',
        minWidth: 0,
        height: keepsContentHeight ? currentHeight : 'auto',
        minHeight:
          keepsContentHeight || fillsAvailableHeight ? MIN_PANEL_HEIGHT : undefined,
        maxHeight: keepsContentHeight ? 'calc(100dvh - 16px)' : undefined,
        flex: fillsAvailableHeight ? '1 1 0' : '0 0 auto',
        opacity: dragging ? 0.55 : 1,
        transition:
          motionIntensity === 'off'
            ? 'none'
            : `opacity ${motionIntensity === 'soft' ? 90 : 140}ms ease, transform ${motionIntensity === 'soft' ? 120 : 180}ms ease`,
        transform: dragging && motionIntensity !== 'off' ? 'scale(.985)' : 'none',
      }}
    >
      <Accordion
        expanded={expanded}
        onChange={(_, nextExpanded) => setExpanded(nextExpanded)}
        disableGutters
        sx={{
          minWidth: 0,
          height: keepsContentHeight || fillsAvailableHeight ? '100%' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--game-theme-border)',
          borderRadius: '12px !important',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          '&::before': { display: 'none' },
          '& > .MuiCollapse-root': {
            transitionDuration:
              motionIntensity === 'off'
                ? '0ms !important'
                : motionIntensity === 'soft'
                  ? '140ms !important'
                  : '240ms !important',
          },
          ...(keepsContentHeight || fillsAvailableHeight
            ? {
                '& > .MuiCollapse-root': {
                  minHeight: 0,
                  overflow: 'hidden',
                },
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner, & .MuiAccordion-region': {
                  height: '100%',
                  minHeight: 0,
                },
                '& .MuiAccordionDetails-root': { height: '100%' },
              }
            : {}),
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreRoundedIcon />}
          aria-controls={`${id}-content`}
          id={`${id}-header`}
          sx={{
            minHeight: 48,
            flexShrink: 0,
            pr: headerActions ? 9 : undefined,
            '& .MuiAccordionSummary-content': {
              my: 1,
              minWidth: 0,
              alignItems: 'center',
              gap: 0.5,
            },
          }}
        >
          {personalizable && (
            <Box
              component="span"
              draggable
              aria-hidden="true"
              title={dragLabel}
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => onDragStart?.(event)}
              onDragEnd={onDragEnd}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'text.secondary',
                cursor: 'grab',
                touchAction: 'none',
                '&:active': { cursor: 'grabbing' },
              }}
            >
              <DragIndicatorRoundedIcon fontSize="small" />
            </Box>
          )}
          <Typography fontWeight={850} noWrap title={title}>
            {title}
          </Typography>
        </AccordionSummary>
        <AccordionDetails
          id={`${id}-content`}
          sx={{
            minHeight: 0,
            flex: keepsContentHeight || fillsAvailableHeight ? 1 : '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            overflowY:
              keepsContentHeight || fillsAvailableHeight ? 'auto' : 'visible',
            overscrollBehaviorY:
              keepsContentHeight || fillsAvailableHeight ? 'contain' : 'auto',
            touchAction:
              keepsContentHeight || fillsAvailableHeight ? 'pan-y' : 'auto',
            WebkitOverflowScrolling:
              keepsContentHeight || fillsAvailableHeight ? 'touch' : 'auto',
            scrollbarGutter:
              keepsContentHeight || fillsAvailableHeight ? 'stable' : 'auto',
            pt: 0.5,
            '& > *': { width: '100%' },
          }}
        >
          {children}
        </AccordionDetails>
      </Accordion>

      {headerActions && (
        <Box
          sx={{
            position: 'absolute',
            top: 5,
            right: 42,
            zIndex: 3,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {headerActions}
        </Box>
      )}

      {personalizable && expanded && (
        <Box
          role="separator"
          aria-orientation="horizontal"
          aria-label={resizeLabel}
          aria-valuemin={MIN_PANEL_HEIGHT}
          aria-valuemax={Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 16)}
          aria-valuenow={
            typeof currentHeight === 'number'
              ? Math.round(currentHeight)
              : Math.round(
                  panelRef.current?.getBoundingClientRect().height ??
                    MIN_PANEL_HEIGHT,
                )
          }
          tabIndex={0}
          title={resizeLabel}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          sx={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 0,
            height: 16,
            cursor: 'ns-resize',
            touchAction: 'none',
            zIndex: 2,
            '&:focus-visible': {
              outline: '2px solid #b8ff3d',
              outlineOffset: -2,
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              left: '35%',
              right: '35%',
              bottom: 2,
              height: 2,
              borderRadius: 99,
              bgcolor: 'text.secondary',
            },
          }}
        />
      )}
    </Box>
  )
}
