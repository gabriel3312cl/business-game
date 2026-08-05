import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { io, type Socket } from 'socket.io-client'
import { api, ApiError, authToken } from '../api'
import type {
  ContentPack,
  GameCommand,
  GameEvent,
  GameState,
  User,
} from '../types'
import { GameActionCenter } from './GameActionCenter'
import { GameActivityFeed } from './GameActivityFeed'
import { GameAuctionDialog } from './GameAuctionDialog'
import { GameBoard } from './GameBoard'
import {
  latestMotionSequence,
  type MotionSettlement,
} from './gameMotion'
import { GamePlayersPanel } from './GamePlayersPanel'
import { GameTradePanel } from './GameTradePanel'
import { LobbySettingsPanel } from './LobbySettingsPanel'
import { PropertyManagementPanel } from './PropertyManagementPanel'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  zoom: number
  onChange: (game: GameState) => void
  onLeave: () => void
  onLogout: () => void
  onSessionExpired: () => void
}

interface CommandAck {
  ok: boolean
  code?: 'AUTH_EXPIRED' | 'DOMAIN_ERROR'
  error?: string
}

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

type MobilePanel = 'room' | 'players' | 'manage' | 'activity' | null

export function GameSessionPanel({
  game,
  pack,
  user,
  zoom,
  onChange,
  onLeave,
  onLogout,
  onSessionExpired,
}: Props) {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const isTablet = useMediaQuery(theme.breakpoints.up('md'))
  const isWide = useMediaQuery(theme.breakpoints.up('xl'))
  const socketRef = useRef<Socket | null>(null)
  const refreshingSocketRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const [confirmResignation, setConfirmResignation] = useState(false)
  const [sideTab, setSideTab] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [motionSyncKey, setMotionSyncKey] = useState(0)
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  )
  const [motionSettlement, setMotionSettlement] = useState<MotionSettlement>(
    () => ({
      gameId: game.id,
      sequence: latestMotionSequence(game),
      syncMotionKey: 0,
    }),
  )
  const motionPending =
    !prefersReducedMotion &&
    motionSettlement.gameId === game.id &&
    Object.is(motionSettlement.syncMotionKey, motionSyncKey) &&
    latestMotionSequence(game) > motionSettlement.sequence
  const visibleEvents = motionPending
    ? game.events.filter(
        (event) => event.sequence <= motionSettlement.sequence,
      )
    : game.events
  const handleMotionSettled = useCallback((settlement: MotionSettlement) => {
    setMotionSettlement((current) =>
      current.gameId === settlement.gameId &&
      current.sequence === settlement.sequence &&
      Object.is(current.syncMotionKey, settlement.syncMotionKey)
        ? current
        : settlement,
    )
  }, [])

  useEffect(() => {
    if ((!isTablet || isWide) && sideTab > 1) setSideTab(0)
  }, [isTablet, isWide, sideTab])

  useEffect(() => {
    const token = authToken.get()
    if (!token) {
      setConnectionState('disconnected')
      return
    }
    setConnectionState('connecting')
    const socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = socket

    async function renewSocketSession() {
      if (refreshingSocketRef.current) return
      refreshingSocketRef.current = true
      try {
        const refreshed = await api.refreshSession()
        socket.auth = { token: refreshed.access_token }
        if (socket.connected) {
          joinRoom()
        } else {
          socket.connect()
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          setConnectionState('disconnected')
          onSessionExpired()
        } else {
          setConnectionState('reconnecting')
        }
      } finally {
        refreshingSocketRef.current = false
      }
    }

    function joinRoom() {
      socket.timeout(8000).emit(
        'room_join',
        { game_id: game.id },
        (timeoutError: Error | null, ack?: CommandAck) => {
          if (timeoutError) {
            setConnectionState('reconnecting')
            setError(t('realtimeError'))
            return
          }
          if (!ack) {
            setConnectionState('reconnecting')
            return
          }
          if (ack.ok) {
            setConnectionState('connected')
            setError(null)
            setMotionSyncKey((value) => value + 1)
          } else {
            setConnectionState('disconnected')
            setError(ack.error ?? t('realtimeError'))
            if (isAuthenticationError(ack.code, ack.error)) {
              void renewSocketSession()
            }
          }
        },
      )
    }

    function resyncVisibleGame() {
      if (document.visibilityState !== 'visible') return
      if (socket.connected) {
        joinRoom()
      } else if (navigator.onLine) {
        socket.connect()
      }
    }

    function reconnectOnline() {
      if (socket.connected) {
        joinRoom()
      } else {
        socket.connect()
      }
    }

    socket.on('connect', joinRoom)
    socket.on('game_state', (nextGame: GameState) => {
      setConnectionState('connected')
      onChange(nextGame)
    })
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        setConnectionState('reconnecting')
        if (reason === 'io server disconnect') socket.connect()
      }
    })
    socket.on('connect_error', (connectionError) => {
      setConnectionState('reconnecting')
      setError(t('realtimeError'))
      if (
        navigator.onLine &&
        isAuthenticationError(
          socketErrorCode(connectionError),
          connectionError.message,
        )
      ) {
        void renewSocketSession()
      }
    })
    socket.io.on('reconnect_attempt', () => setConnectionState('reconnecting'))
    window.addEventListener('online', reconnectOnline)
    document.addEventListener('visibilitychange', resyncVisibleGame)

    return () => {
      window.removeEventListener('online', reconnectOnline)
      document.removeEventListener('visibilitychange', resyncVisibleGame)
      socket.disconnect()
      socketRef.current = null
      refreshingSocketRef.current = false
    }
  }, [game.id, onChange, onSessionExpired, t])

  const playerName = (playerId: string | null) =>
    game.players.find((player) => player.user_id === playerId)?.display_name ??
    t('bank')

  const run = async (
    operation: () => Promise<GameState>,
    snapToSnapshot = false,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const nextGame = await operation()
      onChange(nextGame)
      if (snapToSnapshot) {
        setMotionSyncKey((value) => value + 1)
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired()
        return
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('operationRejected'),
      )
    } finally {
      setBusy(false)
    }
  }

  const sendCommand = async (command: GameCommand): Promise<boolean> => {
    const socket = socketRef.current
    if (!socket?.connected) {
      setBusy(true)
      setError(null)
      try {
        onChange(await api.executeCommand(game.id, command))
        return true
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired()
        } else {
          setError(
            requestError instanceof Error
              ? requestError.message
              : t('operationRejected'),
          )
        }
        return false
      } finally {
        setBusy(false)
      }
    }
    setBusy(true)
    setError(null)
    return new Promise<boolean>((resolve) => {
      socket.timeout(8000).emit(
        'game_command',
        { game_id: game.id, command },
        (timeoutError: Error | null, ack?: CommandAck) => {
          if (timeoutError) {
            setError(t('realtimeError'))
            setConnectionState('reconnecting')
            setBusy(false)
            resolve(false)
            return
          }
          if (!ack) {
            setError(t('commandRejected'))
            setBusy(false)
            resolve(false)
            return
          }
          if (!ack.ok) {
            setError(ack.error ?? t('commandRejected'))
            if (isAuthenticationError(ack.code, ack.error)) {
              socket.disconnect()
              socket.connect()
            }
            setBusy(false)
            resolve(false)
            return
          }
          setBusy(false)
          resolve(true)
        },
      )
    })
  }

  const leaveGame = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.leaveGame(game.id)
      onLeave()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('operationRejected'),
      )
    } finally {
      setBusy(false)
      setConfirmResignation(false)
    }
  }

  const isParticipant = game.players.some(
    (player) => player.user_id === user.id,
  )
  const isSpectator = game.spectators.some(
    (spectator) => spectator.user_id === user.id,
  )
  const isHost = game.host_user_id === user.id
  const hasProperties = Object.values(game.owners).includes(user.id)
  const currentCardId = currentTurnCardId(game.events)
  const lastCard = pack.board.decks
    .flatMap((deck) => deck.cards)
    .find((card) => card.id === currentCardId)

  const roomContent = (
    <Card
      variant="outlined"
      sx={{ borderColor: 'rgba(255,255,255,.08)', minWidth: 0 }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography fontWeight={900} sx={{ letterSpacing: '-0.03em' }}>
              BUSINESS<span style={{ color: '#b8ff3d' }}>GAME</span>
            </Typography>
            <FormControl size="small">
              <Select
                value={i18n.language}
                onChange={(event) =>
                  void i18n.changeLanguage(event.target.value)
                }
                aria-label="Language"
                sx={{ minWidth: 68 }}
              >
                <MenuItem value="es">ES</MenuItem>
                <MenuItem value="en">EN</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,.045)',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} minWidth={0}>
              <AccountCircleRoundedIcon color="secondary" />
              <Typography
                variant="body2"
                fontWeight={750}
                noWrap
                title={user.display_name}
              >
                {user.display_name}
              </Typography>
            </Stack>
            <Button
              size="small"
              color="inherit"
              startIcon={<LogoutRoundedIcon />}
              onClick={onLogout}
            >
              {t('logout')}
            </Button>
          </Stack>

          <Box>
            <Typography variant="overline" color="secondary.light">
              {t('room')}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography
                fontWeight={850}
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {game.id.slice(0, 8)}
              </Typography>
              <IconButton
                size="small"
                aria-label={t('copyRoomId')}
                onClick={() => void navigator.clipboard.writeText(game.id)}
              >
                <ContentCopyRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              label={t(`gameStatus.${game.status}`)}
              color={game.status === 'playing' ? 'success' : 'default'}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t(`connection.${connectionState}`)}
              color={connectionColor(connectionState)}
            />
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            <Button
              size="small"
              startIcon={<RefreshRoundedIcon />}
              disabled={busy}
              onClick={() => void run(() => api.getGame(game.id), true)}
            >
              {t('refresh')}
            </Button>
            {(isParticipant || isSpectator) && (
              <Button
                size="small"
                color={
                  game.status === 'playing' && isParticipant ? 'error' : 'inherit'
                }
                startIcon={<LogoutRoundedIcon />}
                disabled={busy}
                onClick={() => {
                  if (game.status === 'playing' && isParticipant) {
                    setConfirmResignation(true)
                  } else {
                    void leaveGame()
                  }
                }}
              >
                {game.status === 'playing' && isParticipant
                  ? t('resignGame')
                  : t('leaveRoom')}
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={t('houseSupply', { count: game.houses_remaining })}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t('hotelSupply', { count: game.hotels_remaining })}
            />
            {game.settings.rules.free_parking_jackpot && (
              <Chip
                size="small"
                color={game.bank_pot > 0 ? 'secondary' : 'default'}
                variant="outlined"
                label={t('bankPot', { amount: game.bank_pot })}
              />
            )}
          </Stack>

          {game.status === 'lobby' && (
            <LobbySettingsPanel
              game={game}
              pack={pack}
              isHost={isHost}
              busy={busy}
              onUpdate={(data) =>
                void run(() => api.updateGameSettings(game.id, data))
              }
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  )

  const activityContent = (
    <Card
      variant="outlined"
      sx={{ borderColor: 'rgba(255,255,255,.08)', minWidth: 0 }}
    >
      <CardContent>
        <GameActivityFeed
          events={visibleEvents}
          players={game.players}
          spectators={game.spectators}
          pack={pack}
        />
      </CardContent>
    </Card>
  )

  const playersContent = (
    <Card
      variant="outlined"
      sx={{ borderColor: 'rgba(255,255,255,.08)', minWidth: 0 }}
    >
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
        <GamePlayersPanel game={game} user={user} />
      </CardContent>
    </Card>
  )

  const propertiesContent = hasProperties ? (
    <PropertyManagementPanel
      embedded
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      onCommand={sendCommand}
    />
  ) : (
    <Typography color="text.secondary" variant="body2">
      {t('noProperties')}
    </Typography>
  )

  const tradesContent = (
    <GameTradePanel
      game={game}
      pack={pack}
      user={user}
      busy={busy}
      error={error}
      onCommand={sendCommand}
    />
  )

  const tabContent =
    sideTab === 0
      ? propertiesContent
      : sideTab === 1
        ? tradesContent
        : sideTab === 2
          ? roomContent
          : activityContent

  const managementContent = (
    <Card
      variant="outlined"
      sx={{
        borderColor: 'rgba(255,255,255,.08)',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Tabs
        value={sideTab}
        onChange={(_, value: number) => setSideTab(value)}
        variant="scrollable"
        scrollButtons={false}
        aria-label={t('gamePanels')}
      >
        <Tab
          value={0}
          id="game-panel-tab-0"
          aria-controls="game-panel-0"
          label={t('properties')}
        />
        <Tab
          value={1}
          id="game-panel-tab-1"
          aria-controls="game-panel-1"
          label={t('trades')}
        />
        {isTablet && !isWide && (
          <Tab
            value={2}
            id="game-panel-tab-2"
            aria-controls="game-panel-2"
            label={t('room')}
          />
        )}
        {isTablet && !isWide && (
          <Tab
            value={3}
            id="game-panel-tab-3"
            aria-controls="game-panel-3"
            label={t('activity.title')}
          />
        )}
      </Tabs>
      <CardContent
        role="tabpanel"
        id={`game-panel-${sideTab}`}
        aria-labelledby={`game-panel-tab-${sideTab}`}
      >
        {tabContent}
      </CardContent>
    </Card>
  )

  const criticalAlerts = (
    <>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!motionPending && lastCard && (
        <Alert severity="info">
          {t('drawnCard', { message: pack.messages[lastCard.message_key] })}
        </Alert>
      )}
      {!motionPending && game.active_debt && (
        <Alert
          severity="error"
          sx={{
            flexDirection: { xs: 'column', sm: 'row' },
            '& .MuiAlert-action': {
              ml: { xs: 0, sm: 2 },
              mt: { xs: 1, sm: 0 },
              alignSelf: { xs: 'stretch', sm: 'center' },
            },
          }}
          action={
            game.active_debt.debtor_id === user.id ? (
              <Stack direction="row" useFlexGap flexWrap="wrap">
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() => void sendCommand({ action: 'pay_debt' })}
                >
                  {t('payDebt')}
                </Button>
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() =>
                    void sendCommand({ action: 'declare_bankruptcy' })
                  }
                >
                  {t('declareBankruptcy')}
                </Button>
              </Stack>
            ) : undefined
          }
        >
          {t('debtSummary', {
            debtor: playerName(game.active_debt.debtor_id),
            amount: game.active_debt.amount,
            creditor: playerName(game.active_debt.creditor_id),
          })}
        </Alert>
      )}
    </>
  )

  return (
    <Box
      data-testid="game-workspace"
      sx={{
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1fr) clamp(240px, 25vw, 280px)',
            lg: 'minmax(0, 1fr) clamp(280px, 25vw, 330px)',
            xl: 'clamp(230px, 16vw, 280px) minmax(0, 1fr) clamp(310px, 22vw, 360px)',
          },
          gridTemplateAreas: {
            xs: '"board"',
            md: '"board right"',
            xl: '"left board right"',
          },
          gap: 0,
          alignItems: 'stretch',
        }}
      >
        {isWide && (
          <Stack
            gridArea="left"
            spacing={1.25}
            sx={{
              height: '100dvh',
              overflow: 'auto',
              p: 1,
              borderRight: '1px solid rgba(255,255,255,.08)',
            }}
          >
            {roomContent}
            {activityContent}
          </Stack>
        )}

        <Stack
          gridArea="board"
          spacing={0}
          sx={{
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Stack
            spacing={0.75}
            sx={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(92%, 760px)',
              zIndex: 8,
              pointerEvents: 'none',
              '& .MuiAlert-root': { pointerEvents: 'auto' },
            }}
          >
            {criticalAlerts}
          </Stack>
          <Box
            sx={{
              width: '100%',
              height: '100%',
              minWidth: 0,
              overflow: 'auto',
              display: 'flex',
              justifyContent: zoom > 1 ? 'flex-start' : 'center',
              alignItems: 'flex-start',
            }}
          >
            <GameBoard
              pack={pack}
              zoom={zoom}
              game={game}
              currentUserId={user.id}
              syncMotionKey={motionSyncKey}
              onMotionSettled={handleMotionSettled}
              motionPending={motionPending}
              centerContent={
                <GameActionCenter
                  game={game}
                  pack={pack}
                  user={user}
                  busy={busy}
                  motionPending={motionPending}
                  visibleEvents={visibleEvents}
                  isHost={isHost}
                  onCommand={sendCommand}
                  onStart={() => void run(() => api.startGame(game.id))}
                />
              }
            />
          </Box>
        </Stack>

        {isTablet && (
          <Stack
            gridArea="right"
            spacing={1.25}
            sx={{
              height: '100dvh',
              overflow: 'auto',
              p: 1,
              borderLeft: '1px solid rgba(255,255,255,.08)',
            }}
          >
            {playersContent}
            {managementContent}
          </Stack>
        )}
      </Box>

      {!isTablet && (
        <>
          <BottomNavigation
            showLabels
            value={mobilePanel}
            sx={{
              position: 'fixed',
              left: 8,
              right: 8,
              bottom: 'max(8px, env(safe-area-inset-bottom))',
              zIndex: 1200,
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 12px 36px rgba(0,0,0,.5)',
            }}
          >
            <BottomNavigationAction
              value="room"
              label={t('room')}
              icon={<MenuRoundedIcon />}
              onClick={() => setMobilePanel('room')}
            />
            <BottomNavigationAction
              value="players"
              label={t('playersPanel')}
              icon={<GroupsRoundedIcon />}
              onClick={() => setMobilePanel('players')}
            />
            <BottomNavigationAction
              value="manage"
              label={t('manage')}
              icon={<ApartmentRoundedIcon />}
              onClick={() => setMobilePanel('manage')}
            />
            <BottomNavigationAction
              value="activity"
              label={t('activity.short')}
              icon={<HistoryRoundedIcon />}
              onClick={() => setMobilePanel('activity')}
            />
          </BottomNavigation>
          <Drawer
            anchor="bottom"
            open={mobilePanel !== null}
            onClose={() => setMobilePanel(null)}
            slotProps={{
              paper: {
                sx: {
                  maxHeight: 'min(78dvh, 720px)',
                  borderRadius: '20px 20px 0 0',
                  p: 1.5,
                  pb: 'max(16px, env(safe-area-inset-bottom))',
                },
              },
            }}
          >
            <Stack
              direction="row"
              justifyContent="flex-end"
              sx={{ position: 'sticky', top: 0, zIndex: 1 }}
            >
              <IconButton
                aria-label={t('close')}
                onClick={() => setMobilePanel(null)}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
            <Box sx={{ overflow: 'auto' }}>
              {mobilePanel === 'room' && roomContent}
              {mobilePanel === 'players' && playersContent}
              {mobilePanel === 'manage' && managementContent}
              {mobilePanel === 'activity' && activityContent}
            </Box>
          </Drawer>
        </>
      )}

      {!motionPending && (
        <GameAuctionDialog
          game={game}
          pack={pack}
          user={user}
          busy={busy}
          error={error}
          onCommand={sendCommand}
        />
      )}

      <Dialog
        open={confirmResignation}
        onClose={() => setConfirmResignation(false)}
      >
        <DialogTitle>{t('confirmResignTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('confirmResignBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmResignation(false)}>
            {t('cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void leaveGame()}
          >
            {t('confirmResign')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function isAuthenticationError(code?: string, error?: string): boolean {
  return code === 'AUTH_EXPIRED' || error === 'authentication required'
}

function currentTurnCardId(events: GameEvent[]): string | null {
  let latestBoundarySequence = 0
  let latestCardEvent: GameEvent | null = null

  for (const event of events) {
    if (
      event.type === 'turn.started' ||
      event.type === 'turn.extra_roll' ||
      event.type === 'game.finished'
    ) {
      latestBoundarySequence = Math.max(latestBoundarySequence, event.sequence)
    } else if (
      event.type === 'card.drawn' &&
      (latestCardEvent === null ||
        event.sequence > latestCardEvent.sequence)
    ) {
      latestCardEvent = event
    }
  }

  if (
    latestCardEvent === null ||
    latestCardEvent.sequence <= latestBoundarySequence
  ) {
    return null
  }
  const cardId = latestCardEvent.data.card_id
  return typeof cardId === 'string' ? cardId : null
}

function socketErrorCode(error: Error): string | undefined {
  const data = (error as Error & { data?: { code?: unknown } }).data
  return typeof data?.code === 'string' ? data.code : undefined
}

function connectionColor(
  state: ConnectionState,
): 'success' | 'warning' | 'error' | 'default' {
  if (state === 'connected') return 'success'
  if (state === 'reconnecting') return 'warning'
  if (state === 'disconnected') return 'error'
  return 'default'
}
