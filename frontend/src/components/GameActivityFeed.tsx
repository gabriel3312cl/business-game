import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameEvent,
  PlayerState,
  SpectatorState,
} from '../types'

interface Props {
  events: GameEvent[]
  players: PlayerState[]
  spectators: SpectatorState[]
  pack: ContentPack
  compact?: boolean
}

export function GameActivityFeed({
  events,
  players,
  spectators,
  pack,
  compact = false,
}: Props) {
  const { t, i18n } = useTranslation()
  const visibleEvents = events.slice(compact ? -6 : -18).reverse()

  const playerName = (playerId?: string) =>
    players.find((player) => player.user_id === playerId)?.display_name ??
    spectators.find((spectator) => spectator.user_id === playerId)?.display_name ??
    t('bank')
  const propertyName = (tileId?: string) => {
    const tile = pack.board.tiles.find((candidate) => candidate.id === tileId)
    return tile ? pack.messages[tile.name_key] : (tileId ?? '')
  }
  const cardMessage = (cardId?: string) => {
    const card = pack.board.decks
      .flatMap((deck) => deck.cards)
      .find((candidate) => candidate.id === cardId)
    if (!card) return cardId ?? ''
    const title = card.title_key ? pack.messages[card.title_key] : ''
    const message = pack.messages[card.message_key] ?? cardId ?? ''
    return title ? `${title}: ${message}` : message
  }
  const deckName = (deckId?: string) => {
    const deck = pack.board.decks.find((candidate) => candidate.id === deckId)
    return deck?.name_key ? (pack.messages[deck.name_key] ?? deckId ?? '') : (deckId ?? '')
  }

  return (
    <Box>
      {!compact && (
        <>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryRoundedIcon fontSize="small" color="secondary" />
            <Typography fontWeight={800}>{t('activity.title')}</Typography>
          </Stack>
        </>
      )}
      {visibleEvents.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
          {t('activity.empty')}
        </Typography>
      ) : (
        <List
          dense
          disablePadding
          sx={{
            mt: 0.5,
            maxHeight: compact ? { xs: 72, sm: 120, lg: 180 } : 280,
            overflow: compact ? 'hidden' : 'auto',
            width: '100%',
            maskImage: compact
              ? 'linear-gradient(to bottom, black 58%, transparent 100%)'
              : 'none',
          }}
        >
          {visibleEvents.map((event) => (
            <ListItem key={event.sequence} disableGutters alignItems="flex-start">
              <ListItemText
                primary={eventMessage(
                  event,
                  t,
                  playerName,
                  propertyName,
                  cardMessage,
                  deckName,
                )}
                secondary={formatEventTime(event.occurred_at, i18n.language)}
                slotProps={{
                  primary: {
                    variant: 'body2',
                    sx: compact
                      ? {
                          fontSize: { xs: '0.55rem', sm: '0.7rem', lg: '0.8rem' },
                          lineHeight: 1.25,
                          textAlign: 'center',
                        }
                      : undefined,
                  },
                  secondary: {
                    variant: 'caption',
                    sx: compact ? { display: 'none' } : undefined,
                  },
                }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function eventMessage(
  event: GameEvent,
  t: Translate,
  playerName: (playerId?: string) => string,
  propertyName: (tileId?: string) => string,
  cardMessage: (cardId?: string) => string,
  deckName: (deckId?: string) => string,
): string {
  const player = playerName(textValue(event, 'player_id'))
  const member =
    textValue(event, 'display_name') ??
    playerName(
      textValue(event, 'player_id') ?? textValue(event, 'spectator_id'),
    )
  const amount = numberValue(event, 'amount')
  const property = propertyName(
    textValue(event, 'property_id') ?? textValue(event, 'tile_id'),
  )

  switch (event.type) {
    case 'game.created':
      return t('activity.gameCreated')
    case 'player.joined':
      return t('activity.playerJoined', { player })
    case 'player.left':
      return t('activity.playerLeft', { player: member })
    case 'player.resigned':
      return t('activity.playerResigned', { player: member })
    case 'spectator.joined':
      return t('activity.spectatorJoined', { player: member })
    case 'spectator.left':
      return t('activity.spectatorLeft', { player: member })
    case 'host.transferred':
      return t('activity.hostTransferred', {
        player: playerName(textValue(event, 'host_id')),
      })
    case 'game.settings_updated':
      return t('activity.settingsUpdated')
    case 'game.cancelled':
      return t('activity.gameCancelled')
    case 'game.started':
      return t('activity.gameStarted')
    case 'dice.rolled': {
      const dice = event.data.dice
      const diceText = Array.isArray(dice) ? dice.join(' + ') : '?'
      return t('activity.diceRolled', { player, dice: diceText, property })
    }
    case 'property.purchased':
      return t('activity.propertyPurchased', { player, property, amount })
    case 'property.declined':
      return t('activity.propertyDeclined', { player, property })
    case 'property.mortgaged':
      return t('activity.propertyMortgaged', { player, property, amount })
    case 'property.unmortgaged':
      return t('activity.propertyUnmortgaged', { player, property, amount })
    case 'building.purchased':
      return t('activity.buildingPurchased', {
        player,
        property,
        level: numberValue(event, 'level'),
      })
    case 'building.sold':
      return t('activity.buildingSold', {
        player,
        property,
        level: numberValue(event, 'level'),
      })
    case 'auction.started':
      return t('activity.auctionStarted', { property })
    case 'auction.bid_placed':
      return t('activity.auctionBid', { player, property, amount })
    case 'auction.player_passed':
      return t('activity.auctionPassed', { player })
    case 'auction.completed': {
      const winnerId = textValue(event, 'winner_id')
      return winnerId
        ? t('activity.auctionWon', {
            player: playerName(winnerId),
            property,
            amount,
          })
        : t('activity.auctionNoWinner', { property })
    }
    case 'payment.completed':
      return t('activity.paymentCompleted', {
        player: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'debt.created':
      return t('activity.debtCreated', {
        player: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'debt.paid':
      return t('activity.debtPaid', {
        player: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'card.drawn':
      return t('activity.cardDrawn', {
        player,
        card: cardMessage(textValue(event, 'card_id')),
      })
    case 'card.cash_applied':
      return t('activity.cardCash', { player, amount })
    case 'card.cash_each_applied':
      return t('activity.cardCashEach', {
        payer: playerName(textValue(event, 'payer_id')),
        recipient: playerName(textValue(event, 'recipient_id')),
        amount,
      })
    case 'card.player_moved':
      return t('activity.cardPlayerMoved', { player, property })
    case 'card.repairs_assessed':
      return t('activity.cardRepairs', {
        player,
        houses: numberValue(event, 'houses'),
        hotels: numberValue(event, 'hotels'),
        amount,
      })
    case 'card.utility_dice_rolled': {
      const dice = event.data.dice
      return t('activity.cardUtilityDice', {
        player,
        dice: Array.isArray(dice) ? dice.join(' + ') : '?',
      })
    }
    case 'card.deck_empty':
      return t('activity.deckEmpty', {
        deck: deckName(textValue(event, 'deck_id')),
      })
    case 'salary.collected':
      return t('activity.salaryCollected', { player, amount })
    case 'bank_pot.increased':
      return t('activity.bankPotIncreased', {
        amount,
        balance: numberValue(event, 'balance'),
      })
    case 'free_parking.collected':
      return t('activity.freeParkingCollected', { player, amount })
    case 'jail.entered':
      return t('activity.jailEntered', { player })
    case 'jail.released':
      return t('activity.jailReleased', { player })
    case 'jail.roll_failed':
      return t('activity.jailFailed', {
        player,
        count: numberValue(event, 'failed_rolls'),
      })
    case 'trade.proposed':
      return t('activity.tradeProposed', {
        player: playerName(textValue(event, 'proposer_id')),
        recipient: playerName(textValue(event, 'recipient_id')),
      })
    case 'trade.accepted':
      return t('activity.tradeAccepted')
    case 'trade.rejected':
      return t('activity.tradeRejected')
    case 'trade.cancelled':
      return t('activity.tradeCancelled')
    case 'player.bankrupt':
      return t('activity.playerBankrupt', { player })
    case 'turn.started':
      return t('activity.turnStarted', { player })
    case 'turn.extra_roll':
      return t('activity.extraRoll', { player })
    case 'game.finished':
      return t('activity.gameFinished', {
        player: playerName(textValue(event, 'winner_id')),
      })
    default:
      return t('activity.generic', { type: event.type })
  }
}

function textValue(event: GameEvent, key: string): string | undefined {
  const value = event.data[key]
  return typeof value === 'string' ? value : undefined
}

function numberValue(event: GameEvent, key: string): number | undefined {
  const value = event.data[key]
  return typeof value === 'number' ? value : undefined
}

function formatEventTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
