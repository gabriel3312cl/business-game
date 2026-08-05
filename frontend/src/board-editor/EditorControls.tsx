import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { createEffect, textForLocale } from './defaults'
import type {
  BoardCardEffect,
  BoardTileDraft,
  LocalizedText,
} from './types'

export function LocalizedTextFields({
  label,
  value,
  locales,
  multiline = false,
  onChange,
}: {
  label: string
  value: LocalizedText
  locales: string[]
  multiline?: boolean
  onChange: (value: LocalizedText) => void
}) {
  return (
    <Stack spacing={1}>
      {locales.map((locale) => (
        <TextField
          key={locale}
          fullWidth
          size="small"
          label={`${label} (${locale.toUpperCase()})`}
          value={value[locale] ?? ''}
          multiline={multiline}
          minRows={multiline ? 2 : undefined}
          onChange={(event) =>
            onChange({ ...value, [locale]: event.target.value })
          }
        />
      ))}
    </Stack>
  )
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <TextField
      fullWidth
      size="small"
      type="number"
      label={label}
      value={value}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      slotProps={{ htmlInput: { min, max, step } }}
    />
  )
}

export function EffectEditor({
  effects,
  tiles,
  locale,
  label = 'Efectos',
  allowJailCard = true,
  onChange,
}: {
  effects: BoardCardEffect[]
  tiles: BoardTileDraft[]
  locale: string
  label?: string
  allowJailCard?: boolean
  onChange: (effects: BoardCardEffect[]) => void
}) {
  const update = (index: number, effect: BoardCardEffect) => {
    onChange(effects.map((item, itemIndex) => (itemIndex === index ? effect : item)))
  }
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= effects.length) return
    const next = [...effects]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    onChange(next)
  }

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography fontWeight={800}>{label}</Typography>
          <Typography variant="caption" color="text.secondary">
            Se ejecutan en este orden, hasta 8 por casilla o tarjeta.
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          disabled={effects.length >= 8}
          onClick={() => onChange([...effects, createEffect('cash')])}
        >
          Agregar
        </Button>
      </Stack>
      {effects.length === 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, color: 'text.secondary' }}>
          <Typography variant="body2">Sin efectos automáticos.</Typography>
        </Paper>
      )}
      {effects.map((effect, index) => (
        <Paper key={`${index}-${effect.type}`} variant="outlined" sx={{ p: 1.25 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {index + 1}
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                label="Tipo de efecto"
                value={effect.type}
                onChange={(event) =>
                  update(
                    index,
                    createEffect(event.target.value as BoardCardEffect['type']),
                  )
                }
              >
                <MenuItem value="cash">Cobrar o pagar al banco</MenuItem>
                <MenuItem value="cash_each">Cobrar o pagar a cada jugador</MenuItem>
                <MenuItem value="move_to">Ir a una casilla</MenuItem>
                <MenuItem value="move_relative">Avanzar o retroceder</MenuItem>
                <MenuItem value="move_to_nearest">
                  Ir al transporte o servicio más cercano
                </MenuItem>
                <MenuItem value="repairs">Seguro / reparaciones</MenuItem>
                <MenuItem value="go_to_jail">Ir a cárcel</MenuItem>
                {allowJailCard && (
                  <MenuItem value="get_out_of_jail">
                    Entregar salvoconducto
                  </MenuItem>
                )}
              </TextField>
              <IconButton
                size="small"
                aria-label={`Subir efecto ${index + 1}`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <KeyboardArrowUpRoundedIcon />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Bajar efecto ${index + 1}`}
                disabled={index === effects.length - 1}
                onClick={() => move(index, 1)}
              >
                <KeyboardArrowDownRoundedIcon />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                aria-label={`Eliminar efecto ${index + 1}`}
                onClick={() => onChange(effects.filter((_, itemIndex) => itemIndex !== index))}
              >
                <DeleteOutlineRoundedIcon />
              </IconButton>
            </Stack>
            <EffectFields
              effect={effect}
              tiles={tiles}
              locale={locale}
              onChange={(next) => update(index, next)}
            />
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

function EffectFields({
  effect,
  tiles,
  locale,
  onChange,
}: {
  effect: BoardCardEffect
  tiles: BoardTileDraft[]
  locale: string
  onChange: (effect: BoardCardEffect) => void
}) {
  if (effect.type === 'cash' || effect.type === 'cash_each') {
    return (
      <NumberField
        label={
          effect.type === 'cash'
            ? 'Monto (positivo cobra, negativo paga)'
            : 'Monto por jugador (positivo cobra, negativo paga)'
        }
        value={effect.amount}
        onChange={(amount) => onChange({ ...effect, amount })}
      />
    )
  }
  if (effect.type === 'move_to') {
    return (
      <Stack spacing={1}>
        <TextField
          select
          size="small"
          label="Casilla de destino"
          value={effect.tile_id}
          onChange={(event) => onChange({ ...effect, tile_id: event.target.value })}
        >
          {tiles.map((tile, index) => (
            <MenuItem key={tile.id} value={tile.id}>
              {index + 1}. {textForLocale(tile.name, locale)}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={effect.collect_start}
              onChange={(event) =>
                onChange({ ...effect, collect_start: event.target.checked })
              }
            />
          }
          label="Cobrar sueldo si cruza Salida"
        />
      </Stack>
    )
  }
  if (effect.type === 'move_relative') {
    return (
      <Stack spacing={1}>
        <NumberField
          label="Pasos (negativo retrocede)"
          value={effect.steps}
          min={-116}
          max={116}
          onChange={(steps) => onChange({ ...effect, steps })}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={effect.collect_start}
              onChange={(event) =>
                onChange({ ...effect, collect_start: event.target.checked })
              }
            />
          }
          label="Cobrar sueldo si cruza Salida"
        />
      </Stack>
    )
  }
  if (effect.type === 'move_to_nearest') {
    return (
      <Stack spacing={1}>
        <TextField
          select
          size="small"
          label="Tipo de destino"
          value={effect.tile_kind}
          onChange={(event) =>
            onChange({
              ...effect,
              tile_kind: event.target.value as 'transport' | 'utility',
            })
          }
        >
          <MenuItem value="transport">Transporte</MenuItem>
          <MenuItem value="utility">Servicio</MenuItem>
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <NumberField
            label="Multiplicador de renta"
            value={effect.rent_multiplier}
            min={1}
            max={10}
            onChange={(rent_multiplier) => onChange({ ...effect, rent_multiplier })}
          />
          <NumberField
            label="Multiplicador de dados (0 desactiva)"
            value={effect.dice_multiplier ?? 0}
            min={0}
            max={20}
            onChange={(dice_multiplier) =>
              onChange({
                ...effect,
                dice_multiplier: dice_multiplier || null,
              })
            }
          />
        </Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={effect.collect_start}
              onChange={(event) =>
                onChange({ ...effect, collect_start: event.target.checked })
              }
            />
          }
          label="Cobrar sueldo si cruza Salida"
        />
      </Stack>
    )
  }
  if (effect.type === 'repairs') {
    return (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <NumberField
          label="Costo por casa"
          value={effect.house_amount}
          min={0}
          onChange={(house_amount) => onChange({ ...effect, house_amount })}
        />
        <NumberField
          label="Costo por hotel"
          value={effect.hotel_amount}
          min={0}
          onChange={(hotel_amount) => onChange({ ...effect, hotel_amount })}
        />
      </Stack>
    )
  }
  return (
    <Typography variant="body2" color="text.secondary">
      Este efecto no requiere parámetros.
    </Typography>
  )
}
