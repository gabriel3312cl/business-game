import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameCommand, GameState, User } from '../types'

interface Props {
  game: GameState
  pack: ContentPack
  user: User
  busy: boolean
  onCommand: (command: GameCommand) => Promise<boolean>
  embedded?: boolean
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
  const propertyIds = Object.entries(game.owners)
    .filter(([, ownerId]) => ownerId === user.id)
    .map(([propertyId]) => propertyId)

  if (game.status !== 'playing' || propertyIds.length === 0) return null

  return (
    <Box>
      {!embedded && <Divider sx={{ mb: 2 }} />}
      <Typography fontWeight={800} sx={{ mb: 1 }}>
        <ApartmentRoundedIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
        {t('propertyManagement')}
      </Typography>
      <Stack spacing={1}>
        {propertyIds.map((propertyId) => {
          const tile = pack.board.tiles.find((candidate) => candidate.id === propertyId)
          if (!tile) return null
          const mortgaged = game.mortgaged_property_ids.includes(propertyId)
          const level = game.building_levels[propertyId] ?? 0
          const levelLabel =
            level === 5
              ? t('hotel')
              : level > 0
                ? t('houseCount', { count: level })
                : t('noBuildings')
          return (
            <Paper key={propertyId} variant="outlined" sx={{ p: 1.5 }}>
              <Stack
                direction="column"
                spacing={1}
              >
                <Box sx={{ flexGrow: 1 }}>
                  <Typography fontWeight={700}>
                    {pack.messages[tile.name_key] ?? propertyId}
                  </Typography>
                  <Stack direction="row" spacing={0.7} mt={0.5}>
                    <Chip
                      size="small"
                      color={mortgaged ? 'warning' : 'default'}
                      label={mortgaged ? t('mortgaged') : t('activeProperty')}
                    />
                    {tile.kind === 'property' && (
                      <Chip
                        size="small"
                        icon={<HomeWorkRoundedIcon />}
                        label={levelLabel}
                      />
                    )}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {mortgaged ? (
                    <Button
                      size="small"
                      disabled={busy || game.active_debt !== null}
                      onClick={() =>
                        void onCommand({
                          action: 'unmortgage_property',
                          property_id: propertyId,
                        })
                      }
                    >
                      {t('unmortgage')}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      disabled={busy || level > 0}
                      onClick={() =>
                        void onCommand({
                          action: 'mortgage_property',
                          property_id: propertyId,
                        })
                      }
                    >
                      {t('mortgageFor', {
                        amount: tile.mortgage_value ?? 0,
                      })}
                    </Button>
                  )}
                  {tile.kind === 'property' && (
                    <>
                      <Button
                        size="small"
                        disabled={
                          busy ||
                          mortgaged ||
                          level >= 5 ||
                          game.active_debt !== null
                        }
                        onClick={() =>
                          void onCommand({
                            action: 'build_property',
                            property_id: propertyId,
                          })
                        }
                      >
                        {level === 4
                          ? t('buyHotel', {
                              amount: tile.hotel_cost ?? tile.build_cost ?? 0,
                            })
                          : t('buyHouse', { amount: tile.build_cost ?? 0 })}
                      </Button>
                      <Button
                        size="small"
                        disabled={busy || level === 0}
                        onClick={() =>
                          void onCommand({
                            action: 'sell_building',
                            property_id: propertyId,
                          })
                        }
                      >
                        {t('sellBuilding')}
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}
