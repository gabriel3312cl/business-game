import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import LocalPoliceRoundedIcon from '@mui/icons-material/LocalPoliceRounded'
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded'
import StyleRoundedIcon from '@mui/icons-material/StyleRounded'
import { Avatar, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameEvent,
  GameState,
  VisualEffectsIntensity,
} from '../types'
import {
  advanceVisualEffects,
  collectNewVisualEffectEvents,
  enqueueVisualEffects,
  type GameVisualEffect,
  type VisualEffectEventCursor,
  type VisualEffectPlayback,
  visualEffectsForEvent,
} from '../visualEffects'
import { playerColors } from './gameColors'

interface Props {
  game: GameState
  events: GameEvent[]
  pack: ContentPack
  intensity: VisualEffectsIntensity
  synchronized: boolean
}

export function GameVisualEffects({
  game,
  events,
  pack,
  intensity,
  synchronized,
}: Props) {
  const [playback, setPlayback] = useState<VisualEffectPlayback>({
    active: null,
    queue: [],
  })
  const active = playback.active
  const cursor = useRef<VisualEffectEventCursor>({
    gameId: game.id,
    sequence: latestSequence(game.events),
    armed: false,
  })

  useEffect(() => {
    const selection = collectNewVisualEffectEvents(
      cursor.current,
      game.id,
      events,
      latestSequence(game.events),
      synchronized,
    )
    cursor.current = selection.cursor
    if (selection.resetPlayback) {
      setPlayback({ active: null, queue: [] })
    }
    if (intensity === 'off' || selection.events.length === 0) return

    const effects = selection.events.flatMap((event) =>
      visualEffectsForEvent(event, game),
    )
    if (effects.length > 0) {
      setPlayback((current) => enqueueVisualEffects(current, effects))
    }
  }, [events, game, intensity, synchronized])

  useEffect(() => {
    if (intensity === 'off') {
      setPlayback({ active: null, queue: [] })
    }
  }, [intensity])

  useEffect(() => {
    if (!active) return
    const duration = effectDuration(active, intensity)
    const timer = window.setTimeout(() => {
      setPlayback((current) => advanceVisualEffects(current, active.id))
    }, duration)
    return () => window.clearTimeout(timer)
  }, [active, intensity])

  if (!active || intensity === 'off') return null

  return (
    <Box
      aria-live="polite"
      aria-atomic="true"
      sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1900 }}
    >
      <EffectPresentation
        key={active.id}
        effect={active}
        game={game}
        pack={pack}
        intensity={intensity}
      />
    </Box>
  )
}

interface EffectPresentationProps {
  effect: GameVisualEffect
  game: GameState
  pack: ContentPack
  intensity: VisualEffectsIntensity
}

function EffectPresentation({
  effect,
  game,
  pack,
  intensity,
}: EffectPresentationProps) {
  const { t } = useTranslation()
  const playerName = (playerId: string | null) =>
    game.players.find((player) => player.user_id === playerId)?.display_name ??
    t('bank')
  const tileName = (tileId: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === tileId)
    return tile ? pack.messages[tile.name_key] ?? tile.id : tileId
  }

  if (effect.kind === 'money') {
    return (
      <MoneyFlight
        effect={effect}
        intensity={intensity}
        label={t('visualEffects.moneyTransfer', { amount: effect.amount })}
      />
    )
  }

  if (effect.kind === 'turn') {
    const index = game.players.findIndex(
      (player) => player.user_id === effect.playerId,
    )
    return (
      <Announcement
        icon={
          <Avatar
            sx={{
              width: 38,
              height: 38,
              bgcolor: playerColors[Math.max(0, index) % playerColors.length],
              color: '#090711',
              fontWeight: 900,
            }}
          >
            {Math.max(1, index + 1)}
          </Avatar>
        }
        title={t('visualEffects.turnTitle')}
        message={t('currentTurn', { player: playerName(effect.playerId) })}
        intensity={intensity}
        color="#b8ff3d"
      />
    )
  }

  if (effect.kind === 'property') {
    return (
      <Announcement
        icon={<HomeWorkRoundedIcon />}
        title={t(`visualEffects.property.${effect.action}`)}
        message={tileName(effect.tileId)}
        intensity={intensity}
        color="#ffb45c"
        placement="bottom"
      />
    )
  }

  if (effect.kind === 'card') {
    const card = pack.board.decks
      .flatMap((deck) => deck.cards)
      .find((candidate) => candidate.id === effect.cardId)
    return (
      <Announcement
        icon={<StyleRoundedIcon />}
        title={t('visualEffects.cardDrawn')}
        message={card ? pack.messages[card.message_key] ?? effect.cardId : effect.cardId}
        intensity={intensity}
        color="#ffd166"
        card
      />
    )
  }

  if (effect.kind === 'auction') {
    return (
      <>
        {effect.action === 'won' && effect.playerId && (
          <AssetFlight
            fromSelector={`[data-board-tile-id="${effect.tileId}"]`}
            toSelector={`[data-player-effect-id="${effect.playerId}"]`}
            count={1}
            intensity={intensity}
            color="#b69cff"
          />
        )}
        <Announcement
          icon={<GavelRoundedIcon />}
          title={t(
            effect.action === 'won'
              ? 'visualEffects.auctionWon'
              : 'visualEffects.auctionBid',
            { player: playerName(effect.playerId) },
          )}
          message={`${tileName(effect.tileId)} · $${effect.amount}`}
          intensity={intensity}
          color="#b69cff"
        />
      </>
    )
  }

  if (effect.kind === 'trade') {
    const propertyCount =
      effect.offeredPropertyIds.length + effect.requestedPropertyIds.length
    return (
      <>
        <AssetFlight
          fromSelector={`[data-player-effect-id="${effect.proposerId}"]`}
          toSelector={`[data-player-effect-id="${effect.recipientId}"]`}
          count={effect.offeredPropertyIds.length}
          intensity={intensity}
          color="#b69cff"
        />
        <AssetFlight
          fromSelector={`[data-player-effect-id="${effect.recipientId}"]`}
          toSelector={`[data-player-effect-id="${effect.proposerId}"]`}
          count={effect.requestedPropertyIds.length}
          intensity={intensity}
          color="#ffb45c"
          reverseArc
        />
        <Announcement
          icon={<HandshakeRoundedIcon />}
          title={t('visualEffects.tradeAccepted')}
          message={t('visualEffects.tradeBetween', {
            proposer: playerName(effect.proposerId),
            recipient: playerName(effect.recipientId),
          })}
          intensity={intensity}
          color="#b69cff"
          chips={[
            t('visualEffects.propertyCount', { count: propertyCount }),
            ...(effect.offeredCash > 0 ? [`$${effect.offeredCash}`] : []),
            ...(effect.requestedCash > 0 ? [`$${effect.requestedCash}`] : []),
          ]}
        />
      </>
    )
  }

  return (
    <Announcement
      icon={<LocalPoliceRoundedIcon />}
      title={t(
        effect.action === 'entered'
          ? 'visualEffects.jailEntered'
          : 'visualEffects.jailReleased',
      )}
      message={playerName(effect.playerId)}
      intensity={intensity}
      color={effect.action === 'entered' ? '#ff6b74' : '#67dc8a'}
      jail={effect.action === 'entered'}
    />
  )
}

interface AnnouncementProps {
  icon: ReactNode
  title: string
  message: string
  intensity: VisualEffectsIntensity
  color: string
  placement?: 'top' | 'bottom'
  chips?: string[]
  card?: boolean
  jail?: boolean
}

function Announcement({
  icon,
  title,
  message,
  intensity,
  color,
  placement = 'top',
  chips = [],
  card = false,
  jail = false,
}: AnnouncementProps) {
  const soft = intensity === 'soft'
  return (
    <Paper
      elevation={16}
      sx={{
        position: 'absolute',
        left: '50%',
        top: placement === 'top' ? { xs: 72, sm: 32 } : 'auto',
        bottom: placement === 'bottom' ? { xs: 88, sm: 30 } : 'auto',
        width: 'min(calc(100vw - 32px), 460px)',
        px: 2,
        py: 1.4,
        border: `1px solid color-mix(in srgb, ${color} 58%, transparent)`,
        borderLeft: `6px solid ${color}`,
        bgcolor: 'rgba(18,15,30,.96)',
        backdropFilter: 'blur(16px)',
        overflow: 'hidden',
        animation: soft
          ? 'effect-soft 560ms ease both'
          : card
            ? 'effect-card 980ms cubic-bezier(.2,.75,.2,1) both'
            : 'effect-pop 900ms cubic-bezier(.2,.75,.2,1) both',
        transformOrigin: 'center',
        '@keyframes effect-soft': {
          '0%': { opacity: 0 },
          '18%, 78%': { opacity: 1 },
          '100%': { opacity: 0 },
        },
        '@keyframes effect-pop': {
          '0%': { opacity: 0, transform: 'translate(-50%, -16px) scale(.9)' },
          '18%': { opacity: 1, transform: 'translate(-50%, 0) scale(1.03)' },
          '28%, 78%': { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
          '100%': { opacity: 0, transform: 'translate(-50%, -6px) scale(.98)' },
        },
        '@keyframes effect-card': {
          '0%': { opacity: 0, transform: 'translate(-50%, 18px) rotateY(88deg)' },
          '30%, 76%': { opacity: 1, transform: 'translate(-50%, 0) rotateY(0deg)' },
          '100%': { opacity: 0, transform: 'translate(-50%, -8px) rotateY(-8deg)' },
        },
      }}
    >
      {jail && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0.28,
            background:
              'repeating-linear-gradient(90deg, transparent 0 30px, #d8dde8 30px 38px)',
            animation: soft ? undefined : 'jail-bars 420ms ease-out both',
            '@keyframes jail-bars': {
              from: { transform: 'translateY(-100%)' },
              to: { transform: 'translateY(0)' },
            },
          }}
        />
      )}
      <Stack direction="row" spacing={1.25} alignItems="center" position="relative">
        <Box
          sx={{
            width: 42,
            height: 42,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            borderRadius: card ? 1.5 : '50%',
            color,
            bgcolor: `color-mix(in srgb, ${color} 16%, transparent)`,
            '& svg': { fontSize: 25 },
          }}
        >
          {icon}
        </Box>
        <Box minWidth={0} flex={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={850}>
            {title}
          </Typography>
          <Typography fontWeight={900} noWrap={!card} lineHeight={1.25}>
            {message}
          </Typography>
          {chips.length > 0 && (
            <Stack direction="row" spacing={0.5} mt={0.7} useFlexGap flexWrap="wrap">
              {chips.map((chip) => <Chip key={chip} size="small" label={chip} />)}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  )
}

function MoneyFlight({
  effect,
  intensity,
  label,
}: {
  effect: Extract<GameVisualEffect, { kind: 'money' }>
  intensity: VisualEffectsIntensity
  label: string
}) {
  const [path, setPath] = useState(() => defaultPath())
  const startSelector = effect.fromPlayerId
    ? `[data-player-effect-id="${effect.fromPlayerId}"]`
    : '[data-effect-anchor="bank"]'
  const endSelector = effect.toPlayerId
    ? `[data-player-effect-id="${effect.toPlayerId}"]`
    : '[data-effect-anchor="bank"]'

  useLayoutEffect(() => {
    const start = centerOf(document.querySelector(startSelector))
    const end = centerOf(document.querySelector(endSelector))
    setPath({ start, end })
  }, [endSelector, startSelector])

  const dx = path.end.x - path.start.x
  const dy = path.end.y - path.start.y
  const soft = intensity === 'soft'
  return (
    <Box
      sx={{
        position: 'absolute',
        left: path.start.x,
        top: path.start.y,
        animation: soft
          ? 'money-soft 560ms ease both'
          : 'money-flight 900ms cubic-bezier(.2,.7,.2,1) both',
        '@keyframes money-soft': {
          '0%': { opacity: 0, transform: 'translate(-50%, -50%)' },
          '35%, 72%': {
            opacity: 1,
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
          },
          '100%': {
            opacity: 0,
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
          },
        },
        '@keyframes money-flight': {
          '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(.65)' },
          '14%': { opacity: 1, transform: 'translate(-50%, -70%) scale(1.08)' },
          '72%': {
            opacity: 1,
            transform: `translate(calc(-50% + ${dx}px), calc(-70% + ${dy - 22}px)) scale(1)`,
          },
          '88%': {
            opacity: 1,
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.12)`,
          },
          '100%': {
            opacity: 0,
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`,
          },
        },
      }}
    >
      <Chip
        icon={<PaymentsRoundedIcon />}
        color="success"
        label={label}
        sx={{ fontWeight: 950, boxShadow: '0 8px 24px rgba(0,0,0,.48)' }}
      />
    </Box>
  )
}

function AssetFlight({
  fromSelector,
  toSelector,
  count,
  intensity,
  color,
  reverseArc = false,
}: {
  fromSelector: string
  toSelector: string
  count: number
  intensity: VisualEffectsIntensity
  color: string
  reverseArc?: boolean
}) {
  const [path, setPath] = useState(() => defaultPath())
  useLayoutEffect(() => {
    setPath({
      start: centerOf(document.querySelector(fromSelector)),
      end: centerOf(document.querySelector(toSelector)),
    })
  }, [fromSelector, toSelector])
  if (count <= 0 || intensity === 'off') return null

  const dx = path.end.x - path.start.x
  const dy = path.end.y - path.start.y
  return (
    <>
      {Array.from({ length: Math.min(count, 4) }, (_, index) => (
        <Box
          key={index}
          aria-hidden
          sx={{
            position: 'absolute',
            left: path.start.x,
            top: path.start.y,
            width: 34,
            height: 42,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1.2,
            color: '#090711',
            bgcolor: color,
            border: '2px solid rgba(255,255,255,.82)',
            boxShadow: '0 10px 30px rgba(0,0,0,.5)',
            animation:
              intensity === 'soft'
                ? `asset-soft 560ms ease ${index * 35}ms both`
                : `asset-flight 980ms cubic-bezier(.2,.72,.2,1) ${index * 55}ms both`,
            '@keyframes asset-soft': {
              '0%': { opacity: 0, transform: 'translate(-50%, -50%)' },
              '40%, 70%': {
                opacity: 1,
                transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
              },
              '100%': { opacity: 0 },
            },
            '@keyframes asset-flight': {
              '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(.7) rotate(-12deg)' },
              '18%': { opacity: 1 },
              '58%': {
                opacity: 1,
                transform: `translate(calc(-50% + ${dx * 0.62}px), calc(-50% + ${dy * 0.62 + (reverseArc ? 46 : -46)}px)) scale(1.08) rotate(8deg)`,
              },
              '88%': {
                opacity: 1,
                transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.94) rotate(0deg)`,
              },
              '100%': {
                opacity: 0,
                transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.72)`,
              },
            },
          }}
        >
          <HomeWorkRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
      ))}
    </>
  )
}

function centerOf(element: Element | null): { x: number; y: number } {
  if (!element) return defaultPath().start
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function defaultPath() {
  return {
    start: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    end: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  }
}

function latestSequence(events: GameEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.sequence), 0)
}

function effectDuration(
  effect: GameVisualEffect,
  intensity: VisualEffectsIntensity,
): number {
  if (effect.kind === 'auction' && effect.action === 'bid') {
    return intensity === 'soft' ? 280 : 520
  }
  if (intensity === 'soft') return 560
  if (effect.kind === 'card' || effect.kind === 'trade') return 1_150
  return 950
}
