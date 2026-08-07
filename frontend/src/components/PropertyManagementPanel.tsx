import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ContentPack,
  GameCommand,
  GameState,
  TileDefinition,
  User,
} from '../types'
import { BoardTileDialog } from './BoardTileDialog'
import { playerColors } from './gameColors'
import {
  buildGroupRoundAvailability,
  sellGroupRoundAvailability,
} from './propertyRules'
import { defaultTileColor } from './tilePresentation'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
  embedded?: boolean
}

type PropertyFilter = 'all' | 'available' | 'mine' | 'mortgaged'

interface PropertyAlbumGroup {
  id: string
  groupId: string | null
  name: string
  accent: string
  tiles: TileDefinition[]
}

export function PropertyManagementPanel({
  game,
  pack,
  user,
  busy,
  onCommand,
  embedded = false,
}: Props) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<PropertyFilter>('all')
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const assetTiles = pack.board.tiles.filter(
    (tile) =>
      tile.price != null &&
      tile.purchasable !== false &&
      ['property', 'transport', 'utility'].includes(tile.kind),
  )
  const groups = propertyAlbumGroups(pack, assetTiles, t)
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      visibleTiles: group.tiles.filter((tile) => {
        const ownerId = game.owners[tile.id]
        if (filter === 'available') return !ownerId
        if (filter === 'mine') return ownerId === user.id
        if (filter === 'mortgaged') {
          return game.mortgaged_property_ids.includes(tile.id)
        }
        return true
      }),
    }))
    .filter((group) => group.visibleTiles.length > 0)
  const selectedTile =
    pack.board.tiles.find((tile) => tile.id === selectedTileId) ?? null

  return (
    <Box>
      {!embedded && <Divider sx={{ mb: 2 }} />}
      <Stack spacing={0.35} mb={1.5}>
        <Typography fontWeight={850}>
          <ApartmentRoundedIcon
            fontSize="small"
            sx={{ verticalAlign: 'middle', mr: 0.75 }}
          />
          {t('propertyAlbum')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('propertyAlbumHelp')}
        </Typography>
      </Stack>

      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={filter}
        onChange={(_, value: PropertyFilter | null) => {
          if (value) setFilter(value)
        }}
        aria-label={t('propertyFilter')}
        sx={{ mb: 1.5 }}
      >
        <ToggleButton value="all">{t('allProperties')}</ToggleButton>
        <ToggleButton value="available">{t('availableProperties')}</ToggleButton>
        <ToggleButton value="mine">{t('myProperties')}</ToggleButton>
        <ToggleButton value="mortgaged">{t('mortgagedProperties')}</ToggleButton>
      </ToggleButtonGroup>

      {visibleGroups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary" variant="body2">
            {t('propertyAlbumEmpty')}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {visibleGroups.map((group) => {
            const ownedByUser = group.tiles.filter(
              (tile) => game.owners[tile.id] === user.id,
            ).length
            const complete =
              group.tiles.length > 1 && ownedByUser === group.tiles.length
            const buildRound = group.groupId
              ? buildGroupRoundAvailability(game, group.tiles, user.id)
              : null
            const sellRound = group.groupId
              ? sellGroupRoundAvailability(game, pack, group.tiles, user.id)
              : null
            return (
              <Paper
                key={group.id}
                variant="outlined"
                sx={{
                  overflow: 'hidden',
                  borderColor: complete
                    ? `${group.accent}99`
                    : 'rgba(255,255,255,.1)',
                  boxShadow: complete ? `0 0 18px ${group.accent}1f` : 'none',
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    px: 1.25,
                    py: 0.9,
                    borderTop: `5px solid ${group.accent}`,
                    bgcolor: `${group.accent}0d`,
                  }}
                >
                  <Box minWidth={0}>
                    <Typography fontWeight={850} noWrap>
                      {group.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('groupProgress', {
                        owned: ownedByUser,
                        total: group.tiles.length,
                      })}
                    </Typography>
                  </Box>
                  {complete && group.groupId && (
                    <Chip
                      size="small"
                      color="success"
                      label={t('completeGroup')}
                    />
                  )}
                </Stack>

                {complete && group.groupId && (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ px: 1.25, pb: 1, bgcolor: `${group.accent}0d` }}
                  >
                    <Tooltip
                      title={
                        buildRound?.reason
                          ? t(`propertyRule.${buildRound.reason}`)
                          : ''
                      }
                    >
                      <span style={{ flex: 1 }}>
                        <Button
                          fullWidth
                          size="small"
                          variant="contained"
                          disabled={busy || !buildRound?.allowed}
                          onClick={() =>
                            void onCommand({
                              action: 'build_group_round',
                              group_id: group.groupId as string,
                            })
                          }
                        >
                          {t('buildGroupRound', {
                            amount: buildRound?.amount ?? 0,
                          })}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={
                        sellRound?.reason
                          ? t(`propertyRule.${sellRound.reason}`)
                          : ''
                      }
                    >
                      <span style={{ flex: 1 }}>
                        <Button
                          fullWidth
                          size="small"
                          variant="outlined"
                          disabled={busy || !sellRound?.allowed}
                          onClick={() =>
                            void onCommand({
                              action: 'sell_group_round',
                              group_id: group.groupId as string,
                            })
                          }
                        >
                          {t('sellGroupRound', {
                            amount: sellRound?.amount ?? 0,
                          })}
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                )}

                <Stack divider={<Divider flexItem />}>
                  {group.visibleTiles.map((tile) => {
                    const position = pack.board.tiles.findIndex(
                      (candidate) => candidate.id === tile.id,
                    )
                    const ownerId = game.owners[tile.id]
                    const ownerIndex = game.players.findIndex(
                      (player) => player.user_id === ownerId,
                    )
                    const owner = ownerIndex >= 0 ? game.players[ownerIndex] : null
                    const mortgaged = game.mortgaged_property_ids.includes(tile.id)
                    const level = game.building_levels[tile.id] ?? 0
                    const name = pack.messages[tile.name_key] ?? tile.id
                    return (
                      <Tooltip key={tile.id} title={t('clickForTileDetails')}>
                        <ButtonBase
                          onClick={() => setSelectedTileId(tile.id)}
                          aria-label={`${name}. ${t('clickForTileDetails')}`}
                          sx={{
                            width: '100%',
                            display: 'grid',
                            gridTemplateColumns: '6px minmax(0, 1fr) auto',
                            alignItems: 'stretch',
                            textAlign: 'left',
                            opacity: mortgaged ? 0.72 : 1,
                            backgroundImage: mortgaged
                              ? 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,.025) 8px, rgba(255,255,255,.025) 12px)'
                              : 'none',
                            '&:hover': { bgcolor: `${group.accent}12` },
                            '&:focus-visible': {
                              outline: `2px solid ${group.accent}`,
                              outlineOffset: -2,
                            },
                          }}
                        >
                          <Box sx={{ bgcolor: group.accent }} />
                          <Box sx={{ minWidth: 0, px: 1.1, py: 0.9 }}>
                            <Typography variant="body2" fontWeight={800} noWrap>
                              {name}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.65}
                              alignItems="center"
                              mt={0.25}
                              minWidth={0}
                            >
                              {owner && (
                                <Box
                                  aria-hidden
                                  sx={{
                                    width: 7,
                                    height: 7,
                                    flex: '0 0 auto',
                                    borderRadius: '50%',
                                    bgcolor:
                                      playerColors[ownerIndex % playerColors.length],
                                  }}
                                />
                              )}
                              <Typography
                                variant="caption"
                                color={owner ? 'text.secondary' : 'success.light'}
                                noWrap
                              >
                                {owner ? owner.display_name : t('unownedProperty')}
                              </Typography>
                              <Typography variant="caption" color="text.disabled">
                                · {t('propertyBoardPosition', { position: position + 1 })}
                              </Typography>
                            </Stack>
                          </Box>
                          <Stack
                            alignItems="flex-end"
                            justifyContent="center"
                            spacing={0.35}
                            sx={{ px: 1.1, py: 0.75 }}
                          >
                            <Typography variant="caption" fontWeight={850} noWrap>
                              {propertyValueLabel(
                                tile,
                                ownerId,
                                level,
                                pack,
                                game,
                                t,
                              )}
                            </Typography>
                            {mortgaged ? (
                              <Typography
                                variant="caption"
                                color="warning.light"
                                fontWeight={800}
                              >
                                {t('mortgaged')}
                              </Typography>
                            ) : (
                              <BuildingMarker
                                level={level}
                                label={buildingLevelLabel(t, level)}
                                accent={group.accent}
                              />
                            )}
                          </Stack>
                        </ButtonBase>
                      </Tooltip>
                    )
                  })}
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      )}

      <BoardTileDialog
        tile={selectedTile}
        pack={pack}
        game={game}
        currentUserId={user.id}
        busy={busy}
        onClose={() => setSelectedTileId(null)}
        onSelectTile={setSelectedTileId}
        onCommand={onCommand}
      />
    </Box>
  )
}

function propertyAlbumGroups(
  pack: ContentPack,
  tiles: TileDefinition[],
  t: ReturnType<typeof useTranslation>['t'],
): PropertyAlbumGroup[] {
  const groups = new Map<string, PropertyAlbumGroup>()
  tiles.forEach((tile) => {
    const groupDefinition = pack.board.groups?.find(
      (candidate) => candidate.id === tile.group,
    )
    const id = tile.group ? `group:${tile.group}` : `kind:${tile.kind}`
    const current = groups.get(id)
    if (current) {
      current.tiles.push(tile)
      return
    }
    groups.set(id, {
      id,
      groupId: tile.kind === 'property' ? (tile.group ?? null) : null,
      name:
        pack.messages[groupDefinition?.name_key ?? ''] ??
        pack.messages[tile.group ?? ''] ??
        tile.group ??
        t(`tileKind.${tile.kind}`),
      accent:
        groupDefinition?.color ?? tile.color ?? defaultTileColor(tile.kind),
      tiles: [tile],
    })
  })
  return [...groups.values()]
}

function propertyValueLabel(
  tile: TileDefinition,
  ownerId: string | undefined,
  level: number,
  pack: ContentPack,
  game: GameState,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (!ownerId) return t('purchasePrice', { amount: tile.price ?? 0 })
  if (tile.kind === 'utility') {
    const ownedUtilities = pack.board.tiles.filter(
      (candidate) =>
        candidate.kind === 'utility' && game.owners[candidate.id] === ownerId,
    ).length
    const multiplier =
      tile.rent_multipliers?.[Math.max(ownedUtilities - 1, 0)] ??
      tile.rent_multipliers?.[0]
    return multiplier != null
      ? t('propertyDiceRent', { multiplier })
      : t('purchasePrice', { amount: tile.price ?? 0 })
  }
  if (tile.kind === 'transport') {
    const ownedTransports = pack.board.tiles.filter(
      (candidate) =>
        candidate.kind === 'transport' && game.owners[candidate.id] === ownerId,
    ).length
    const rent =
      tile.rent_levels?.[Math.max(ownedTransports - 1, 0)] ?? tile.base_rent
    return rent != null
      ? t('propertyRent', { amount: rent })
      : t('purchasePrice', { amount: tile.price ?? 0 })
  }
  let rent = tile.rent_levels?.[level] ?? tile.base_rent
  if (rent != null && level === 0 && tile.group) {
    const groupTiles = pack.board.tiles.filter(
      (candidate) =>
        candidate.kind === 'property' && candidate.group === tile.group,
    )
    const completeUnmortgagedGroup =
      groupTiles.every((candidate) => game.owners[candidate.id] === ownerId) &&
      !groupTiles.some((candidate) =>
        game.mortgaged_property_ids.includes(candidate.id),
      )
    if (completeUnmortgagedGroup) {
      rent *= pack.manifest.monopoly_rent_multiplier
    }
  }
  return rent != null
    ? t('propertyRent', { amount: rent })
    : t('purchasePrice', { amount: tile.price ?? 0 })
}

function BuildingMarker({
  level,
  label,
  accent,
}: {
  level: number
  label: string
  accent: string
}) {
  if (level <= 0) return null
  if (level >= 5) {
    return (
      <Box
        aria-label={label}
        sx={{
          width: 22,
          height: 9,
          borderRadius: '2px 2px 1px 1px',
          bgcolor: '#ff5a70',
          boxShadow: '0 0 8px rgba(255,90,112,.45)',
        }}
      />
    )
  }
  return (
    <Stack direction="row" spacing={0.25} aria-label={label}>
      {Array.from({ length: level }, (_, index) => (
        <Box
          key={index}
          sx={{
            width: 6,
            height: 7,
            borderRadius: '1px 1px 0 0',
            bgcolor: accent,
            boxShadow: `0 0 5px ${accent}55`,
          }}
        />
      ))}
    </Stack>
  )
}

function buildingLevelLabel(
  t: ReturnType<typeof useTranslation>['t'],
  level: number,
): string {
  if (level >= 5) return t('hotel')
  if (level > 0) return t('houseCount', { count: level })
  return t('noBuildings')
}
