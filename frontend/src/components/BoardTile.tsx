import { Box, Typography } from '@mui/material'
import type { TileDefinition } from '../types'
import {
  defaultTileColor,
  tileIconBackgroundStyle,
  tileIconComponent,
} from './tilePresentation'

interface BoardTileProps {
  tile: TileDefinition
  name: string
  gridColumn: number
  gridRow: number
  edge: BoardEdge
  compact: boolean
  tokens?: BoardToken[]
  owner?: BoardOwner
}

export type BoardEdge = 'top' | 'right' | 'bottom' | 'left' | 'corner'

export interface BoardToken {
  playerId: string
  playerNumber: number
  displayName: string
  color: string
  active: boolean
  currentUser: boolean
}

export interface BoardOwner {
  playerNumber: number
  displayName: string
  color: string
  ariaLabel: string
}

export function BoardTile({
  tile,
  name,
  gridColumn,
  gridRow,
  edge,
  compact,
  tokens = [],
  owner,
}: BoardTileProps) {
  const Icon = tileIconComponent(tile.kind, tile.icon)
  const accent = tile.color ?? defaultTileColor(tile.kind)
  const verticalEdge = edge === 'left' || edge === 'right'
  const priceLabel = tile.price != null ? `, $${tile.price}` : ''
  const ownerLabel = owner ? `, ${owner.ariaLabel}` : ''

  return (
    <Box
      role="group"
      aria-label={`${name}${priceLabel}${ownerLabel}`}
      title={name}
      sx={{
        gridColumn,
        gridRow,
        minWidth: 0,
        minHeight: 0,
        m: { xs: '0.5px', sm: '1px' },
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: {
          xs: compact ? '3px' : '4px',
          sm: compact ? '4px' : '7px',
          md: compact ? '5px' : '9px',
        },
        background:
          'linear-gradient(155deg, rgba(55,49,83,.98), rgba(27,23,42,.98) 72%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,.045), 0 1px 4px rgba(0,0,0,.28)',
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      {owner && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            zIndex: 1,
            bgcolor: owner.color,
            boxShadow: `0 0 12px ${owner.color}`,
            ...ownerBandPosition(edge, compact),
          }}
        />
      )}

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: { xs: 0.1, sm: 0.25 },
          textAlign: 'center',
          p: {
            xs: 0.25,
            sm: compact ? 0.4 : 0.55,
            md: compact ? 0.5 : 0.7,
          },
          pb:
            edge === 'top' || edge === 'corner'
              ? { xs: 0.65, sm: compact ? 0.9 : 1.1 }
              : undefined,
          pt:
            edge === 'bottom'
              ? { xs: 0.65, sm: compact ? 0.9 : 1.1 }
              : undefined,
        }}
      >
        <Box
          aria-hidden
          sx={{
            flex: '0 0 auto',
            width: {
              xs: compact ? 12 : 14,
              sm: verticalEdge ? (compact ? 16 : 19) : compact ? 18 : 23,
              md: verticalEdge ? (compact ? 19 : 23) : compact ? 23 : 30,
            },
            height: {
              xs: compact ? 12 : 14,
              sm: verticalEdge ? (compact ? 16 : 19) : compact ? 18 : 23,
              md: verticalEdge ? (compact ? 19 : 23) : compact ? 23 : 30,
            },
            ...tileIconBackgroundStyle(tile.icon_background, accent),
            display: 'grid',
            placeItems: 'center',
            '& svg': {
              fontSize: {
                xs: compact ? 7 : 8,
                sm: compact ? 10 : 13,
                md: compact ? 13 : 17,
              },
            },
          }}
        >
          <Icon fontSize="small" />
        </Box>

        <Typography
          sx={{
            width: '100%',
            minHeight: 0,
            flex: verticalEdge ? '0 0 auto' : undefined,
            fontWeight: 850,
            fontSize: {
              xs: compact ? 5 : 6,
              sm: verticalEdge ? (compact ? 7 : 8) : compact ? 7.5 : 9,
              md: verticalEdge ? (compact ? 8.5 : 10) : compact ? 9.5 : 12,
            },
            lineHeight: 1.04,
            letterSpacing: '-0.015em',
            overflow: 'hidden',
            WebkitLineClamp: verticalEdge ? 1 : edge === 'corner' ? 3 : 2,
            WebkitBoxOrient: 'vertical',
            display: '-webkit-box',
            textShadow: '0 1px 3px rgba(0,0,0,.8)',
          }}
        >
          {name}
        </Typography>

        {tile.price != null ? (
          <Typography
            component="span"
            sx={{
              flex: '0 0 auto',
              borderRadius: 1,
              bgcolor: 'rgba(255,255,255,.14)',
              px: { xs: 0.25, sm: 0.55 },
              py: { xs: 0, sm: 0.1 },
              fontSize: {
                xs: compact ? 5 : 6,
                sm: verticalEdge ? (compact ? 6.5 : 7.5) : compact ? 7 : 8.5,
                md: verticalEdge ? (compact ? 8 : 9.5) : compact ? 8.5 : 11,
              },
              lineHeight: 1.15,
              fontWeight: 800,
              backdropFilter: 'blur(5px)',
            }}
          >
            ${tile.price}
          </Typography>
        ) : (
          <Box sx={{ height: { xs: 2, sm: 4 } }} />
        )}
      </Box>

      {tokens.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            inset: {
              xs: 2,
              sm: compact ? 3 : 4,
              md: compact ? 4 : 6,
            },
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            alignContent: 'flex-start',
            flexWrap: 'wrap',
            gap: compact ? 0.2 : 0.35,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          {tokens.map((token) => (
            <Box
              key={token.playerId}
              component="span"
              role="img"
              aria-label={token.displayName}
              title={token.displayName}
              sx={{
                width: { xs: 9, sm: compact ? 11 : 14, md: compact ? 13 : 17 },
                height: { xs: 9, sm: compact ? 11 : 14, md: compact ? 13 : 17 },
                display: 'grid',
                placeItems: 'center',
                borderRadius: '50%',
                bgcolor: token.color,
                color: '#090711',
                border: token.currentUser
                  ? '2px solid #fff'
                  : '1px solid rgba(255,255,255,.75)',
                boxShadow: token.active
                  ? '0 0 0 2px #b8ff3d, 0 2px 8px rgba(0,0,0,.55)'
                  : '0 2px 6px rgba(0,0,0,.5)',
                fontSize: { xs: 0, sm: compact ? 6 : 7, md: compact ? 7 : 9 },
                lineHeight: 1,
                fontWeight: 900,
                animation: 'token-step 90ms ease-out',
                '@keyframes token-step': {
                  from: { transform: 'translateY(5px) scale(.72)', opacity: 0.5 },
                  to: { transform: 'scale(1)', opacity: 1 },
                },
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                },
              }}
            >
              {token.playerNumber}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function ownerBandPosition(edge: BoardEdge, compact: boolean) {
  const thickness = {
    xs: 3,
    sm: compact ? 5 : 7,
    md: compact ? 6 : 9,
  }
  if (edge === 'right') return { inset: '0 auto 0 0', width: thickness }
  if (edge === 'bottom') return { inset: '0 0 auto 0', height: thickness }
  if (edge === 'left') return { inset: '0 0 0 auto', width: thickness }
  return { inset: 'auto 0 0 0', height: thickness }
}
