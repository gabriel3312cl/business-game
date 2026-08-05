import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import type { TileIcon, TileIconBackground } from '../types'
import {
  defaultTileColor,
  defaultTileIcon,
  tileIconBackgroundOptions,
  tileIconBackgroundStyle,
  tileIconComponent,
  tileIconOptions,
} from '../components/tilePresentation'
import {
  changeTileKind,
  changeTilePurchasable,
  createCard,
  createPropertyGroup,
  perimeterTileCount,
  resizeBoard,
  textForLocale,
  tileKindLabel,
} from './defaults'
import {
  EffectEditor,
  LocalizedTextFields,
  NumberField,
} from './EditorControls'
import type {
  BoardCardEffect,
  BoardCardDraft,
  BoardDeckDraft,
  BoardDraftDocument,
  BoardEditorStep,
  BoardTileDraft,
  EditableTileKind,
  PropertyGroupDraft,
} from './types'

export function EditorPanel({
  step,
  document,
  locale,
  selectedTileId,
  onSelectTile,
  onChange,
}: {
  step: BoardEditorStep
  document: BoardDraftDocument
  locale: string
  selectedTileId?: string
  onSelectTile: (tileId: string) => void
  onChange: (document: BoardDraftDocument) => void
}) {
  if (step === 'information') {
    return <InformationPanel document={document} onChange={onChange} />
  }
  if (step === 'economy') {
    return <EconomyPanel document={document} onChange={onChange} />
  }
  if (step === 'groups') {
    return <GroupsPanel document={document} onChange={onChange} />
  }
  if (step === 'tiles') {
    return (
      <TilesPanel
        document={document}
        locale={locale}
        selectedTileId={selectedTileId}
        onSelectTile={onSelectTile}
        onChange={onChange}
      />
    )
  }
  if (step === 'decks') {
    return <DecksPanel document={document} locale={locale} onChange={onChange} />
  }
  return null
}

function InformationPanel({
  document,
  onChange,
}: {
  document: BoardDraftDocument
  onChange: (document: BoardDraftDocument) => void
}) {
  const [localeCode, setLocaleCode] = useState('')
  const [pendingSideLength, setPendingSideLength] = useState(document.side_length)
  const [shrinkTarget, setShrinkTarget] = useState<number | null>(null)
  const info = document.information
  const changeInfo = (change: Partial<typeof info>) =>
    onChange({ ...document, information: { ...info, ...change } })
  useEffect(() => {
    setPendingSideLength(document.side_length)
  }, [document.side_length])
  const requestResize = (sideLength: number) => {
    const normalized = Math.max(5, Math.min(30, Math.round(sideLength)))
    if (normalized === document.side_length) return
    if (normalized < document.side_length) {
      setShrinkTarget(normalized)
      return
    }
    onChange(resizeBoard(document, normalized))
  }

  return (
    <PanelSection
      title="Información y tamaño"
      description="El tamaño indica cuántas casillas tiene cada lado. Las cuatro esquinas se comparten."
    >
      <LocalizedTextFields
        label="Nombre"
        locales={info.locales}
        value={info.name}
        onChange={(name) => changeInfo({ name })}
      />
      <LocalizedTextFields
        label="Descripción"
        locales={info.locales}
        value={info.description}
        multiline
        onChange={(description) => changeInfo({ description })}
      />
      <Divider />
      <Stack spacing={1}>
        <Typography fontWeight={800}>Tamaño del tablero</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Slider
            aria-label="Casillas por lado"
            min={5}
            max={30}
            step={1}
            value={pendingSideLength}
            valueLabelDisplay="auto"
            onChange={(_, value) => setPendingSideLength(value as number)}
            onChangeCommitted={(_, value) => requestResize(value as number)}
          />
          <TextField
            type="number"
            size="small"
            label="N"
            value={pendingSideLength}
            onChange={(event) => setPendingSideLength(Number(event.target.value))}
            slotProps={{ htmlInput: { min: 5, max: 30 } }}
            sx={{ width: 95, flexShrink: 0 }}
          />
          <Button
            variant="outlined"
            disabled={
              pendingSideLength < 5 ||
              pendingSideLength > 30 ||
              pendingSideLength === document.side_length
            }
            onClick={() => requestResize(pendingSideLength)}
          >
            Aplicar
          </Button>
        </Stack>
        <Alert severity="info">
          {document.side_length} × {document.side_length} genera{' '}
          {perimeterTileCount(document.side_length)} casillas jugables: {document.side_length}{' '}
          por lado, con esquinas compartidas.
        </Alert>
      </Stack>
      <Divider />
      <Typography fontWeight={800}>Idiomas del contenido</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {info.locales.map((item) => (
          <Chip
            key={item}
            label={item.toUpperCase()}
            color={item === info.default_locale ? 'secondary' : 'default'}
            onDelete={
              info.locales.length > 1 && item !== info.default_locale
                ? () => {
                    const locales = info.locales.filter((locale) => locale !== item)
                    changeInfo({
                      locales,
                      name: removeLocale(info.name, item),
                      description: removeLocale(info.description, item),
                    })
                  }
                : undefined
            }
          />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          size="small"
          label="Código de idioma (ej. pt)"
          value={localeCode}
          onChange={(event) =>
            setLocaleCode(event.target.value.toLowerCase().replace(/[^a-z-]/g, ''))
          }
        />
        <Button
          variant="outlined"
          disabled={!localeCode || info.locales.includes(localeCode)}
          onClick={() => {
            changeInfo({
              locales: [...info.locales, localeCode],
              name: { ...info.name, [localeCode]: '' },
              description: { ...info.description, [localeCode]: '' },
            })
            setLocaleCode('')
          }}
        >
          Agregar idioma
        </Button>
        <TextField
          select
          size="small"
          label="Idioma predeterminado"
          value={info.default_locale}
          onChange={(event) => changeInfo({ default_locale: event.target.value })}
          sx={{ minWidth: 190 }}
        >
          {info.locales.map((item) => (
            <MenuItem key={item} value={item}>
              {item.toUpperCase()}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <NumberField
          label="Jugadores mínimos"
          value={info.min_players}
          min={2}
          max={12}
          onChange={(min_players) => changeInfo({ min_players })}
        />
        <NumberField
          label="Jugadores máximos"
          value={info.max_players}
          min={2}
          max={12}
          onChange={(max_players) => changeInfo({ max_players })}
        />
      </Stack>
      <Dialog
        open={shrinkTarget != null}
        onClose={() => {
          setShrinkTarget(null)
          setPendingSideLength(document.side_length)
        }}
      >
        <DialogTitle>¿Reducir el tablero?</DialogTitle>
        <DialogContent>
          Reducirlo a {shrinkTarget} × {shrinkTarget} eliminará{' '}
          {shrinkTarget == null
            ? 0
            : document.tiles.length - perimeterTileCount(shrinkTarget)}{' '}
          casillas del recorrido. Revisa después los destinos de tarjetas y los
          grupos de propiedades.
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShrinkTarget(null)
              setPendingSideLength(document.side_length)
            }}
          >
            Cancelar
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              if (shrinkTarget == null) return
              onChange(resizeBoard(document, shrinkTarget))
              setShrinkTarget(null)
            }}
          >
            Reducir y eliminar casillas
          </Button>
        </DialogActions>
      </Dialog>
    </PanelSection>
  )
}

function EconomyPanel({
  document,
  onChange,
}: {
  document: BoardDraftDocument
  onChange: (document: BoardDraftDocument) => void
}) {
  const economy = document.economy
  const change = (next: Partial<typeof economy>) =>
    onChange({ ...document, economy: { ...economy, ...next } })

  return (
    <PanelSection
      title="Economía y reglas"
      description="Estos valores serán la base de todas las partidas creadas con esta versión."
    >
      <FieldGrid>
        <NumberField
          label="Saldo inicial"
          value={economy.starting_balance}
          min={1}
          onChange={(starting_balance) => change({ starting_balance })}
        />
        <NumberField
          label="Sueldo al cruzar Salida"
          value={economy.pass_start_salary}
          min={0}
          onChange={(pass_start_salary) => change({ pass_start_salary })}
        />
        <NumberField
          label="Interés hipotecario (%)"
          value={economy.mortgage_interest_percent}
          min={0}
          max={100}
          onChange={(mortgage_interest_percent) =>
            change({ mortgage_interest_percent })
          }
        />
        <NumberField
          label="Venta de construcción (%)"
          value={economy.building_sell_percent}
          min={0}
          max={100}
          onChange={(building_sell_percent) => change({ building_sell_percent })}
        />
        <NumberField
          label="Multiplicador por grupo completo"
          value={economy.monopoly_rent_multiplier}
          min={1}
          max={10}
          onChange={(monopoly_rent_multiplier) =>
            change({ monopoly_rent_multiplier })
          }
        />
        <NumberField
          label="Multa de cárcel"
          value={economy.jail_fine}
          min={0}
          onChange={(jail_fine) => change({ jail_fine })}
        />
        <NumberField
          label="Intentos máximos en cárcel"
          value={economy.jail_max_failed_rolls}
          min={1}
          max={10}
          onChange={(jail_max_failed_rolls) => change({ jail_max_failed_rolls })}
        />
        <NumberField
          label="Dobles consecutivos máximos"
          value={economy.max_consecutive_doubles}
          min={1}
          max={10}
          onChange={(max_consecutive_doubles) =>
            change({ max_consecutive_doubles })
          }
        />
        <NumberField
          label="Casas del banco"
          value={economy.house_supply}
          min={0}
          max={1000}
          onChange={(house_supply) => change({ house_supply })}
        />
        <NumberField
          label="Hoteles del banco"
          value={economy.hotel_supply}
          min={0}
          max={1000}
          onChange={(hotel_supply) => change({ hotel_supply })}
        />
      </FieldGrid>
      <Divider />
      <Typography fontWeight={800}>Reglas predeterminadas</Typography>
      {(
        [
          [
            'auction_unpurchased_properties',
            'Subastar propiedades no compradas',
          ],
          ['free_parking_jackpot', 'Acumular impuestos en Parada libre'],
          ['double_salary_on_start', 'Sueldo doble al caer en Salida'],
        ] as const
      ).map(([key, label]) => (
        <FormControlLabel
          key={key}
          control={
            <Checkbox
              checked={economy.default_rules[key]}
              onChange={(event) =>
                change({
                  default_rules: {
                    ...economy.default_rules,
                    [key]: event.target.checked,
                  },
                })
              }
            />
          }
          label={label}
        />
      ))}
    </PanelSection>
  )
}

function GroupsPanel({
  document,
  onChange,
}: {
  document: BoardDraftDocument
  onChange: (document: BoardDraftDocument) => void
}) {
  const updateGroup = (id: string, change: Partial<PropertyGroupDraft>) => {
    const groups = document.groups.map((group) =>
      group.id === id ? { ...group, ...change } : group,
    )
    const tiles = document.tiles.map((tile) =>
      tile.group_id === id
        ? {
            ...tile,
            ...(change.house_cost == null
              ? {}
              : { build_cost: change.house_cost }),
            ...(change.hotel_cost == null
              ? {}
              : { hotel_cost: change.hotel_cost }),
            ...(change.color == null ? {} : { color: undefined }),
          }
        : tile,
    )
    onChange({ ...document, groups, tiles })
  }

  return (
    <PanelSection
      title="Grupos de propiedades"
      description="El color identifica el grupo. Las rentas se configuran en cada propiedad."
      action={
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() =>
            onChange({
              ...document,
              groups: [
                ...document.groups,
                createPropertyGroup(document.groups.length),
              ],
            })
          }
        >
          Nuevo grupo
        </Button>
      }
    >
      {document.groups.map((group) => {
        const tileCount = document.tiles.filter(
          (tile) => tile.group_id === group.id,
        ).length
        return (
          <Paper key={group.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  component="input"
                  type="color"
                  aria-label={`Color de ${textForLocale(group.name, 'es')}`}
                  value={group.color}
                  onChange={(event) =>
                    updateGroup(group.id, { color: event.target.value })
                  }
                  sx={{
                    width: 42,
                    height: 42,
                    border: 0,
                    p: 0,
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                  }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography fontWeight={800}>
                    {textForLocale(
                      group.name,
                      document.information.default_locale,
                    ) || group.id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tileCount} propiedades
                  </Typography>
                </Box>
                <IconButton
                  color="error"
                  aria-label={`Eliminar grupo ${group.id}`}
                  onClick={() =>
                    onChange({
                      ...document,
                      groups: document.groups.filter((item) => item.id !== group.id),
                      tiles: document.tiles.map((tile) =>
                        tile.group_id === group.id
                          ? { ...tile, group_id: undefined, color: undefined }
                          : tile,
                      ),
                    })
                  }
                >
                  <DeleteOutlineRoundedIcon />
                </IconButton>
              </Stack>
              <LocalizedTextFields
                label="Nombre del grupo"
                locales={document.information.locales}
                value={group.name}
                onChange={(name) => updateGroup(group.id, { name })}
              />
              <NumberField
                label="Costo por casa para el grupo"
                value={group.house_cost}
                min={0}
                onChange={(house_cost) => updateGroup(group.id, { house_cost })}
              />
              <NumberField
                label="Costo de hotel para el grupo"
                value={group.hotel_cost}
                min={0}
                onChange={(hotel_cost) => updateGroup(group.id, { hotel_cost })}
              />
            </Stack>
          </Paper>
        )
      })}
    </PanelSection>
  )
}

function TilesPanel({
  document,
  locale,
  selectedTileId,
  onSelectTile,
  onChange,
}: {
  document: BoardDraftDocument
  locale: string
  selectedTileId?: string
  onSelectTile: (tileId: string) => void
  onChange: (document: BoardDraftDocument) => void
}) {
  const selectedIndex = Math.max(
    0,
    document.tiles.findIndex((tile) => tile.id === selectedTileId),
  )
  const tile = document.tiles[selectedIndex]
  useEffect(() => {
    if (!selectedTileId && document.tiles[0]) onSelectTile(document.tiles[0].id)
  }, [document.tiles, onSelectTile, selectedTileId])
  if (!tile) return null

  const update = (change: Partial<BoardTileDraft>) =>
    onChange({
      ...document,
      tiles: document.tiles.map((item, index) =>
        index === selectedIndex ? { ...item, ...change } : item,
      ),
    })
  const replace = (nextTile: BoardTileDraft) =>
    onChange({
      ...document,
      tiles: document.tiles.map((item, index) =>
        index === selectedIndex ? nextTile : item,
      ),
    })
  const move = (direction: -1 | 1) => {
    const nextIndex = selectedIndex + direction
    if (nextIndex < 0 || nextIndex >= document.tiles.length) return
    const tiles = [...document.tiles]
    ;[tiles[selectedIndex], tiles[nextIndex]] = [
      tiles[nextIndex],
      tiles[selectedIndex],
    ]
    onChange({ ...document, tiles })
  }
  const renameTile = (id: string) => {
    const previousId = tile.id
    const replaceTarget = (effect: BoardCardEffect): BoardCardEffect =>
      effect.type === 'move_to' && effect.tile_id === previousId
        ? { ...effect, tile_id: id }
        : effect
    onChange({
      ...document,
      tiles: document.tiles.map((item, index) => ({
        ...(index === selectedIndex ? { ...item, id } : item),
        landing_effects: item.landing_effects?.map(replaceTarget),
      })),
      decks: document.decks.map((deck) => ({
        ...deck,
        cards: deck.cards.map((card) => ({
          ...card,
          effects: card.effects.map(replaceTarget),
        })),
      })),
    })
    onSelectTile(id)
  }
  const supportsLandingEffects =
    tile.kind === 'start' ||
    tile.kind === 'jail' ||
    tile.kind === 'free' ||
    ((tile.kind === 'transport' || tile.kind === 'utility') &&
      tile.purchasable === false)
  const SelectedIcon = tileIconComponent(tile.kind, tile.icon)
  const accent = tile.color ?? defaultTileColor(tile.kind)

  return (
    <PanelSection
      title="Casillas y recorrido"
      description="Selecciona una casilla en el tablero o en la lista. El orden sigue el perímetro desde Salida."
    >
      <Stack direction="row" spacing={0.75} alignItems="center">
        <TextField
          select
          fullWidth
          size="small"
          label="Casilla seleccionada"
          value={tile.id}
          onChange={(event) => onSelectTile(event.target.value)}
        >
          {document.tiles.map((item, index) => (
            <MenuItem key={item.id} value={item.id}>
              {index + 1}. {textForLocale(item.name, locale)}
            </MenuItem>
          ))}
        </TextField>
        <IconButton
          aria-label="Mover casilla una posición antes"
          disabled={selectedIndex === 0}
          onClick={() => move(-1)}
        >
          <KeyboardArrowUpRoundedIcon />
        </IconButton>
        <IconButton
          aria-label="Mover casilla una posición después"
          disabled={selectedIndex === document.tiles.length - 1}
          onClick={() => move(1)}
        >
          <KeyboardArrowDownRoundedIcon />
        </IconButton>
      </Stack>
      <Alert severity="info">
        Posición {selectedIndex + 1} de {document.tiles.length}. Al reordenar se
        mantiene el identificador estable de la casilla.
      </Alert>
      <TextField
        fullWidth
        size="small"
        label="Identificador técnico"
        value={tile.id}
        onChange={(event) => renameTile(normalizeId(event.target.value))}
        helperText="Letras minúsculas, números, guion o guion bajo."
      />
      <TextField
        select
        fullWidth
        size="small"
        label="Tipo de casilla"
        value={tile.kind}
        onChange={(event) => {
          const kind = event.target.value as EditableTileKind
          replace(changeTileKind(tile, kind, document))
        }}
      >
        {(
          [
            'start',
            'property',
            'tax',
            'card',
            'jail',
            'go_to_jail',
            'free',
            'transport',
            'utility',
          ] as EditableTileKind[]
        ).map((kind) => (
          <MenuItem key={kind} value={kind}>
            {tileKindLabel(kind)}
          </MenuItem>
        ))}
      </TextField>
      <LocalizedTextFields
        label="Nombre de la casilla"
        locales={document.information.locales}
        value={tile.name}
        onChange={(name) => update({ name })}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          select
          fullWidth
          size="small"
          label="Icono"
          value={tile.icon ?? defaultTileIcon(tile.kind)}
          onChange={(event) => update({ icon: event.target.value as TileIcon })}
        >
          {tileIconOptions.map((option) => {
            const OptionIcon = tileIconComponent(tile.kind, option.value)
            return (
              <MenuItem key={option.value} value={option.value}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <OptionIcon fontSize="small" />
                  <span>{option.label}</span>
                </Stack>
              </MenuItem>
            )
          })}
        </TextField>
        <TextField
          select
          fullWidth
          size="small"
          label="Fondo del icono"
          value={tile.icon_background ?? 'circle'}
          onChange={(event) =>
            update({ icon_background: event.target.value as TileIconBackground })
          }
        >
          {tileIconBackgroundOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <Box
          aria-label="Vista previa del icono"
          sx={{
            width: 40,
            height: 40,
            flex: '0 0 40px',
            display: 'grid',
            placeItems: 'center',
            alignSelf: { xs: 'center', sm: 'flex-start' },
            ...tileIconBackgroundStyle(tile.icon_background, accent),
          }}
        >
          <SelectedIcon fontSize="small" />
        </Box>
      </Stack>

      {tile.kind === 'property' && (
        <>
          <TextField
            select
            fullWidth
            size="small"
            label="Grupo"
            value={tile.group_id ?? ''}
            onChange={(event) => {
              const group = document.groups.find(
                (item) => item.id === event.target.value,
              )
              update({
                group_id: event.target.value || undefined,
                color: undefined,
                build_cost: group?.house_cost ?? tile.build_cost,
                hotel_cost: group?.hotel_cost ?? tile.hotel_cost,
              })
            }}
          >
            <MenuItem value="">Sin grupo</MenuItem>
            {document.groups.map((group) => (
              <MenuItem key={group.id} value={group.id}>
                {textForLocale(group.name, locale)}
              </MenuItem>
            ))}
          </TextField>
          <PropertyEconomyFields tile={tile} onChange={update} />
        </>
      )}
      {(tile.kind === 'transport' || tile.kind === 'utility') && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={tile.purchasable !== false}
                onChange={(event) =>
                  replace(changeTilePurchasable(tile, event.target.checked))
                }
              />
            }
            label="Se puede comprar"
          />
          {tile.purchasable !== false && (
            <>
              <FieldGrid>
                <NumberField
                  label="Precio"
                  value={tile.price ?? 0}
                  min={0}
                  onChange={(price) => update({ price })}
                />
                <NumberField
                  label="Valor hipotecario"
                  value={tile.mortgage_value ?? 0}
                  min={0}
                  onChange={(mortgage_value) => update({ mortgage_value })}
                />
                {tile.kind === 'utility' && (
                  <NumberField
                    label="Renta base"
                    value={tile.base_rent ?? 0}
                    min={0}
                    onChange={(base_rent) => update({ base_rent })}
                  />
                )}
              </FieldGrid>
              {tile.kind === 'transport' && (
                <FieldGrid>
                  {['1 transporte', '2 transportes', '3 transportes', '4 transportes'].map(
                    (label, index) => (
                      <NumberField
                        key={label}
                        label={`Renta con ${label}`}
                        value={tile.rent_levels?.[index] ?? 0}
                        min={0}
                        onChange={(value) => {
                          const current = tile.rent_levels ?? [0, 0, 0, 0]
                          update({
                            ...(index === 0 ? { base_rent: value } : {}),
                            rent_levels: Array.from(
                              { length: Math.max(4, current.length) },
                              (_, itemIndex) =>
                                itemIndex === index
                                  ? value
                                  : current[itemIndex] ?? 0,
                            ),
                          })
                        }}
                      />
                    ),
                  )}
                </FieldGrid>
              )}
              {tile.kind === 'utility' && (
                <FieldGrid>
                  {['Un servicio', 'Dos servicios', 'Tres servicios'].map((label, index) => (
                    <NumberField
                      key={label}
                      label={`${label}: multiplicador de dados`}
                      value={tile.rent_multipliers?.[index] ?? 0}
                      min={0}
                      onChange={(value) => {
                        const current = tile.rent_multipliers ?? [4, 10]
                        update({
                          rent_multipliers: Array.from(
                            { length: 2 },
                            (_, itemIndex) =>
                              itemIndex === index ? value : current[itemIndex] ?? 0,
                          ),
                        })
                      }}
                    />
                  ))}
                </FieldGrid>
              )}
            </>
          )}
          <Typography variant="body2" color="text.secondary">
            Para convertirla en un viaje, desactiva la compra y agrega “Ir a una
            casilla” como efecto al caer.
          </Typography>
        </>
      )}
      {tile.kind === 'tax' && (
        <Stack spacing={1.5}>
          <TextField
            select
            fullWidth
            size="small"
            label="Tipo de impuesto"
            value={tile.net_worth_percent == null ? 'fixed' : 'net_worth'}
            onChange={(event) =>
              event.target.value === 'net_worth'
                ? update({ amount: undefined, net_worth_percent: 10 })
                : update({ amount: 100, net_worth_percent: undefined })
            }
          >
            <MenuItem value="fixed">Monto fijo</MenuItem>
            <MenuItem value="net_worth">Porcentaje del patrimonio total</MenuItem>
          </TextField>
          {tile.net_worth_percent == null ? (
            <NumberField
              label="Monto del impuesto"
              value={tile.amount ?? 0}
              min={0}
              onChange={(amount) => update({ amount })}
            />
          ) : (
            <NumberField
              label="Porcentaje del patrimonio total"
              value={tile.net_worth_percent}
              min={1}
              max={100}
              onChange={(net_worth_percent) => update({ net_worth_percent })}
            />
          )}
        </Stack>
      )}
      {tile.kind === 'card' && (
        <TextField
          select
          fullWidth
          size="small"
          label="Mazo"
          value={tile.deck_id ?? ''}
          onChange={(event) => update({ deck_id: event.target.value || undefined })}
        >
          <MenuItem value="">Seleccionar mazo</MenuItem>
          {document.decks.map((deck) => (
            <MenuItem key={deck.id} value={deck.id}>
              {textForLocale(deck.name, locale) || deck.id}
            </MenuItem>
          ))}
        </TextField>
      )}
      {(tile.kind === 'start' || tile.kind === 'jail' || tile.kind === 'free') && (
        <Alert severity="info">
          Las esquinas son casillas configurables. Puedes combinar cobros,
          premios o movimientos mediante efectos encadenados.
        </Alert>
      )}
      {tile.kind === 'go_to_jail' && (
        <Alert severity="info">
          Esta esquina envía a la cárcel. Su comportamiento es fijo para evitar
          recorridos ambiguos.
        </Alert>
      )}
      {supportsLandingEffects ? (
        <>
          <Divider />
          <EffectEditor
            label="Efectos al caer"
            effects={tile.landing_effects ?? []}
            tiles={document.tiles}
            locale={locale}
            allowJailCard={false}
            onChange={(landing_effects) => update({ landing_effects })}
          />
        </>
      ) : (
        (tile.landing_effects?.length ?? 0) > 0 && (
          <Alert
            severity="warning"
            action={
              <Button onClick={() => update({ landing_effects: [] })}>
                Quitar efectos
              </Button>
            }
          >
            Este tipo de casilla no admite efectos adicionales.
          </Alert>
        )
      )}
    </PanelSection>
  )
}

function PropertyEconomyFields({
  tile,
  onChange,
}: {
  tile: BoardTileDraft
  onChange: (change: Partial<BoardTileDraft>) => void
}) {
  const rents = tile.rent_levels ?? [
    tile.base_rent ?? 0,
    0,
    0,
    0,
    0,
    0,
  ]
  const labels = [
    'Renta base',
    'Renta con 1 casa',
    'Renta con 2 casas',
    'Renta con 3 casas',
    'Renta con 4 casas',
    'Renta con hotel',
  ]
  return (
    <Stack spacing={1.25}>
      <FieldGrid>
        <NumberField
          label="Precio"
          value={tile.price ?? 0}
          min={0}
          onChange={(price) => onChange({ price })}
        />
        <NumberField
          label="Valor hipotecario"
          value={tile.mortgage_value ?? 0}
          min={0}
          onChange={(mortgage_value) => onChange({ mortgage_value })}
        />
        <NumberField
          label="Costo por casa"
          value={tile.build_cost ?? 0}
          min={0}
          onChange={(build_cost) => onChange({ build_cost })}
        />
        <NumberField
          label="Costo de hotel"
          value={tile.hotel_cost ?? tile.build_cost ?? 0}
          min={0}
          onChange={(hotel_cost) => onChange({ hotel_cost })}
        />
      </FieldGrid>
      <Typography fontWeight={800}>Tabla de rentas</Typography>
      <FieldGrid>
        {labels.map((label, index) => (
          <NumberField
            key={label}
            label={label}
            value={rents[index] ?? 0}
            min={0}
            onChange={(value) => {
              const next = Array.from({ length: 6 }, (_, rentIndex) =>
                rentIndex === index ? value : rents[rentIndex] ?? 0,
              )
              onChange({
                rent_levels: next,
                ...(index === 0 ? { base_rent: value } : {}),
              })
            }}
          />
        ))}
      </FieldGrid>
    </Stack>
  )
}

function DecksPanel({
  document,
  locale,
  onChange,
}: {
  document: BoardDraftDocument
  locale: string
  onChange: (document: BoardDraftDocument) => void
}) {
  const [selectedDeckId, setSelectedDeckId] = useState(document.decks[0]?.id ?? '')
  const selectedDeck =
    document.decks.find((deck) => deck.id === selectedDeckId) ?? document.decks[0]
  const [selectedCardId, setSelectedCardId] = useState(
    selectedDeck?.cards[0]?.id ?? '',
  )
  const selectedCard =
    selectedDeck?.cards.find((card) => card.id === selectedCardId) ??
    selectedDeck?.cards[0]

  useEffect(() => {
    if (selectedDeck && !document.decks.some((deck) => deck.id === selectedDeckId)) {
      setSelectedDeckId(selectedDeck.id)
    }
  }, [document.decks, selectedDeck, selectedDeckId])
  useEffect(() => {
    if (selectedCard && !selectedDeck?.cards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(selectedCard.id)
    }
  }, [selectedCard, selectedCardId, selectedDeck])

  const updateDeck = (change: Partial<BoardDeckDraft>) => {
    if (!selectedDeck) return
    onChange({
      ...document,
      decks: document.decks.map((deck) =>
        deck.id === selectedDeck.id ? { ...deck, ...change } : deck,
      ),
    })
  }
  const updateCard = (change: Partial<BoardCardDraft>) => {
    if (!selectedDeck || !selectedCard) return
    updateDeck({
      cards: selectedDeck.cards.map((card) =>
        card.id === selectedCard.id ? { ...card, ...change } : card,
      ),
    })
  }

  return (
    <PanelSection
      title="Mazos y tarjetas"
      description="Cada tarjeta puede encadenar hasta ocho efectos en un orden definido."
      action={
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() => {
            const index = document.decks.length + 1
            const id = `deck-${index}`
            onChange({
              ...document,
              decks: [
                ...document.decks,
                {
                  id,
                  name: { es: `Mazo ${index}`, en: `Deck ${index}` },
                  cards: [createCard(0)],
                },
              ],
            })
            setSelectedDeckId(id)
          }}
        >
          Nuevo mazo
        </Button>
      }
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          select
          fullWidth
          size="small"
          label="Mazo"
          value={selectedDeck?.id ?? ''}
          onChange={(event) => {
            const deck = document.decks.find(
              (item) => item.id === event.target.value,
            )
            setSelectedDeckId(event.target.value)
            setSelectedCardId(deck?.cards[0]?.id ?? '')
          }}
        >
          {document.decks.map((deck) => (
            <MenuItem key={deck.id} value={deck.id}>
              {textForLocale(deck.name, locale) || deck.id}
            </MenuItem>
          ))}
        </TextField>
        {selectedDeck && (
          <IconButton
            color="error"
            aria-label={`Eliminar mazo ${selectedDeck.id}`}
            onClick={() => {
              const decks = document.decks.filter(
                (deck) => deck.id !== selectedDeck.id,
              )
              onChange({
                ...document,
                decks,
                tiles: document.tiles.map((tile) =>
                  tile.deck_id === selectedDeck.id
                    ? { ...tile, deck_id: undefined }
                    : tile,
                ),
              })
              setSelectedDeckId(decks[0]?.id ?? '')
            }}
          >
            <DeleteOutlineRoundedIcon />
          </IconButton>
        )}
      </Stack>
      {selectedDeck && (
        <>
          <TextField
            fullWidth
            size="small"
            label="Identificador del mazo"
            value={selectedDeck.id}
            onChange={(event) => {
              const id = normalizeId(event.target.value)
              const previousId = selectedDeck.id
              onChange({
                ...document,
                decks: document.decks.map((deck) =>
                  deck.id === previousId ? { ...deck, id } : deck,
                ),
                tiles: document.tiles.map((tile) =>
                  tile.deck_id === previousId ? { ...tile, deck_id: id } : tile,
                ),
              })
              setSelectedDeckId(id)
            }}
          />
          <LocalizedTextFields
            label="Nombre del mazo"
            locales={document.information.locales}
            value={selectedDeck.name}
            onChange={(name) => updateDeck({ name })}
          />
          <Divider />
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              fullWidth
              size="small"
              label="Tarjeta"
              value={selectedCard?.id ?? ''}
              onChange={(event) => setSelectedCardId(event.target.value)}
            >
              {selectedDeck.cards.map((card, index) => (
                <MenuItem key={card.id} value={card.id}>
                  {index + 1}. {textForLocale(card.title, locale) || card.id}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              startIcon={<AddRoundedIcon />}
              onClick={() => {
                const card = createCard(selectedDeck.cards.length)
                updateDeck({ cards: [...selectedDeck.cards, card] })
                setSelectedCardId(card.id)
              }}
            >
              Tarjeta
            </Button>
            {selectedCard && (
              <IconButton
                color="error"
                aria-label={`Eliminar tarjeta ${selectedCard.id}`}
                onClick={() => {
                  const cards = selectedDeck.cards.filter(
                    (card) => card.id !== selectedCard.id,
                  )
                  updateDeck({ cards })
                  setSelectedCardId(cards[0]?.id ?? '')
                }}
              >
                <DeleteOutlineRoundedIcon />
              </IconButton>
            )}
          </Stack>
          {selectedCard && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Identificador de la tarjeta"
                value={selectedCard.id}
                onChange={(event) => {
                  const id = normalizeId(event.target.value)
                  updateCard({ id })
                  setSelectedCardId(id)
                }}
              />
              <LocalizedTextFields
                label="Título"
                locales={document.information.locales}
                value={selectedCard.title}
                onChange={(title) => updateCard({ title })}
              />
              <LocalizedTextFields
                label="Mensaje"
                locales={document.information.locales}
                value={selectedCard.message}
                multiline
                onChange={(message) => updateCard({ message })}
              />
              <EffectEditor
                effects={selectedCard.effects}
                tiles={document.tiles}
                locale={locale}
                onChange={(effects) => updateCard({ effects })}
              />
            </>
          )}
        </>
      )}
    </PanelSection>
  )
}

function PanelSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" fontWeight={900}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        {action}
      </Stack>
      {children}
    </Stack>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      {children}
    </Box>
  )
}

function removeLocale(value: Record<string, string>, locale: string) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== locale))
}

function normalizeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+/, '')
}
