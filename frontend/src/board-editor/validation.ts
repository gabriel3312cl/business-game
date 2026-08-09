import { perimeterTileCount } from './defaults'
import type {
  BoardCardEffect,
  BoardDraftDocument,
  BoardValidationIssue,
} from './types'

const idPattern = /^[a-z0-9][a-z0-9_-]*$/

export function validateBoardLocally(
  document: BoardDraftDocument,
): BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = []
  const expectedTiles = perimeterTileCount(document.side_length)
  if (document.side_length < 5 || document.side_length > 30) {
    issues.push({
      path: 'side_length',
      message: 'El tamaño debe estar entre 5 y 30 casillas por lado.',
    })
  }
  if (document.tiles.length !== expectedTiles) {
    issues.push({
      path: 'tiles',
      message: `Se esperaban ${expectedTiles} casillas y existen ${document.tiles.length}.`,
    })
  }
  if (
    document.information.min_players < 2 ||
    document.information.max_players > 20 ||
    document.information.min_players > document.information.max_players
  ) {
    issues.push({
      path: 'information.players',
      message: 'El rango de jugadores debe estar entre 2 y 20 y ser coherente.',
    })
  }
  for (const locale of document.information.locales) {
    if (!document.information.name[locale]?.trim()) {
      issues.push({
        path: `information.name.${locale}`,
        message: `Falta el nombre del tablero en ${locale.toUpperCase()}.`,
      })
    }
  }

  validateUniqueIds(
    document.groups.map((group) => group.id),
    'groups',
    issues,
  )
  validateUniqueIds(
    document.tiles.map((tile) => tile.id),
    'tiles',
    issues,
  )
  validateUniqueIds(
    document.decks.map((deck) => deck.id),
    'decks',
    issues,
  )

  for (const kind of ['start', 'jail', 'go_to_jail'] as const) {
    const count = document.tiles.filter((tile) => tile.kind === kind).length
    if (count !== 1) {
      issues.push({
        path: 'tiles',
        message: `Debe existir exactamente una casilla de tipo ${kind}; existen ${count}.`,
      })
    }
  }
  const cornerIndexes = new Set([
    0,
    document.side_length - 1,
    2 * (document.side_length - 1),
    3 * (document.side_length - 1),
  ])

  const groups = new Set(document.groups.map((group) => group.id))
  const decks = new Set(document.decks.map((deck) => deck.id))
  const tiles = new Set(document.tiles.map((tile) => tile.id))
  document.tiles.forEach((tile, index) => {
    for (const locale of document.information.locales) {
      if (!tile.name[locale]?.trim()) {
        issues.push({
          path: `tiles.${index}.name.${locale}`,
          message: `La casilla ${index + 1} no tiene nombre en ${locale.toUpperCase()}.`,
        })
      }
    }
    if (tile.group_id && !groups.has(tile.group_id)) {
      issues.push({
        path: `tiles.${index}.group`,
        message: `La casilla ${index + 1} usa un grupo inexistente.`,
      })
    }
    if (tile.kind === 'card' && (!tile.deck_id || !decks.has(tile.deck_id))) {
      issues.push({
        path: `tiles.${index}.deck`,
        message: `La casilla ${index + 1} debe apuntar a un mazo existente.`,
      })
    }
    if (tile.kind === 'property') {
      if (!tile.group_id) {
        issues.push({
          path: `tiles.${index}.group`,
          message: `La propiedad ${index + 1} necesita un grupo.`,
        })
      }
      if ((tile.rent_levels?.length ?? 0) !== 6) {
        issues.push({
          path: `tiles.${index}.rent_levels`,
          message: `La propiedad ${index + 1} necesita seis niveles de renta.`,
        })
      }
    }
    if (
      (tile.kind === 'start' ||
        tile.kind === 'jail' ||
        tile.kind === 'go_to_jail') &&
      !cornerIndexes.has(index)
    ) {
      issues.push({
        path: `tiles.${index}.kind`,
        message: `La casilla especial ${index + 1} debe ocupar una esquina.`,
      })
    }
    if (
      (tile.kind === 'property' ||
        ((tile.kind === 'transport' || tile.kind === 'utility') &&
          tile.purchasable !== false)) &&
      (tile.price == null ||
        tile.base_rent == null ||
        tile.mortgage_value == null ||
        (tile.kind !== 'utility' && tile.rent_levels?.[0] == null))
    ) {
      issues.push({
        path: `tiles.${index}`,
        message: `La casilla comprable ${index + 1} necesita precio, hipoteca y renta base.`,
      })
    }
    if (
      tile.kind === 'transport' &&
      tile.purchasable !== false &&
      !tile.rent_levels?.length
    ) {
      issues.push({
        path: `tiles.${index}.rent_levels`,
        message: `El transporte ${index + 1} necesita su tabla de rentas.`,
      })
    }
    if (
      tile.kind === 'utility' &&
      tile.purchasable !== false &&
      !tile.rent_multipliers?.length
    ) {
      issues.push({
        path: `tiles.${index}.rent_multipliers`,
        message: `El servicio ${index + 1} necesita multiplicadores de dados.`,
      })
    }
    if (
      (tile.kind === 'property' || tile.kind === 'transport') &&
      tile.purchasable !== false &&
      tile.rent_levels?.[0] !== tile.base_rent
    ) {
      issues.push({
        path: `tiles.${index}.base_rent`,
        message: `La renta base de la casilla ${index + 1} debe coincidir con el primer nivel de renta.`,
      })
    }
    if (
      tile.kind === 'tax' &&
      ((tile.amount == null) === (tile.net_worth_percent == null))
    ) {
      issues.push({
        path: `tiles.${index}`,
        message: `El impuesto ${index + 1} debe usar un monto fijo o un porcentaje del patrimonio total.`,
      })
    }
    if (
      (tile.kind === 'transport' || tile.kind === 'utility') &&
      tile.purchasable === false &&
      [
        tile.price,
        tile.base_rent,
        tile.mortgage_value,
        tile.build_cost,
        tile.hotel_cost,
        tile.rent_levels,
        tile.rent_multipliers,
      ].some((value) => value != null)
    ) {
      issues.push({
        path: `tiles.${index}`,
        message: `La casilla de movimiento ${index + 1} no puede conservar valores de compra o renta.`,
      })
    }
    const landingEffectsAllowed =
      tile.kind === 'start' ||
      tile.kind === 'jail' ||
      tile.kind === 'free' ||
      ((tile.kind === 'transport' || tile.kind === 'utility') &&
        tile.purchasable === false)
    if (!landingEffectsAllowed && (tile.landing_effects?.length ?? 0) > 0) {
      issues.push({
        path: `tiles.${index}.landing_effects`,
        message: `La casilla ${index + 1} no admite efectos adicionales.`,
      })
    }
    validateEffects(
      tile.landing_effects ?? [],
      `tiles.${index}.landing_effects`,
      tiles,
      issues,
      false,
    )
  })
  for (const group of document.groups) {
    for (const locale of document.information.locales) {
      if (!group.name[locale]?.trim()) {
        issues.push({
          path: `groups.${group.id}.name.${locale}`,
          message: `El grupo “${group.id}” no tiene nombre en ${locale.toUpperCase()}.`,
        })
      }
    }
    if (!document.tiles.some((tile) => tile.group_id === group.id)) {
      issues.push({
        path: `groups.${group.id}`,
        message: `El grupo “${group.id}” no tiene propiedades asignadas.`,
      })
    }
  }

  const cardIds: string[] = []
  document.decks.forEach((deck, deckIndex) => {
    deck.cards.forEach((card, cardIndex) => {
      cardIds.push(card.id)
      for (const locale of document.information.locales) {
        if (!card.message[locale]?.trim()) {
          issues.push({
            path: `decks.${deckIndex}.cards.${cardIndex}.message.${locale}`,
            message: `La tarjeta ${card.id} no tiene mensaje en ${locale.toUpperCase()}.`,
          })
        }
      }
      if (card.effects.length === 0) {
        issues.push({
          path: `decks.${deckIndex}.cards.${cardIndex}.effects`,
          message: `La tarjeta ${card.id} necesita al menos un efecto.`,
        })
      }
      validateEffects(
        card.effects,
        `decks.${deckIndex}.cards.${cardIndex}.effects`,
        tiles,
        issues,
      )
    })
  })
  validateUniqueIds(cardIds, 'cards', issues)

  return issues
}

function validateUniqueIds(
  ids: string[],
  path: string,
  issues: BoardValidationIssue[],
) {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!idPattern.test(id)) {
      issues.push({
        path,
        message: `El identificador “${id || '(vacío)'}” no es válido.`,
      })
    }
    if (seen.has(id)) {
      issues.push({ path, message: `El identificador “${id}” está repetido.` })
    }
    seen.add(id)
  }
}

function validateEffects(
  effects: BoardCardEffect[],
  path: string,
  tileIds: Set<string>,
  issues: BoardValidationIssue[],
  allowJailCard = true,
) {
  if (effects.length > 8) {
    issues.push({ path, message: 'No se permiten más de ocho efectos encadenados.' })
  }
  effects.forEach((effect, index) => {
    if (index < effects.length - 1 && suspendsEffectChain(effect)) {
      issues.push({
        path: `${path}.${index}`,
        message:
          'Este efecto puede pausar la resolución y debe ser el último de la cadena.',
      })
    }
    if (effect.type === 'get_out_of_jail' && !allowJailCard) {
      issues.push({
        path: `${path}.${index}`,
        message: 'El salvoconducto solo se puede entregar mediante una tarjeta.',
      })
    }
    if (effect.type === 'move_to' && !tileIds.has(effect.tile_id)) {
      issues.push({
        path: `${path}.${index}.tile_id`,
        message: 'El destino del movimiento no existe.',
      })
    }
    if (effect.type === 'move_relative' && effect.steps === 0) {
      issues.push({
        path: `${path}.${index}.steps`,
        message: 'El movimiento relativo no puede ser de cero pasos.',
      })
    }
    if (effect.type === 'cash_each' && effect.amount === 0) {
      issues.push({
        path: `${path}.${index}.amount`,
        message: 'El monto por jugador no puede ser cero.',
      })
    }
  })
}

function suspendsEffectChain(effect: BoardCardEffect): boolean {
  if (effect.type === 'cash') return effect.amount < 0
  return (
    effect.type === 'cash_each' ||
    effect.type === 'move_to' ||
    effect.type === 'move_relative' ||
    effect.type === 'move_to_nearest' ||
    effect.type === 'repairs' ||
    effect.type === 'go_to_jail'
  )
}
