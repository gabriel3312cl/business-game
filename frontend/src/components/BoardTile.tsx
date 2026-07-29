import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import BoltIcon from '@mui/icons-material/Bolt'
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber'
import FlagIcon from '@mui/icons-material/Flag'
import GavelIcon from '@mui/icons-material/Gavel'
import LocalPoliceIcon from '@mui/icons-material/LocalPolice'
import QuestionMarkIcon from '@mui/icons-material/QuestionMark'
import TrainIcon from '@mui/icons-material/Train'
import WeekendIcon from '@mui/icons-material/Weekend'
import { Box, Typography } from '@mui/material'
import type { ComponentType } from 'react'
import type { TileDefinition, TileKind } from '../types'

interface BoardTileProps {
  tile: TileDefinition
  name: string
  gridColumn: number
  gridRow: number
  compact: boolean
  tokens?: BoardToken[]
}

export interface BoardToken {
  playerNumber: number
  displayName: string
  color: string
  active: boolean
  currentUser: boolean
}

const icons: Partial<Record<TileKind, ComponentType<{ fontSize?: 'small' }>>> = {
  start: FlagIcon,
  tax: GavelIcon,
  card: QuestionMarkIcon,
  jail: LocalPoliceIcon,
  go_to_jail: LocalPoliceIcon,
  free: WeekendIcon,
  transport: TrainIcon,
  utility: BoltIcon,
  property: AccountBalanceIcon,
}

export function BoardTile({
  tile,
  name,
  gridColumn,
  gridRow,
  compact,
  tokens = [],
}: BoardTileProps) {
  const Icon = icons[tile.kind] ?? ConfirmationNumberIcon
  const accent = tile.color ?? kindColor(tile.kind)

  return (
    <Box
      sx={{
        gridColumn,
        gridRow,
        minWidth: 0,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.07)',
        background:
          'linear-gradient(145deg, rgba(47,41,74,.98), rgba(27,23,42,.98))',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        p: compact ? 0.45 : 0.7,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '0 auto 0 0',
          width: compact ? 3 : 5,
          bgcolor: accent,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 0.3,
          pl: 0.4,
        }}
      >
        <Icon fontSize="small" />
        {tile.price !== undefined && (
          <Typography
            component="span"
            sx={{
              borderRadius: 1,
              bgcolor: 'rgba(255,255,255,.11)',
              px: 0.45,
              fontSize: compact ? 8 : 10,
              fontWeight: 750,
            }}
          >
            ${tile.price}
          </Typography>
        )}
      </Box>
      {tokens.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: compact ? 20 : 25,
            left: compact ? 4 : 7,
            right: 3,
            display: 'flex',
            flexWrap: 'wrap',
            gap: compact ? 0.25 : 0.4,
            zIndex: 1,
          }}
        >
          {tokens.map((token) => (
            <Box
              key={token.playerNumber}
              component="span"
              role="img"
              aria-label={token.displayName}
              title={token.displayName}
              sx={{
                width: compact ? 13 : 17,
                height: compact ? 13 : 17,
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
                fontSize: compact ? 7 : 9,
                lineHeight: 1,
                fontWeight: 900,
                animation: 'token-arrival 180ms ease-out',
                '@keyframes token-arrival': {
                  from: { transform: 'scale(.55)', opacity: 0.35 },
                  to: { transform: 'scale(1)', opacity: 1 },
                },
              }}
            >
              {token.playerNumber}
            </Box>
          ))}
        </Box>
      )}
      <Typography
        sx={{
          mt: 'auto',
          pl: 0.4,
          fontWeight: 750,
          fontSize: compact ? 8 : 11,
          lineHeight: 1.05,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {name}
      </Typography>
    </Box>
  )
}

function kindColor(kind: TileKind): string {
  const colors: Record<TileKind, string> = {
    start: '#b8ff3d',
    property: '#9d8cff',
    tax: '#ff8b5c',
    card: '#ff6ea8',
    jail: '#d4d1de',
    go_to_jail: '#ff6b6b',
    free: '#55d6be',
    transport: '#70b7ff',
    utility: '#41d9ff',
  }
  return colors[kind]
}
