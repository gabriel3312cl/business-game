import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { io, type Socket } from 'socket.io-client'
import { api, authToken } from '../api'
import type {
  ContentPack,
  GameCommand,
  GameState,
  TradeOffer,
  User,
} from '../types'
import { GameActivityFeed } from './GameActivityFeed'
import { LobbySettingsPanel } from './LobbySettingsPanel'
import { PropertyManagementPanel } from './PropertyManagementPanel'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  onChange: (game: GameState) => void
  onLeave: () => void
}

interface CommandAck {
  ok: boolean
  error?: string
}

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export function GameSessionPanel({
  game,
  pack,
  user,
  onChange,
  onLeave,
}: Props) {
  const { t } = useTranslation()
  const socketRef = useRef<Socket | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')
  const [bid, setBid] = useState(1)
  const [recipientId, setRecipientId] = useState('')
  const [offeredCash, setOfferedCash] = useState(0)
  const [requestedCash, setRequestedCash] = useState(0)
  const [offeredPropertyIds, setOfferedPropertyIds] = useState<string[]>([])
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<string[]>([])
  const [confirmResignation, setConfirmResignation] = useState(false)

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

    const joinRoom = () => {
      socket.emit(
        'room_join',
        { game_id: game.id },
        (ack: CommandAck) => {
          if (ack.ok) {
            setConnectionState('connected')
            setError(null)
          } else {
            setConnectionState('disconnected')
            setError(ack.error ?? t('realtimeError'))
          }
        },
      )
    }
    const resyncVisibleGame = () => {
      if (document.visibilityState === 'visible' && socket.connected) {
        joinRoom()
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
      }
    })
    socket.on('connect_error', () => {
      setConnectionState('reconnecting')
      setError(t('realtimeError'))
    })
    socket.io.on('reconnect_attempt', () => setConnectionState('reconnecting'))
    window.addEventListener('online', joinRoom)
    document.addEventListener('visibilitychange', resyncVisibleGame)

    return () => {
      window.removeEventListener('online', joinRoom)
      document.removeEventListener('visibilitychange', resyncVisibleGame)
      socket.disconnect()
      socketRef.current = null
    }
  }, [game.id, onChange, t])

  const playerName = (playerId: string | null) =>
    game.players.find((player) => player.user_id === playerId)?.display_name ?? t('bank')

  const run = async (operation: () => Promise<GameState>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await operation())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('operationRejected'))
    } finally {
      setBusy(false)
    }
  }

  const sendCommand = async (command: GameCommand) => {
    const socket = socketRef.current
    if (!socket?.connected) {
      await run(() => api.executeCommand(game.id, command))
      return
    }
    setBusy(true)
    setError(null)
    socket.timeout(8000).emit(
      'game_command',
      { game_id: game.id, command },
      (timeoutError: Error | null, ack?: CommandAck) => {
        if (timeoutError) {
          setError(t('realtimeError'))
          setConnectionState('reconnecting')
          setBusy(false)
          return
        }
        if (!ack) {
          setError(t('commandRejected'))
          setBusy(false)
          return
        }
        if (!ack.ok) setError(ack.error ?? t('commandRejected'))
        setBusy(false)
      },
    )
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

  const currentPlayer = game.players[game.current_player_index]
  const isParticipant = game.players.some((player) => player.user_id === user.id)
  const isSpectator = game.spectators.some(
    (spectator) => spectator.user_id === user.id,
  )
  const isHost = game.host_user_id === user.id
  const isCurrentPlayer = currentPlayer?.user_id === user.id
  const otherPlayers = game.players.filter((player) => player.user_id !== user.id)
  const ownPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === user.id && (game.building_levels[propertyId] ?? 0) === 0,
    )
    .map(([propertyId]) => propertyId)
  const recipientPropertyIds = Object.entries(game.owners)
    .filter(
      ([propertyId, ownerId]) =>
        ownerId === recipientId && (game.building_levels[propertyId] ?? 0) === 0,
    )
    .map(([propertyId]) => propertyId)
  const propertyName = (propertyId: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === propertyId)
    return tile ? pack.messages[tile.name_key] : propertyId
  }
  const pendingTrades = game.trades.filter(
    (trade) =>
      trade.status === 'pending' &&
      (trade.proposer_id === user.id || trade.recipient_id === user.id),
  )
  const pendingTile = pack.board.tiles.find((tile) => tile.id === game.pending_tile_id)
  const auctionTile = pack.board.tiles.find(
    (tile) => tile.id === game.active_auction?.property_id,
  )
  const lastCard = pack.board.decks
    .flatMap((deck) => deck.cards)
    .find((card) => card.id === game.last_card_id)

  return (
    <Card sx={{ mb: 2, border: '1px solid rgba(255,255,255,.09)' }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6">{t('room')} {game.id.slice(0, 8)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {game.id}
              </Typography>
            </Box>
            <Chip
              label={t(`gameStatus.${game.status}`)}
              color={game.status === 'playing' ? 'success' : 'default'}
            />
            <Chip
              size="small"
              variant="outlined"
              label={t(`connection.${connectionState}`)}
              color={connectionColor(connectionState)}
            />
            <Button
              startIcon={<RefreshRoundedIcon />}
              disabled={busy}
              onClick={() => void run(() => api.getGame(game.id))}
            >
              {t('refresh')}
            </Button>
            {(isParticipant || isSpectator) && (
              <Button
                color={game.status === 'playing' && isParticipant ? 'error' : 'inherit'}
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
            {game.status === 'lobby' && isHost && (
              <Button
                variant="contained"
                disabled={busy || game.players.length < pack.manifest.min_players}
                onClick={() => void run(() => api.startGame(game.id))}
              >
                {t('startGame')}
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {game.players.map((player, index) => (
              <Chip
                key={player.user_id}
                color={index === game.current_player_index ? 'secondary' : 'default'}
                label={`${player.display_name} · $${player.balance}${
                  player.in_jail ? ` · ${t('detained')}` : ''
                }`}
              />
            ))}
            {game.spectators.map((spectator) => (
              <Chip
                key={spectator.user_id}
                variant="outlined"
                label={`${spectator.display_name} · ${t('spectator')}`}
              />
            ))}
            <Chip variant="outlined" label={t('houseSupply', { count: game.houses_remaining })} />
            <Chip variant="outlined" label={t('hotelSupply', { count: game.hotels_remaining })} />
            {game.settings.rules.free_parking_jackpot && (
              <Chip
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

          {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}
          {lastCard && (
            <Alert severity="info">
              {t('drawnCard', { message: pack.messages[lastCard.message_key] })}
            </Alert>
          )}

          {game.active_debt && (
            <Alert
              severity="error"
              action={
                game.active_debt.debtor_id === user.id ? (
                  <Stack direction="row">
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

          {game.status === 'playing' &&
            !game.active_auction &&
            !game.active_debt &&
            isCurrentPlayer && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {game.phase === 'waiting_for_roll' && (
                <>
                  <Button
                    variant="contained"
                    disabled={busy}
                    onClick={() => void sendCommand({ action: 'roll' })}
                  >
                    {currentPlayer.in_jail ? t('tryDoubles') : t('rollDice')}
                  </Button>
                  {currentPlayer.in_jail && (
                    <>
                      <Button
                        variant="outlined"
                        disabled={busy || currentPlayer.balance < pack.manifest.jail_fine}
                        onClick={() => void sendCommand({ action: 'pay_jail_fine' })}
                      >
                        {t('payJailFine', { amount: pack.manifest.jail_fine })}
                      </Button>
                      {currentPlayer.jail_card_ids.length > 0 && (
                        <Button
                          variant="outlined"
                          disabled={busy}
                          onClick={() => void sendCommand({ action: 'use_jail_card' })}
                        >
                          {t('useJailCard')}
                        </Button>
                      )}
                      <Chip
                        label={t('jailAttempts', {
                          count: currentPlayer.jail_failed_rolls,
                        })}
                      />
                    </>
                  )}
                </>
              )}
              {game.phase === 'buy_decision' && (
                <>
                  <Button
                    variant="contained"
                    disabled={busy}
                    onClick={() => void sendCommand({ action: 'buy_property' })}
                  >
                    {t('buyFor', { price: pendingTile?.price ?? 0 })}
                  </Button>
                  <Button
                    startIcon={<GavelRoundedIcon />}
                    disabled={busy}
                    onClick={() => void sendCommand({ action: 'decline_property' })}
                  >
                    {t('auction')}
                  </Button>
                </>
              )}
              {game.phase === 'waiting_for_end' && (
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => void sendCommand({ action: 'end_turn' })}
                >
                  {t('endTurn')}
                </Button>
              )}
            </Stack>
          )}

          {game.active_auction && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Typography fontWeight={800}>
                {t('auction')}: {auctionTile ? pack.messages[auctionTile.name_key] : game.active_auction.property_id}
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                {t('currentBid', { amount: game.active_auction.current_bid })} ·{' '}
                {playerName(game.active_auction.current_bidder_id)}
              </Typography>
              {game.active_auction.eligible_player_ids.includes(user.id) &&
                !game.active_auction.passed_player_ids.includes(user.id) && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      type="number"
                      label={t('bid')}
                      value={bid}
                      onChange={(event) => setBid(Math.max(1, Number(event.target.value)))}
                      slotProps={{ htmlInput: { min: game.active_auction.current_bid + 1 } }}
                    />
                    <Button
                      variant="contained"
                      disabled={busy || bid <= game.active_auction.current_bid}
                      onClick={() => void sendCommand({ action: 'bid', amount: bid })}
                    >
                      {t('placeBid')}
                    </Button>
                    {game.active_auction.current_bidder_id !== user.id && (
                      <Button
                        disabled={busy}
                        onClick={() => void sendCommand({ action: 'pass_auction' })}
                      >
                        {t('pass')}
                      </Button>
                    )}
                  </Stack>
                )}
            </Box>
          )}

          {isParticipant && (
            <PropertyManagementPanel
              game={game}
              pack={pack}
              user={user}
              busy={busy}
              onCommand={sendCommand}
            />
          )}

          {game.status === 'playing' &&
            isParticipant &&
            !game.active_auction &&
            !game.active_debt &&
            otherPlayers.length > 0 && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                <SwapHorizRoundedIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                {t('proposeTrade')}
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>{t('player')}</InputLabel>
                  <Select
                    label={t('player')}
                    value={recipientId}
                    onChange={(event) => {
                      setRecipientId(event.target.value)
                      setRequestedPropertyIds([])
                    }}
                  >
                    {otherPlayers.map((player) => (
                      <MenuItem key={player.user_id} value={player.user_id}>
                        {player.display_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label={t('cashOffered')}
                  value={offeredCash}
                  onChange={(event) => setOfferedCash(Math.max(0, Number(event.target.value)))}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t('cashRequested')}
                  value={requestedCash}
                  onChange={(event) => setRequestedCash(Math.max(0, Number(event.target.value)))}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>{t('propertiesOffered')}</InputLabel>
                  <Select
                    multiple
                    label={t('propertiesOffered')}
                    value={offeredPropertyIds}
                    onChange={(event) =>
                      setOfferedPropertyIds(
                        typeof event.target.value === 'string'
                          ? event.target.value.split(',')
                          : event.target.value,
                      )
                    }
                    renderValue={(selected) =>
                      t('selectedProperties', { count: selected.length })
                    }
                  >
                    {ownPropertyIds.map((propertyId) => (
                      <MenuItem key={propertyId} value={propertyId}>
                        <Checkbox checked={offeredPropertyIds.includes(propertyId)} />
                        <ListItemText primary={propertyName(propertyId)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>{t('propertiesRequested')}</InputLabel>
                  <Select
                    multiple
                    disabled={!recipientId}
                    label={t('propertiesRequested')}
                    value={requestedPropertyIds}
                    onChange={(event) =>
                      setRequestedPropertyIds(
                        typeof event.target.value === 'string'
                          ? event.target.value.split(',')
                          : event.target.value,
                      )
                    }
                    renderValue={(selected) =>
                      t('selectedProperties', { count: selected.length })
                    }
                  >
                    {recipientPropertyIds.map((propertyId) => (
                      <MenuItem key={propertyId} value={propertyId}>
                        <Checkbox checked={requestedPropertyIds.includes(propertyId)} />
                        <ListItemText primary={propertyName(propertyId)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  disabled={
                    busy ||
                    !recipientId ||
                    (offeredCash === 0 &&
                      requestedCash === 0 &&
                      offeredPropertyIds.length === 0 &&
                      requestedPropertyIds.length === 0)
                  }
                  onClick={() =>
                    void sendCommand({
                      action: 'propose_trade',
                      recipient_id: recipientId,
                      offered_cash: offeredCash,
                      requested_cash: requestedCash,
                      offered_property_ids: offeredPropertyIds,
                      requested_property_ids: requestedPropertyIds,
                    })
                  }
                >
                  {t('sendOffer')}
                </Button>
              </Stack>
            </Box>
          )}

          {pendingTrades.map((trade: TradeOffer) => (
            <Alert
              key={trade.id}
              severity={trade.recipient_id === user.id ? 'info' : 'success'}
              action={
                trade.recipient_id === user.id ? (
                  <Stack direction="row">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void sendCommand({ action: 'accept_trade', trade_id: trade.id })
                      }
                    >
                      {t('accept')}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void sendCommand({ action: 'reject_trade', trade_id: trade.id })
                      }
                    >
                      {t('reject')}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void sendCommand({ action: 'cancel_trade', trade_id: trade.id })
                    }
                  >
                    {t('cancel')}
                  </Button>
                )
              }
            >
              {t('tradeSummary', {
                proposer: playerName(trade.proposer_id),
                offered: trade.offered_cash,
                requested: trade.requested_cash,
                recipient: playerName(trade.recipient_id),
              })}{' '}
              {t('tradePropertySummary', {
                offered: trade.offered_property_ids.length,
                requested: trade.requested_property_ids.length,
              })}
            </Alert>
          ))}

          <GameActivityFeed
            events={game.events}
            players={game.players}
            spectators={game.spectators}
            pack={pack}
          />
        </Stack>
      </CardContent>
      <Dialog
        open={confirmResignation}
        onClose={() => setConfirmResignation(false)}
      >
        <DialogTitle>{t('confirmResignTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('confirmResignBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() => setConfirmResignation(false)}
          >
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
    </Card>
  )
}

function connectionColor(
  state: ConnectionState,
): 'success' | 'warning' | 'error' | 'default' {
  if (state === 'connected') return 'success'
  if (state === 'reconnecting') return 'warning'
  if (state === 'disconnected') return 'error'
  return 'default'
}
