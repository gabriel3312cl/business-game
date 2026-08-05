import type {
  BoardCardDraft,
  BoardCardEffect,
  BoardDraftDocument,
  BoardTileDraft,
  EditableTileKind,
  LocalizedText,
  PropertyGroupDraft,
} from './types'

const groupColors = [
  '#8d67ff',
  '#2ecfe5',
  '#ff8a5b',
  '#ff4f91',
  '#65b7ff',
  '#75d17c',
  '#ffd85a',
  '#b86ad7',
]

export function perimeterTileCount(sideLength: number): number {
  return sideLength * 4 - 4
}

export function createBoardDocument(sideLength = 10): BoardDraftDocument {
  const normalizedSide = Math.max(5, Math.min(30, Math.round(sideLength)))
  const groups = createDefaultGroups()
  const tiles = createTiles(normalizedSide, groups)
  const decks = [
    createDeck('fortune', { es: 'Fortuna', en: 'Fortune' }, 'fortune-card'),
    createDeck(
      'community',
      { es: 'Baúl comunitario', en: 'Community chest' },
      'community-card',
    ),
  ]

  return {
    schema_version: 5,
    side_length: normalizedSide,
    information: {
      name: { es: 'Mi tablero', en: 'My board' },
      description: {
        es: 'Un tablero personalizado de Business Game.',
        en: 'A custom Business Game board.',
      },
      default_locale: 'es',
      locales: ['es', 'en'],
      min_players: 2,
      max_players: 8,
    },
    economy: {
      starting_balance: 1500,
      pass_start_salary: 200,
      mortgage_interest_percent: 10,
      building_sell_percent: 50,
      monopoly_rent_multiplier: 2,
      jail_fine: 50,
      jail_max_failed_rolls: 3,
      max_consecutive_doubles: 3,
      house_supply: 32,
      hotel_supply: 12,
      default_rules: {
        auction_unpurchased_properties: true,
        free_parking_jackpot: false,
        double_salary_on_start: false,
      },
      configurable_rules: [
        'auction_unpurchased_properties',
        'free_parking_jackpot',
        'double_salary_on_start',
      ],
    },
    groups,
    tiles,
    decks,
  }
}

export function resizeBoard(
  document: BoardDraftDocument,
  sideLength: number,
): BoardDraftDocument {
  const normalizedSide = Math.max(5, Math.min(30, Math.round(sideLength)))
  const expected = perimeterTileCount(normalizedSide)
  if (normalizedSide === document.side_length) return document
  const oldCornerIndexes = new Set([
    0,
    document.side_length - 1,
    2 * (document.side_length - 1),
    3 * (document.side_length - 1),
  ])
  const oldCorners = [...oldCornerIndexes]
    .map((index) => document.tiles[index])
    .filter((tile): tile is BoardTileDraft => Boolean(tile))
  const oldEdges = document.tiles.filter((_, index) => !oldCornerIndexes.has(index))
  const defaults = createTiles(normalizedSide, document.groups)
  const newCornerIndexes = new Set([
    0,
    normalizedSide - 1,
    2 * (normalizedSide - 1),
    3 * (normalizedSide - 1),
  ])
  let edgeIndex = 0
  let cornerIndex = 0
  const usedIds = new Set<string>()
  const tiles = Array.from({ length: expected }, (_, index) => {
    const candidate = newCornerIndexes.has(index)
      ? oldCorners[cornerIndex++] ?? defaults[index]
      : oldEdges[edgeIndex++] ?? defaults[index]
    let id = candidate.id || `tile-${index + 1}`
    if (usedIds.has(id)) id = `tile-${index + 1}-${uniqueSuffix()}`
    usedIds.add(id)
    return { ...candidate, id }
  })

  return { ...document, side_length: normalizedSide, tiles }
}

export function createPropertyGroup(index: number): PropertyGroupDraft {
  const number = index + 1
  return {
    id: `group-${number}-${uniqueSuffix()}`,
    name: { es: `Grupo ${number}`, en: `Group ${number}` },
    color: groupColors[index % groupColors.length],
    house_cost: 100,
    hotel_cost: 100,
  }
}

export function createCard(index: number): BoardCardDraft {
  const number = index + 1
  return {
    id: `card-${number}-${uniqueSuffix()}`,
    title: { es: `Tarjeta ${number}`, en: `Card ${number}` },
    message: {
      es: 'Recibes $50 del banco.',
      en: 'Collect $50 from the bank.',
    },
    effects: [{ type: 'cash', amount: 50 }],
  }
}

export function createEffect(type: BoardCardEffect['type']): BoardCardEffect {
  if (type === 'cash') return { type, amount: 50 }
  if (type === 'cash_each') return { type, amount: 25 }
  if (type === 'move_to') return { type, tile_id: '', collect_start: true }
  if (type === 'move_relative') return { type, steps: 3, collect_start: true }
  if (type === 'move_to_nearest') {
    return {
      type,
      tile_kind: 'transport',
      collect_start: true,
      rent_multiplier: 2,
      dice_multiplier: null,
    }
  }
  if (type === 'repairs') return { type, house_amount: 25, hotel_amount: 100 }
  return { type }
}

export function changeTileKind(
  tile: BoardTileDraft,
  kind: EditableTileKind,
  document: Pick<BoardDraftDocument, 'groups' | 'decks'>,
): BoardTileDraft {
  const base: BoardTileDraft = {
    id: tile.id,
    kind,
    name: tile.name,
    color: tile.color,
    icon: tile.icon,
    icon_background: tile.icon_background,
    asset_path: tile.asset_path,
  }
  if (kind === 'property') {
    const group = document.groups[0]
    return {
      ...base,
      purchasable: true,
      group_id: group?.id,
      price: 100,
      base_rent: 10,
      mortgage_value: 50,
      build_cost: group?.house_cost ?? 100,
      hotel_cost: group?.hotel_cost ?? 100,
      rent_levels: [10, 50, 100, 200, 300, 400],
    }
  }
  if (kind === 'transport') return purchasableTransport(base)
  if (kind === 'utility') return purchasableUtility(base)
  if (kind === 'tax') return { ...base, amount: 100 }
  if (kind === 'card') {
    return { ...base, deck_id: document.decks[0]?.id }
  }
  if (kind === 'start' || kind === 'jail' || kind === 'free') {
    return { ...base, landing_effects: [] }
  }
  return base
}

export function changeTilePurchasable(
  tile: BoardTileDraft,
  purchasable: boolean,
): BoardTileDraft {
  if (tile.kind !== 'transport' && tile.kind !== 'utility') return tile
  const base: BoardTileDraft = {
    id: tile.id,
    kind: tile.kind,
    name: tile.name,
    color: tile.color,
    icon: tile.icon,
    icon_background: tile.icon_background,
    asset_path: tile.asset_path,
  }
  if (!purchasable) {
    return {
      ...base,
      purchasable: false,
      landing_effects: tile.landing_effects ?? [],
    }
  }
  return tile.kind === 'transport'
    ? purchasableTransport(base)
    : purchasableUtility(base)
}

export function textForLocale(
  value: LocalizedText,
  locale: string,
  fallback = 'es',
): string {
  return value[locale] ?? value[fallback] ?? Object.values(value)[0] ?? ''
}

export function tileKindLabel(kind: EditableTileKind): string {
  const labels: Record<EditableTileKind, string> = {
    start: 'Salida',
    property: 'Propiedad',
    tax: 'Impuesto',
    card: 'Tarjeta',
    jail: 'Cárcel / visita',
    go_to_jail: 'Ir a cárcel',
    free: 'Parada libre',
    transport: 'Transporte',
    utility: 'Servicio',
  }
  return labels[kind]
}

function createDefaultGroups(): PropertyGroupDraft[] {
  return Array.from({ length: 4 }, (_, index) => createPropertyGroup(index))
}

function createTiles(
  sideLength: number,
  groups: PropertyGroupDraft[],
): BoardTileDraft[] {
  const count = perimeterTileCount(sideLength)
  let propertyIndex = 0
  const corners = new Map<number, EditableTileKind>([
    [0, 'start'],
    [sideLength - 1, 'jail'],
    [(sideLength - 1) * 2, 'free'],
    [(sideLength - 1) * 3, 'go_to_jail'],
  ])

  return Array.from({ length: count }, (_, index) => {
    const kind = corners.get(index) ?? defaultKind(index)
    const number = index + 1
    const group = groups[propertyIndex % groups.length]
    const tile: BoardTileDraft = {
      id: `tile-${number}`,
      kind,
      name: {
        es: defaultTileName(kind, number, 'es'),
        en: defaultTileName(kind, number, 'en'),
      },
    }
    if (kind === 'property') {
      propertyIndex += 1
      const price = 60 + Math.floor(index / 3) * 10
      return {
        ...tile,
        purchasable: true,
        group_id: group.id,
        price,
        base_rent: Math.max(2, Math.floor(price / 10)),
        mortgage_value: Math.floor(price / 2),
        build_cost: group.house_cost,
        hotel_cost: group.hotel_cost,
        rent_levels: [
          Math.max(2, Math.floor(price / 10)),
          Math.floor(price * 0.5),
          price,
          price * 2,
          price * 3,
          price * 4,
        ],
      }
    }
    if (kind === 'transport') {
      return {
        ...tile,
        purchasable: true,
        price: 200,
        base_rent: 25,
        mortgage_value: 100,
        rent_levels: [25, 50, 100, 200],
      }
    }
    if (kind === 'utility') {
      return {
        ...tile,
        purchasable: true,
        price: 150,
        base_rent: 0,
        mortgage_value: 75,
        rent_multipliers: [4, 10],
      }
    }
    if (kind === 'tax') return { ...tile, amount: 100 }
    if (kind === 'card') {
      return { ...tile, deck_id: index % 2 === 0 ? 'fortune' : 'community' }
    }
    return tile
  })
}

function purchasableTransport(base: BoardTileDraft): BoardTileDraft {
  return {
    ...base,
    purchasable: true,
    price: 200,
    base_rent: 25,
    mortgage_value: 100,
    rent_levels: [25, 50, 100, 200],
  }
}

function purchasableUtility(base: BoardTileDraft): BoardTileDraft {
  return {
    ...base,
    purchasable: true,
    price: 150,
    base_rent: 0,
    mortgage_value: 75,
    rent_multipliers: [4, 10],
  }
}

function createDeck(id: string, name: LocalizedText, cardId: string) {
  return {
    id,
    name,
    cards: [
      {
        ...createCard(0),
        id: cardId,
        title: name,
      },
    ],
  }
}

function defaultKind(index: number): EditableTileKind {
  if (index % 9 === 0) return 'utility'
  if (index % 7 === 0) return 'card'
  if (index % 5 === 0) return 'transport'
  if (index % 4 === 0) return 'tax'
  return 'property'
}

function defaultTileName(
  kind: EditableTileKind,
  number: number,
  locale: 'es' | 'en',
) {
  const names: Record<EditableTileKind, [string, string]> = {
    start: ['Salida', 'Start'],
    property: [`Propiedad ${number}`, `Property ${number}`],
    tax: [`Impuesto ${number}`, `Tax ${number}`],
    card: ['Tarjeta', 'Card'],
    jail: ['Cárcel / visita', 'Jail / visiting'],
    go_to_jail: ['Ir a cárcel', 'Go to jail'],
    free: ['Parada libre', 'Free parking'],
    transport: [`Transporte ${number}`, `Transport ${number}`],
    utility: [`Servicio ${number}`, `Utility ${number}`],
  }
  return names[kind][locale === 'es' ? 0 : 1]
}

function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}
