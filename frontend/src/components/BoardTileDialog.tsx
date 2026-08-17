import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameState,
  TileDefinition,
} from '../types'
import { TileVisual } from './AssetVisual'
import { indexedAmount, indexedRent } from './economicValues'
import { playerColor } from './gameColors'
import {
  buildAvailability,
  mortgageAvailability,
  propertyGroupTiles,
  sellBuildingAvailability,
  unmortgageAvailability,
  unmortgageCost,
} from './propertyRules'
import { defaultTileColor, tileIconBackgroundStyle } from './tilePresentation'

interface Props {
  tile: TileDefinition | null
  pack: ContentPack
  game?: GameState | null
  currentUserId?: string
  busy?: boolean
  onClose: () => void
  onSelectTile: (tileId: string) => void
  onCommand?: (command: GameCommand) => Promise<boolean>
  onTrade?: (ownerId: string, propertyId: string) => void
}

export function BoardTileDialog({
  tile,
  pack,
  game = null,
  currentUserId,
  busy = false,
  onClose,
  onSelectTile,
  onCommand,
  onTrade,
}: Props) {
  const { t } = useTranslation()
  if (!tile) return null

  const name = pack.messages[tile.name_key] ?? tile.id
  const accent = tile.color ?? defaultTileColor(tile.kind)
  const ownerId = game?.owners[tile.id]
  const ownerIndex = game?.players.findIndex((player) => player.user_id === ownerId) ?? -1
  const owner = ownerIndex >= 0 ? game?.players[ownerIndex] : undefined
  const isCurrentOwner = Boolean(currentUserId && ownerId === currentUserId)
  const mortgaged = Boolean(game?.mortgaged_property_ids.includes(tile.id))
  const level = game?.building_levels[tile.id] ?? 0
  const groupTiles = propertyGroupTiles(pack, tile)
  const group = pack.board.groups?.find((candidate) => candidate.id === tile.group)
  const groupOwnerId = ownerId ?? currentUserId
  const groupOwnedCount = groupOwnerId
    ? groupTiles.filter((item) => game?.owners[item.id] === groupOwnerId).length
    : 0
  const groupComplete = groupTiles.length > 0 && groupOwnedCount === groupTiles.length
  const canManage = Boolean(game && currentUserId && isCurrentOwner && onCommand)
  const currentPlayer = game?.players.find(
    (player) => player.user_id === currentUserId,
  )
  const isTradeableAsset =
    tile.price != null &&
    tile.purchasable !== false &&
    ['property', 'transport', 'utility'].includes(tile.kind)
  const tradeAvailable =
    !game?.trade_unavailable_property_ids.includes(tile.id) && level === 0
  const showOwnerTrade = Boolean(
    isTradeableAsset && ownerId && !isCurrentOwner && currentUserId,
  )
  const canStartOwnerTrade = Boolean(
    showOwnerTrade &&
      tradeAvailable &&
      owner &&
      !owner.bankrupt &&
      currentPlayer &&
      !currentPlayer.bankrupt &&
      game?.status === 'playing' &&
      !game.active_auction &&
      !game.pending_auction_selector_id &&
      !game.active_debt &&
      onTrade,
  )
  const currentAmount = (amount: number, passThroughPercent = 100) =>
    game ? indexedAmount(game, amount, passThroughPercent) : amount
  const currentRent = (amount: number) =>
    game ? indexedRent(game, tile, amount) : amount
  const build =
    game && currentUserId
      ? buildAvailability(game, pack, tile, currentUserId)
      : null
  const sell =
    game && currentUserId
      ? sellBuildingAvailability(game, pack, tile, currentUserId)
      : null
  const mortgage =
    game && currentUserId
      ? mortgageAvailability(game, pack, tile, currentUserId)
      : null
  const unmortgage =
    game && currentUserId
      ? unmortgageAvailability(game, pack, tile, currentUserId)
      : null

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            maxWidth: { sm: 540 },
            maxHeight: { sm: 'calc(100dvh - 32px)' },
            borderRadius: { xs: '16px', sm: '20px' },
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box sx={{ height: 6, flexShrink: 0, bgcolor: accent }} />
      <DialogTitle sx={{ px: 2.25, py: 1.5, pr: 6.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 36,
              flex: '0 0 auto',
              display: 'grid',
              placeItems: 'center',
              ...tileIconBackgroundStyle(tile.icon_background, accent),
            }}
          >
            <TileVisual
              kind={tile.kind}
              icon={tile.icon}
              assetPath={tile.asset_path}
            />
          </Box>
          <Box minWidth={0}>
            <Typography variant="h6" component="h2" fontWeight={850}>
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(`tileKind.${tile.kind}`)}
            </Typography>
          </Box>
        </Stack>
        <IconButton
          aria-label={t('close')}
          onClick={onClose}
          sx={{ position: 'absolute', top: 10, right: 10 }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2.25, pb: 1.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {tile.purchasable !== false && tile.price != null && (
              <Chip label={t('purchasePrice', { amount: currentAmount(tile.price) })} />
            )}
            {owner ? (
              <Chip
                sx={{
                  borderColor: playerColor(owner, ownerIndex),
                }}
                variant="outlined"
                label={t('ownedBy', { player: owner.display_name })}
              />
            ) : tile.price != null ? (
              <Chip variant="outlined" label={t('unownedProperty')} />
            ) : null}
            {mortgaged && <Chip color="warning" label={t('mortgaged')} />}
            {tile.kind === 'property' && game && (
              <Chip
                icon={<HomeWorkRoundedIcon />}
                label={buildingLevelLabel(t, level)}
              />
            )}
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0.75,
            }}
          >
            {tile.base_rent != null && (
              <InfoCell label={t('baseRent')} value={`$${currentRent(tile.base_rent)}`} />
            )}
            {tile.mortgage_value != null && (
              <InfoCell
                label={t('mortgageValue')}
                value={`$${currentAmount(tile.mortgage_value)}`}
              />
            )}
            {tile.build_cost != null && (
              <InfoCell
                label={t('houseCost')}
                value={`$${currentAmount(tile.build_cost)}`}
              />
            )}
            {tile.build_cost != null && (
              <InfoCell
                label={t('hotelCost')}
                value={`$${currentAmount(tile.hotel_cost ?? tile.build_cost)}`}
              />
            )}
            {tile.amount != null && (
              <InfoCell label={t('landingAmount')} value={`$${currentAmount(tile.amount, 80)}`} />
            )}
            {tile.net_worth_percent != null && (
              <InfoCell
                label={t('netWorthCharge')}
                value={`${tile.net_worth_percent}%`}
              />
            )}
            {tile.deck_id && (
              <InfoCell
                label={t('cardDeck')}
                value={
                  pack.messages[
                    pack.board.decks.find((deck) => deck.id === tile.deck_id)
                      ?.name_key ?? ''
                  ] ?? tile.deck_id
                }
              />
            )}
          </Box>

          {tile.rent_levels && tile.rent_levels.length > 0 && (
            <Box>
              <Typography fontWeight={800} mb={1}>
                {t('rentProgression')}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
                  gap: 0.5,
                }}
              >
                {tile.rent_levels.map((rent, index) => (
                  <Paper
                    key={`${tile.id}-rent-${index}`}
                    variant="outlined"
                    sx={{
                      p: 0.875,
                      borderRadius: '12px',
                      borderColor:
                        game && index === level ? accent : 'rgba(255,255,255,.12)',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {rentLevelLabel(t, tile, index)}
                    </Typography>
                    <Typography fontWeight={850}>${currentRent(rent)}</Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {tile.rent_multipliers && tile.rent_multipliers.length > 0 && (
            <Box>
              <Typography fontWeight={800} mb={1}>
                {t('rentProgression')}
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {tile.rent_multipliers.map((multiplier, index) => (
                  <Chip
                    key={`${tile.id}-multiplier-${index}`}
                    variant="outlined"
                    label={t('utilityRentLevel', {
                      count: index + 1,
                      multiplier,
                    })}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {groupTiles.length > 0 && (
            <>
              <Divider />
              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                  mb={1}
                >
                  <Box>
                    <Typography fontWeight={850}>
                      <ApartmentRoundedIcon
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', mr: 0.75 }}
                      />
                      {pack.messages[group?.name_key ?? ''] ?? tile.group}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('groupProgress', {
                        owned: groupOwnedCount,
                        total: groupTiles.length,
                      })}
                    </Typography>
                  </Box>
                  <Chip
                    color={groupComplete ? 'success' : 'default'}
                    size="small"
                    label={
                      groupComplete ? t('completeGroup') : t('incompleteGroup')
                    }
                  />
                </Stack>
                <Stack spacing={0.5}>
                  {groupTiles.map((groupTile) => {
                    const groupTileOwnerId = game?.owners[groupTile.id]
                    const groupTileOwner = game?.players.find(
                      (player) => player.user_id === groupTileOwnerId,
                    )
                    const groupTileLevel = game?.building_levels[groupTile.id] ?? 0
                    return (
                      <Button
                        key={groupTile.id}
                        variant={groupTile.id === tile.id ? 'contained' : 'outlined'}
                        color={groupTile.id === tile.id ? 'secondary' : 'inherit'}
                        onClick={() => onSelectTile(groupTile.id)}
                        sx={{
                          justifyContent: 'space-between',
                          textTransform: 'none',
                          gap: 1,
                          minHeight: 36,
                          px: 1.25,
                          borderRadius: '12px',
                        }}
                      >
                        <span>{pack.messages[groupTile.name_key] ?? groupTile.id}</span>
                        <Typography component="span" variant="caption">
                          {groupTileOwner
                            ? `${groupTileOwner.display_name} · ${buildingLevelLabel(t, groupTileLevel)}`
                            : t('unownedProperty')}
                        </Typography>
                      </Button>
                    )
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  {t('buildSequenceHelp')}
                </Typography>
              </Box>
            </>
          )}

          {canManage && game && currentUserId && (
            <>
              <Divider />
              <Box>
                <Typography fontWeight={850} mb={1}>
                  {t('propertyManagement')}
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {mortgaged ? (
                    <Button
                      variant="outlined"
                      disabled={busy || !unmortgage?.allowed}
                      onClick={() =>
                        void onCommand?.({
                          action: 'unmortgage_property',
                          property_id: tile.id,
                        })
                      }
                    >
                      {t('unmortgageFor', {
                        amount: unmortgageCost(game, pack, tile),
                      })}
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      disabled={busy || !mortgage?.allowed}
                      onClick={() =>
                        void onCommand?.({
                          action: 'mortgage_property',
                          property_id: tile.id,
                        })
                      }
                    >
                      {t('mortgageFor', {
                        amount: currentAmount(tile.mortgage_value ?? 0),
                      })}
                    </Button>
                  )}
                  {tile.kind === 'property' && (
                    <>
                      <Button
                        variant="contained"
                        disabled={busy || !build?.allowed}
                        onClick={() =>
                          void onCommand?.({
                            action: 'build_property',
                            property_id: tile.id,
                          })
                        }
                      >
                        {level === 4
                          ? t('buyHotel', {
                              amount: currentAmount(
                                tile.hotel_cost ?? tile.build_cost ?? 0,
                              ),
                            })
                          : t('buyHouse', {
                              amount: currentAmount(tile.build_cost ?? 0),
                            })}
                      </Button>
                      <Button
                        variant="outlined"
                        disabled={busy || !sell?.allowed}
                        onClick={() =>
                          void onCommand?.({
                            action: 'sell_building',
                            property_id: tile.id,
                          })
                        }
                      >
                        {t('sellBuilding')}
                      </Button>
                    </>
                  )}
                </Stack>
                {tile.kind === 'property' && !build?.allowed && build?.reason && (
                  <Typography variant="body2" color="warning.light" mt={1}>
                    {t('nextImprovementBlocked', {
                      reason: t(`propertyRule.${build.reason}`),
                    })}
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{
          px: 2.25,
          py: 1.25,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        {showOwnerTrade && ownerId && owner && (
          <Button
            variant="contained"
            color="secondary"
            startIcon={<SwapHorizRoundedIcon />}
            disabled={busy || !canStartOwnerTrade}
            onClick={() => {
              onClose()
              onTrade?.(ownerId, tile.id)
            }}
          >
            {tradeAvailable
              ? t('tradeWithOwner', { player: owner.display_name })
              : t('propertyNotAvailableForTrade')}
          </Button>
        )}
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1, borderRadius: '12px' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Paper>
  )
}

function buildingLevelLabel(
  t: ReturnType<typeof useTranslation>['t'],
  level: number,
): string {
  if (level === 5) return t('hotel')
  if (level > 0) return t('houseCount', { count: level })
  return t('noBuildings')
}

function rentLevelLabel(
  t: ReturnType<typeof useTranslation>['t'],
  tile: TileDefinition,
  index: number,
): string {
  if (tile.kind === 'property') {
    if (index === 0) return t('noBuildings')
    if (index === 5) return t('hotel')
    return t('houseCount', { count: index })
  }
  return t('ownedPropertyCount', { count: index + 1 })
}
