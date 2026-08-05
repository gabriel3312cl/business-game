import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameState,
  TradeOffer,
  User,
} from '../types'
import { playerColors } from './gameColors'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  error: string | null
  onCommand: (command: GameCommand) => Promise<boolean>
}

export function GameTradePanel({
  game,
  pack,
  user,
  busy,
  error,
  onCommand,
}: Props) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [open, setOpen] = useState(false)
  const [recipientId, setRecipientId] = useState('')
  const [offeredCash, setOfferedCash] = useState(0)
  const [requestedCash, setRequestedCash] = useState(0)
  const [offeredPropertyIds, setOfferedPropertyIds] = useState<string[]>([])
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<string[]>([])
  const otherPlayers = game.players.filter(
    (player) => player.user_id !== user.id && !player.bankrupt,
  )
  const canTrade = game.players.some(
    (player) => player.user_id === user.id && !player.bankrupt,
  )
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
  const pendingTrades = game.trades.filter(
    (trade) =>
      trade.status === 'pending' &&
      (trade.proposer_id === user.id || trade.recipient_id === user.id),
  )
  const propertyName = (propertyId: string) => {
    const tile = pack.board.tiles.find(
      (candidate) => candidate.id === propertyId,
    )
    return tile ? pack.messages[tile.name_key] : propertyId
  }
  const reset = () => {
    setRecipientId('')
    setOfferedCash(0)
    setRequestedCash(0)
    setOfferedPropertyIds([])
    setRequestedPropertyIds([])
  }
  const close = () => {
    setOpen(false)
    reset()
  }
  const canSend =
    recipientId &&
    (offeredCash > 0 ||
      requestedCash > 0 ||
      offeredPropertyIds.length > 0 ||
      requestedPropertyIds.length > 0)

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography fontWeight={850}>{t('trades')}</Typography>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<SwapHorizRoundedIcon />}
          disabled={
            game.status !== 'playing' || !canTrade || otherPlayers.length === 0
          }
          onClick={() => setOpen(true)}
        >
          {t('createTrade')}
        </Button>
      </Stack>

      {pendingTrades.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          {t('noPendingTrades')}
        </Typography>
      ) : (
        pendingTrades.map((trade: TradeOffer) => (
          <Alert
            key={trade.id}
            severity={trade.recipient_id === user.id ? 'info' : 'success'}
            sx={{
              flexDirection: { xs: 'column', sm: 'row' },
              '& .MuiAlert-action': {
                ml: { xs: 0, sm: 2 },
                mt: { xs: 1, sm: 0 },
                alignSelf: { xs: 'stretch', sm: 'center' },
              },
            }}
            action={
              trade.recipient_id === user.id ? (
                <Stack direction="row">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void onCommand({
                        action: 'accept_trade',
                        trade_id: trade.id,
                      })
                    }
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void onCommand({
                        action: 'reject_trade',
                        trade_id: trade.id,
                      })
                    }
                  >
                    {t('reject')}
                  </Button>
                </Stack>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void onCommand({
                      action: 'cancel_trade',
                      trade_id: trade.id,
                    })
                  }
                >
                  {t('cancel')}
                </Button>
              )
            }
          >
            {t('tradeSummary', {
              proposer: playerName(game, trade.proposer_id),
              offered: trade.offered_cash,
              requested: trade.requested_cash,
              recipient: playerName(game, trade.recipient_id),
            })}
          </Alert>
        ))
      )}

      <Dialog
        open={open}
        onClose={close}
        fullScreen={fullScreen}
        fullWidth
        maxWidth={recipientId ? 'md' : 'sm'}
        aria-labelledby="trade-title"
      >
        <DialogTitle id="trade-title" textAlign="center" color="secondary.light">
          {recipientId && (
            <IconButton
              aria-label={t('back')}
              onClick={() => setRecipientId('')}
              sx={{ position: 'absolute', left: 12, top: 10 }}
            >
              <ArrowBackRoundedIcon />
            </IconButton>
          )}
          {t('createTrade')}
          <IconButton
            aria-label={t('close')}
            onClick={close}
            sx={{ position: 'absolute', right: 12, top: 10 }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!recipientId ? (
            <Stack spacing={1.25}>
              <Typography textAlign="center" fontWeight={750} mb={1}>
                {t('selectTradePlayer')}
              </Typography>
              {otherPlayers.map((player) => {
                const index = game.players.findIndex(
                  (candidate) => candidate.user_id === player.user_id,
                )
                return (
                  <Button
                    key={player.user_id}
                    variant="outlined"
                    color="secondary"
                    onClick={() => setRecipientId(player.user_id)}
                    startIcon={
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          bgcolor: playerColors[index % playerColors.length],
                          color: '#0b0912',
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {index + 1}
                      </Avatar>
                    }
                    sx={{ minHeight: 64, fontSize: '1rem' }}
                  >
                    {player.display_name}
                  </Button>
                )
              })}
            </Stack>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <TradeSide
                title={user.display_name}
                cash={offeredCash}
                onCashChange={setOfferedCash}
                propertyIds={ownPropertyIds}
                selectedPropertyIds={offeredPropertyIds}
                onPropertyChange={setOfferedPropertyIds}
                propertyName={propertyName}
              />
              <SwapHorizRoundedIcon
                color="secondary"
                sx={{ mt: 5, display: { xs: 'none', md: 'block' } }}
              />
              <TradeSide
                title={
                  otherPlayers.find((player) => player.user_id === recipientId)
                    ?.display_name ?? ''
                }
                cash={requestedCash}
                onCashChange={setRequestedCash}
                propertyIds={recipientPropertyIds}
                selectedPropertyIds={requestedPropertyIds}
                onPropertyChange={setRequestedPropertyIds}
                propertyName={propertyName}
              />
            </Box>
          )}
        </DialogContent>
        {recipientId && (
          <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SendRoundedIcon />}
              disabled={busy || !canSend}
              onClick={async () => {
                const sent = await onCommand({
                  action: 'propose_trade',
                  recipient_id: recipientId,
                  offered_cash: offeredCash,
                  requested_cash: requestedCash,
                  offered_property_ids: offeredPropertyIds,
                  requested_property_ids: requestedPropertyIds,
                })
                if (sent) close()
              }}
              sx={{ minHeight: 48, px: 3 }}
            >
              {t('sendOffer')}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Stack>
  )
}

interface TradeSideProps {
  title: string
  cash: number
  onCashChange: (cash: number) => void
  propertyIds: string[]
  selectedPropertyIds: string[]
  onPropertyChange: (propertyIds: string[]) => void
  propertyName: (propertyId: string) => string
}

function TradeSide({
  title,
  cash,
  onCashChange,
  propertyIds,
  selectedPropertyIds,
  onPropertyChange,
  propertyName,
}: TradeSideProps) {
  const { t } = useTranslation()
  return (
    <Stack spacing={2}>
      <Typography variant="h6" fontWeight={850} textAlign="center">
        {title}
      </Typography>
      <TextField
        type="number"
        label={t('cash')}
        value={cash}
        onChange={(event) => onCashChange(Math.max(0, Number(event.target.value)))}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
      <FormControl>
        <InputLabel>{t('properties')}</InputLabel>
        <Select
          multiple
          label={t('properties')}
          value={selectedPropertyIds}
          onChange={(event) =>
            onPropertyChange(
              typeof event.target.value === 'string'
                ? event.target.value.split(',')
                : event.target.value,
            )
          }
          renderValue={(selected) =>
            t('selectedProperties', { count: selected.length })
          }
        >
          {propertyIds.map((propertyId) => (
            <MenuItem key={propertyId} value={propertyId}>
              <Checkbox checked={selectedPropertyIds.includes(propertyId)} />
              <ListItemText primary={propertyName(propertyId)} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  )
}

function playerName(game: GameState, playerId: string): string {
  return (
    game.players.find((player) => player.user_id === playerId)?.display_name ??
    playerId
  )
}
