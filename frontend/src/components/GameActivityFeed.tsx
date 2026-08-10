import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded'
import StyleRoundedIcon from '@mui/icons-material/StyleRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
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
import { useEffect, useRef, useState } from 'react'
import type {
  ContentPack,
  GameEvent,
  PlayerState,
  SpectatorState,
  VisualEffectsIntensity,
} from '../types'
import { playerColor } from './gameColors'
import {
  activityPresentation,
  type ActivityTone,
} from './gameActivityFeedPresentation'
import { institutionRevenueSourceKey } from './institutionRevenue'

interface Props {
  events: GameEvent[]
  players: PlayerState[]
  spectators: SpectatorState[]
  pack: ContentPack
  compact?: boolean
  motionIntensity?: VisualEffectsIntensity
}

export function GameActivityFeed({
  events,
  players,
  spectators,
  pack,
  compact = false,
  motionIntensity = 'full',
}: Props) {
  const { t, i18n } = useTranslation()
  const visibleEvents = events.slice(-18).reverse()
  const latestSequence = visibleEvents[0]?.sequence ?? 0
  const cursor = useRef(latestSequence)
  const [animatedSequence, setAnimatedSequence] = useState<number | null>(null)

  useEffect(() => {
    if (latestSequence <= cursor.current) return
    cursor.current = latestSequence
    if (motionIntensity === 'off') return
    setAnimatedSequence(latestSequence)
    const timer = window.setTimeout(() => setAnimatedSequence(null), 720)
    return () => window.clearTimeout(timer)
  }, [latestSequence, motionIntensity])

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
            <Typography variant="caption" color="text.secondary">
              {t('activity.newestFirst')}
            </Typography>
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
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            touchAction: 'pan-y',
            scrollbarGutter: 'stable',
            width: '100%',
          }}
        >
          {visibleEvents.map((event) => {
            const presentation = activityPresentation(event)
            const message = eventMessage(
              event,
              t,
              playerName,
              propertyName,
              cardMessage,
              deckName,
              (position) => {
                const tile = pack.board.tiles[position]
                return tile ? (pack.messages[tile.name_key] ?? tile.id) : ''
              },
              (key) => pack.messages[key] ?? key,
              i18n.language,
            )
            return (
              <ListItem
                key={event.sequence}
                alignItems="flex-start"
                sx={{
                  py: compact ? 0.35 : 0.65,
                  px: compact ? 0.6 : 0.85,
                  mb: 0.4,
                  borderRadius: 1.5,
                  borderLeft: `3px solid ${presentation.color}`,
                  bgcolor: `${presentation.color}0d`,
                  animation:
                    event.sequence === animatedSequence
                      ? motionIntensity === 'soft'
                        ? 'activity-fade 420ms ease-out'
                        : 'activity-enter 680ms cubic-bezier(.2,.8,.2,1)'
                      : undefined,
                  '@keyframes activity-enter': {
                    from: { opacity: 0, transform: 'translateX(-18px)' },
                    '55%': { opacity: 1, transform: 'translateX(3px)' },
                    to: { opacity: 1, transform: 'translateX(0)' },
                  },
                  '@keyframes activity-fade': {
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                  },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    mt: compact ? 0.15 : 0.25,
                    mr: compact ? 0.6 : 0.85,
                    width: compact ? 20 : 24,
                    height: compact ? 20 : 24,
                    flex: '0 0 auto',
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    color: presentation.color,
                    bgcolor: `${presentation.color}1f`,
                    fontSize: compact ? 13 : 15,
                  }}
                >
                  <ActivityIcon tone={presentation.tone} />
                </Box>
                <ListItemText
                  sx={{ my: 0 }}
                  primary={decorateEventMessage(
                    message,
                    players,
                    spectators,
                    presentation.color,
                  )}
                  secondary={formatEventTime(event.occurred_at, i18n.language)}
                  slotProps={{
                    primary: {
                      variant: 'body2',
                      sx: compact
                        ? {
                            fontSize: { xs: '0.55rem', sm: '0.7rem', lg: '0.8rem' },
                            lineHeight: 1.3,
                          }
                        : { lineHeight: 1.35 },
                    },
                    secondary: {
                      variant: 'caption',
                      sx: compact ? { display: 'none' } : { opacity: 0.7 },
                    },
                  }}
                />
              </ListItem>
            )
          })}
        </List>
      )}
    </Box>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function ActivityIcon({ tone }: { tone: ActivityTone }) {
  switch (tone) {
    case 'income':
      return <AccountBalanceWalletRoundedIcon fontSize="inherit" />
    case 'expense':
      return <PaymentsRoundedIcon fontSize="inherit" />
    case 'movement':
      return <CasinoRoundedIcon fontSize="inherit" />
    case 'property':
      return <HomeWorkRoundedIcon fontSize="inherit" />
    case 'trade':
      return <HandshakeRoundedIcon fontSize="inherit" />
    case 'card':
      return <StyleRoundedIcon fontSize="inherit" />
    case 'alert':
      return <WarningAmberRoundedIcon fontSize="inherit" />
    default:
      return <InfoRoundedIcon fontSize="inherit" />
  }
}

function decorateEventMessage(
  message: string,
  players: PlayerState[],
  spectators: SpectatorState[],
  moneyColor: string,
) {
  const people = [
    ...players.map((player, index) => ({
      name: player.display_name,
      color: playerColor(player, index),
    })),
    ...spectators.map((spectator) => ({
      name: spectator.display_name,
      color: '#b0b8c8',
    })),
  ].filter((person) => person.name.length > 0)
  const names = people
    .map((person) => person.name)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
  const matcher = new RegExp(
    `(${names.length > 0 ? `${names.join('|')}|` : ''}\\$-?[\\d.,]+)`,
    'g',
  )

  return message.split(matcher).filter(Boolean).map((part, index) => {
    const person = people.find((candidate) => candidate.name === part)
    if (person) {
      return (
        <Box
          component="span"
          key={`${part}-${index}`}
          sx={{ color: person.color, fontWeight: 850 }}
        >
          {part}
        </Box>
      )
    }
    if (/^\$-?[\d.,]+$/.test(part)) {
      return (
        <Box
          component="span"
          key={`${part}-${index}`}
          sx={{ color: moneyColor, fontWeight: 850 }}
        >
          {part}
        </Box>
      )
    }
    return part
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function eventMessage(
  event: GameEvent,
  t: Translate,
  playerName: (playerId?: string) => string,
  propertyName: (tileId?: string) => string,
  cardMessage: (cardId?: string) => string,
  deckName: (deckId?: string) => string,
  propertyAtPosition: (position: number) => string,
  contentMessage: (key: string) => string,
  locale: string,
): string {
  const player = playerName(textValue(event, 'player_id'))
  const member =
    textValue(event, 'display_name') ??
    playerName(
      textValue(event, 'player_id') ?? textValue(event, 'spectator_id'),
    )
  const amount = numberValue(event, 'amount')
  const propertyById = propertyName(
    textValue(event, 'property_id') ?? textValue(event, 'tile_id'),
  )
  const position = numberValue(event, 'to_position')
  const property =
    propertyById || (position === undefined ? '' : propertyAtPosition(position))
  const instrumentKind =
    textValue(event, 'instrument_kind') ??
    (textValue(event, 'tile_id')?.startsWith('institution:')
      ? textValue(event, 'tile_id')?.replace('institution:', '')
      : undefined)
  const investment =
    instrumentKind && instrumentKind !== 'asset'
      ? t(`bankPanel.instrumentNames.${instrumentKind}`, {
          defaultValue: t('bankPanel.investment'),
        })
      : property || t('bankPanel.investment')

  switch (event.type) {
    case 'economy.week_advanced': {
      const dateValue = textValue(event, 'date')
      const date = dateValue ? new Date(`${dateValue}T12:00:00`) : null
      return t('activity.economyWeekAdvanced', {
        date:
          date && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(date)
            : dateValue,
        weather: t(`economy.weather.${textValue(event, 'weather')}`),
        cycle: t(`economy.cycle.${textValue(event, 'cycle')}`),
      })
    }
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
      return t('activity.propertyPurchased', {
        player,
        property,
        amount: numberValue(event, 'price') ?? amount,
      })
    case 'property.declined':
      return t('activity.propertyDeclined', { player, property })
    case 'property.mortgaged':
      return t('activity.propertyMortgaged', { player, property, amount })
    case 'property.trade_availability_changed':
      return t(
        event.data.available
          ? 'activity.propertyTradeEnabled'
          : 'activity.propertyTradeDisabled',
        { player, property },
      )
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
    case 'auction.deposit_placed':
      return t('activity.auctionDepositPlaced', { player, amount })
    case 'auction.deposit_refunded':
      return t('activity.auctionDepositRefunded', { player, amount })
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
    case 'debt.collection_demanded':
      return t('activity.debtCollectionDemanded', {
        creditor: playerName(textValue(event, 'creditor_id')),
        debtor: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'debt.paid':
      return t('activity.debtPaid', {
        player: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'debt.forgiven':
      return t('activity.debtForgiven', {
        creditor: playerName(textValue(event, 'creditor_id')),
        debtor: playerName(textValue(event, 'debtor_id')),
        amount,
      })
    case 'debt.plan_proposed':
      if (numberValue(event, 'installments') === 0) {
        return t('activity.debtPropertySettlementProposed', {
          creditor: playerName(textValue(event, 'creditor_id')),
          debtor: playerName(textValue(event, 'debtor_id')),
          properties: Array.isArray(event.data.requested_property_ids)
            ? event.data.requested_property_ids.length
            : 0,
        })
      }
      if (
        Array.isArray(event.data.requested_property_ids) &&
        event.data.requested_property_ids.length > 0
      ) {
        return t('activity.debtMixedSettlementProposed', {
          creditor: playerName(textValue(event, 'creditor_id')),
          debtor: playerName(textValue(event, 'debtor_id')),
          total: numberValue(event, 'total_amount'),
          installments: numberValue(event, 'installments'),
          properties: event.data.requested_property_ids.length,
        })
      }
      return t('activity.debtPlanProposed', {
        creditor: playerName(textValue(event, 'creditor_id')),
        debtor: playerName(textValue(event, 'debtor_id')),
        total: numberValue(event, 'total_amount'),
        installments: numberValue(event, 'installments'),
      })
    case 'debt.plan_accepted':
      return t('activity.debtPlanAccepted', {
        player: playerName(textValue(event, 'debtor_id')),
      })
    case 'debt.plan_rejected':
      return t('activity.debtPlanRejected', {
        player: playerName(textValue(event, 'debtor_id')),
      })
    case 'debt.installment_paid': {
      const remaining = numberValue(event, 'remaining_amount')
      return t('activity.debtInstallmentPaid', {
        player: playerName(textValue(event, 'debtor_id')),
        amount,
        remaining:
          remaining === undefined ? t('activity.notAvailable') : `$${remaining}`,
      })
    }
    case 'debt.plan_completed':
      return t('activity.debtPlanCompleted', {
        player: playerName(textValue(event, 'debtor_id')),
      })
    case 'debt.plan_cancelled':
      return t('activity.debtPlanCancelled')
    case 'card.selection_started':
      return t('activity.cardSelectionStarted', { player })
    case 'card.drawn':
      return t('activity.cardDrawn', {
        player,
        card: cardMessage(textValue(event, 'card_id')),
      })
    case 'card.continued':
      return t('activity.cardContinued', { player })
    case 'card.cash_applied':
      return t('activity.cardCash', { player, amount })
    case 'card.cash_equalized':
      return t('activity.cardCashEqualized', {
        player,
        target: playerName(textValue(event, 'target_player_id')),
        playerBalance: numberValue(event, 'player_balance_after'),
        targetBalance: numberValue(event, 'target_balance_after'),
      })
    case 'card.cash_each_applied':
      return t('activity.cardCashEach', {
        payer: playerName(textValue(event, 'payer_id')),
        recipient: playerName(textValue(event, 'recipient_id')),
        amount,
      })
    case 'card.choice_presented':
      return t('activity.cardChoicePresented', { player })
    case 'card.choice_resolved':
      return t('activity.cardChoiceResolved', {
        player,
        result: contentMessage(textValue(event, 'result_key') ?? ''),
      })
    case 'card.choice_result_acknowledged':
      return t('activity.cardChoiceResultAcknowledged', { player })
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
      return withBotReason(
        t('activity.tradeProposed', {
          player: playerName(textValue(event, 'proposer_id')),
          recipient: playerName(textValue(event, 'recipient_id')),
        }),
        event,
        t,
      )
    case 'trade.accepted':
      return withBotReason(t('activity.tradeAccepted'), event, t)
    case 'trade.rejected':
      return withBotReason(t('activity.tradeRejected'), event, t)
    case 'trade.cancelled':
      return withBotReason(t('activity.tradeCancelled'), event, t)
    case 'trade.countered':
      return withBotReason(
        t('activity.tradeCountered', {
          player: playerName(textValue(event, 'actor_id')),
        }),
        event,
        t,
      )
    case 'relationship.changed': {
      const delta = numberValue(event, 'delta') ?? 0
      return t('activity.relationshipChanged', {
        bot: playerName(textValue(event, 'bot_id')),
        player: playerName(textValue(event, 'player_id')),
        score: numberValue(event, 'score') ?? 0,
        change: delta > 0 ? `+${delta}` : delta,
      })
    }
    case 'bank.loan_issued':
      return t('bankPanel.activity.loanIssued', {
        player,
        amount: `$${numberValue(event, 'principal') ?? 0}`,
      })
    case 'bank.loan_payment':
      return t('bankPanel.activity.loanPaid', {
        player,
        amount: `$${amount ?? 0}`,
      })
    case 'bank.loan_payment_missed':
      return t('bankPanel.activity.loanPaymentMissed', { player })
    case 'bank.loan_defaulted':
      return t('bankPanel.activity.loanDefaulted', { player })
    case 'bank.emergency_issued':
      return t('bankPanel.activity.emergencyIssued', {
        amount: `$${amount ?? 0}`,
      })
    case 'investment.shares_bought':
      return t('bankPanel.activity.sharesBought', {
        player,
        count: numberValue(event, 'quantity') ?? 0,
        instrument: investment,
      })
    case 'investment.shares_sold':
      return t('bankPanel.activity.sharesSold', {
        player,
        count: numberValue(event, 'quantity') ?? 0,
        instrument: investment,
      })
    case 'investment.dividends_settled':
      return t('bankPanel.activity.dividendsSettled', {
        amount: `$${amount ?? 0}`,
        round: numberValue(event, 'market_round') ?? 0,
      })
    case 'investment.limit_order_placed':
      return t('bankPanel.activity.limitOrderPlaced', {
        player,
        side: t(`marketPanel.sides.${textValue(event, 'side')}`),
        count: numberValue(event, 'quantity') ?? 0,
        instrument: investment,
        price: `$${numberValue(event, 'limit_price') ?? 0}`,
      })
    case 'investment.limit_order_cancelled':
      return t('bankPanel.activity.limitOrderCancelled', {
        player,
        instrument: investment,
      })
    case 'investment.order_filled':
      return t('bankPanel.activity.orderFilled', {
        buyer: playerName(textValue(event, 'buyer_id')),
        seller: playerName(textValue(event, 'seller_id')),
        count: numberValue(event, 'quantity') ?? 0,
        instrument: investment,
        price: `$${numberValue(event, 'unit_price') ?? 0}`,
      })
    case 'investment.margin_call':
      return t('bankPanel.activity.marginCall', {
        player,
        count: numberValue(event, 'cancelled_orders') ?? 0,
      })
    case 'investment.dividend_paid':
      if (numberValue(event, 'dividend_accrued_units') !== undefined) {
        const paid = numberValue(event, 'dividends') ?? 0
        return t(
          paid > 0
            ? 'bankPanel.activity.dividendAccruedAndPaid'
            : 'bankPanel.activity.dividendAccrued',
          {
            instrument: investment,
            accrued: preciseMoney(
              numberValue(event, 'dividend_accrued_units') ?? 0,
              locale,
            ),
            paid: `$${paid}`,
          },
        )
      }
      return t('bankPanel.activity.dividendPaid', {
        instrument: investment,
        amount: `$${numberValue(event, 'dividends') ?? 0}`,
      })
    case 'investment.institution_revenue': {
      const source = t(
        `bankPanel.activity.revenueSources.${institutionRevenueSourceKey(
          textValue(event, 'revenue_type'),
        )}`,
      )
      if (numberValue(event, 'dividend_accrued_units') !== undefined) {
        const paid = numberValue(event, 'dividends') ?? 0
        return t(
          paid > 0
            ? 'bankPanel.activity.institutionRevenueAccruedAndPaid'
            : 'bankPanel.activity.institutionRevenueAccrued',
          {
            instrument: investment,
            amount: `$${amount ?? 0}`,
            source,
            accrued: preciseMoney(
              numberValue(event, 'dividend_accrued_units') ?? 0,
              locale,
            ),
            paid: `$${paid}`,
          },
        )
      }
      return t('bankPanel.activity.institutionRevenue', {
        instrument: investment,
        amount: `$${amount ?? 0}`,
        source,
        dividends: `$${numberValue(event, 'dividends') ?? 0}`,
      })
    }
    case 'investment.position_liquidated':
      return t('bankPanel.activity.positionLiquidated', {
        player,
        amount: `$${amount ?? 0}`,
      })
    case 'investment.market_expanded':
      return t('bankPanel.activity.marketExpanded', {
        count: numberValue(event, 'added_instruments') ?? 0,
      })
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

function withBotReason(message: string, event: GameEvent, t: Translate): string {
  // An AI bot writes its own note; a scripted bot sends a code we translate.
  const note = textValue(event, 'bot_note')
  if (note) return `${message} — ${note}`
  const reason = textValue(event, 'bot_reason')
  if (!reason) return message
  const explanation = t(`activity.botReason.${reason}`, { defaultValue: '' })
  return explanation ? `${message} — ${explanation}` : message
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

function preciseMoney(units: number, locale: string): string {
  return `$${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(units / 10_000)}`
}
