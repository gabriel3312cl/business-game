import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import DoneRoundedIcon from '@mui/icons-material/DoneRounded'
import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import LocalPoliceRoundedIcon from '@mui/icons-material/LocalPoliceRounded'
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import {
  Box,
  Button,
  Chip,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameCommand, GameState, User } from '../types'
import { Dice3D } from './Dice3D'
import { GameActivityFeed } from './GameActivityFeed'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  motionPending: boolean
  visibleEvents: GameState['events']
  isHost: boolean
  probabilityHeatmapVisible: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
  onToggleProbabilityHeatmap: () => void
  onStart: () => void
}

export function GameActionCenter({
  game,
  pack,
  user,
  busy,
  motionPending,
  visibleEvents,
  isHost,
  probabilityHeatmapVisible,
  onCommand,
  onToggleProbabilityHeatmap,
  onStart,
}: Props) {
  const { t } = useTranslation()
  const currentPlayer = game.players[game.current_player_index]
  const isCurrentPlayer = currentPlayer?.user_id === user.id
  const pendingTile = pack.board.tiles.find(
    (tile) => tile.id === game.pending_tile_id,
  )
  const [auctionPropertyId, setAuctionPropertyId] = useState('')
  const auctionCandidates = pack.board.tiles.filter(
    (tile) =>
      (tile.kind === 'property' ||
        tile.kind === 'transport' ||
        tile.kind === 'utility') &&
      tile.purchasable !== false &&
      game.owners[tile.id] === undefined,
  )
  const isSelectingAuction = game.pending_auction_selector_id === user.id
  const pendingPrice = pendingTile?.price ?? 0
  const discountedPrice = Math.floor(
    (pendingPrice * (100 - game.pending_purchase_discount_percent)) / 100,
  )
  const latestDice = latestDiceResult(game)

  return (
    <Stack
      spacing={{ xs: 0.45, sm: 0.8, lg: 1.2 }}
      alignItems="center"
      justifyContent="safe center"
      aria-busy={motionPending}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: '100%',
        height: 'max-content',
        py: { xs: 0.5, sm: 1 },
        '& > *': { flexShrink: 0 },
      }}
    >
      <Typography
        component="span"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {motionPending
          ? t('movementInProgress', {
              defaultValue: 'Movimiento en curso',
            })
          : ''}
      </Typography>
      <Dice3D
        key={latestDice.sequence ?? 'decorative'}
        values={latestDice.values}
        rollSequence={latestDice.sequence}
        dieLabel={t('dice')}
      />

      {game.status === 'lobby' ? (
        <>
          <Typography
            fontWeight={800}
            aria-live="polite"
            sx={{ fontSize: { xs: '0.65rem', sm: '0.9rem', lg: '1rem' } }}
          >
            {t('waitingForPlayers', {
              current: game.players.length,
              minimum: pack.manifest.min_players,
            })}
          </Typography>
          {isHost && (
            <Button
              variant="contained"
              size="small"
              disabled={busy || game.players.length < pack.manifest.min_players}
              onClick={onStart}
              sx={{ minHeight: 44 }}
            >
              {t('startGame')}
            </Button>
          )}
        </>
      ) : game.status === 'playing' ? (
        <>
          <Typography
            color={isCurrentPlayer ? 'secondary.light' : 'text.secondary'}
            fontWeight={isCurrentPlayer ? 800 : 600}
            aria-live="polite"
            sx={{ fontSize: { xs: '0.62rem', sm: '0.85rem', lg: '1rem' } }}
          >
            {isCurrentPlayer
              ? t('yourTurn')
              : t('currentTurn', {
                  player: currentPlayer?.display_name ?? t('bank'),
                })}
          </Typography>
          {isCurrentPlayer &&
            !motionPending &&
            !game.active_auction &&
            !game.active_debt && (
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              flexWrap="wrap"
              justifyContent="center"
            >
              {isSelectingAuction && (
                <>
                  <FormControl size="small" sx={{ minWidth: 210 }}>
                    <Select
                      value={auctionPropertyId}
                      displayEmpty
                      aria-label={t('selectAuctionProperty')}
                      onChange={(event) => setAuctionPropertyId(event.target.value)}
                    >
                      <MenuItem value="" disabled>
                        {t('selectAuctionProperty')}
                      </MenuItem>
                      {auctionCandidates.map((tile) => (
                        <MenuItem key={tile.id} value={tile.id}>
                          {pack.messages[tile.name_key]} · ${tile.price ?? 0}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<GavelRoundedIcon />}
                    disabled={busy || auctionPropertyId === ''}
                    onClick={() =>
                      void onCommand({
                        action: 'select_auction_property',
                        property_id: auctionPropertyId,
                      })
                    }
                    sx={{ minHeight: 44 }}
                  >
                    {t('startSelectedAuction', {
                      amount: game.pending_auction_minimum_bid ?? 10,
                    })}
                  </Button>
                </>
              )}
              {!isSelectingAuction && game.phase === 'waiting_for_roll' && (
                <>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={
                      currentPlayer.in_jail ? (
                        <LocalPoliceRoundedIcon />
                      ) : (
                        <CasinoRoundedIcon />
                      )
                    }
                    disabled={busy}
                    onClick={() => void onCommand({ action: 'roll' })}
                    sx={{ minHeight: 44 }}
                  >
                    {currentPlayer.in_jail ? t('tryDoubles') : t('rollDice')}
                  </Button>
                  <Button
                    variant={probabilityHeatmapVisible ? 'contained' : 'outlined'}
                    color="info"
                    size="small"
                    startIcon={<QueryStatsRoundedIcon />}
                    disabled={busy}
                    onClick={onToggleProbabilityHeatmap}
                    sx={{ minHeight: 44 }}
                  >
                    {probabilityHeatmapVisible
                      ? t('heatmap.hideProbability')
                      : t('heatmap.showProbability')}
                  </Button>
                  {currentPlayer.in_jail &&
                    currentPlayer.balance >= pack.manifest.jail_fine && (
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          void onCommand({ action: 'pay_jail_fine' })
                        }
                        sx={{ minHeight: 44 }}
                      >
                        {t('payJailFine', {
                          amount: pack.manifest.jail_fine,
                        })}
                      </Button>
                    )}
                  {currentPlayer.in_jail &&
                    currentPlayer.jail_card_ids.length > 0 && (
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          void onCommand({ action: 'use_jail_card' })
                        }
                        sx={{ minHeight: 44 }}
                      >
                        {t('useJailCard')}
                      </Button>
                    )}
                </>
              )}
              {!isSelectingAuction && game.phase === 'buy_decision' && (
                <>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<ShoppingCartRoundedIcon />}
                    disabled={busy}
                    onClick={() =>
                      void onCommand({ action: 'buy_property' })
                    }
                    sx={{ minHeight: 44 }}
                  >
                    {t('buyFor', { price: discountedPrice })}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<GavelRoundedIcon />}
                    disabled={busy}
                    onClick={() =>
                      void onCommand({ action: 'decline_property' })
                    }
                    sx={{ minHeight: 44 }}
                  >
                    {t('auction')}
                  </Button>
                </>
              )}
              {!isSelectingAuction && game.phase === 'waiting_for_end' && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<DoneRoundedIcon />}
                  disabled={busy}
                  onClick={() => void onCommand({ action: 'end_turn' })}
                  sx={{ minHeight: 44 }}
                >
                  {t('endTurn')}
                </Button>
              )}
            </Stack>
          )}
          {!motionPending && game.active_auction && (
            <Chip
              icon={<GavelRoundedIcon />}
              color="secondary"
              label={t('currentBid', {
                amount: game.active_auction.current_bid,
              })}
            />
          )}
        </>
      ) : (
        <Typography fontWeight={800}>
          {t(`gameStatusMessage.${game.status}`)}
        </Typography>
      )}

      <Box
        sx={{
          width: 'min(100%, 620px)',
          px: { xs: 0.5, sm: 1.5 },
          display: { xs: 'none', sm: 'block' },
        }}
      >
        <GameActivityFeed
          compact
          events={visibleEvents}
          players={game.players}
          spectators={game.spectators}
          pack={pack}
        />
      </Box>
    </Stack>
  )
}

function latestDiceResult(game: GameState): {
  values: [number, number] | null
  sequence: number | null
} {
  for (let index = game.events.length - 1; index >= 0; index -= 1) {
    const event = game.events[index]
    if (
      event.type !== 'dice.rolled' &&
      event.type !== 'card.utility_dice_rolled'
    ) {
      continue
    }
    const values = event.data.dice
    if (
      Array.isArray(values) &&
      values.length === 2 &&
      values.every(
        (value) =>
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 6,
      )
    ) {
      return {
        values: [values[0] as number, values[1] as number],
        sequence: event.sequence,
      }
    }
  }

  return {
    values: game.last_roll,
    sequence: null,
  }
}
