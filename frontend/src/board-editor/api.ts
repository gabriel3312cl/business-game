import { authenticatedRequest } from '../api'
import { textForLocale } from './defaults'
import type {
  BoardCardEffect,
  BoardDraft,
  BoardDraftDocument,
  BoardDraftSave,
  BoardPublishResult,
  BoardTileDraft,
  BoardValidationIssue,
  BoardVersionSummary,
  LocalizedText,
} from './types'
import type { TileIcon, TileIconBackground } from '../types'

interface BackendBoardProject {
  id: string
  revision: number
  status: 'draft' | 'published'
  name: string
  description?: string | null
  document: BackendBoardDocument
  created_at: string
  updated_at: string
  published_pack_id?: string | null
  published_version?: string | null
}

interface BackendBoardDocument {
  schema_version: 5
  name_key: string
  side_length: number
  default_locale: string
  messages: Record<string, Record<string, string>>
  min_players: number
  max_players: number
  starting_balance: number
  pass_start_salary: number
  mortgage_interest_percent: number
  building_sell_percent: number
  monopoly_rent_multiplier: number
  jail_fine: number
  jail_max_failed_rolls: number
  max_consecutive_doubles: number
  house_supply: number
  hotel_supply: number
  default_rules: {
    auction_unpurchased_properties: boolean
    free_parking_jackpot: boolean
    double_salary_on_start: boolean
  }
  configurable_rules: Array<
    | 'auction_unpurchased_properties'
    | 'free_parking_jackpot'
    | 'double_salary_on_start'
  >
  groups: Array<{ id: string; name_key: string; color: string }>
  tiles: Array<{
    id: string
    kind:
      | 'start'
      | 'property'
      | 'tax'
      | 'card'
      | 'jail'
      | 'go_to_jail'
      | 'free'
      | 'transport'
      | 'utility'
    name_key: string
    deck_id?: string | null
    group?: string | null
    color?: string | null
    icon?: TileIcon | null
    icon_background?: TileIconBackground | null
    purchasable?: boolean | null
    price?: number | null
    base_rent?: number | null
    mortgage_value?: number | null
    build_cost?: number | null
    hotel_cost?: number | null
    rent_levels?: number[] | null
    rent_multipliers?: number[] | null
    amount?: number | null
    net_worth_percent?: number | null
    landing_effects?: BoardCardEffect[]
  }>
  decks: Array<{
    id: string
    name_key?: string | null
    cards: Array<{
      id: string
      message_key: string
      title_key?: string | null
      effects: BoardCardEffect[]
    }>
  }>
}

interface BackendValidation {
  valid: boolean
  errors: BoardValidationIssue[]
  warnings: BoardValidationIssue[]
}

export const boardEditorApi = {
  list: async () => {
    const projects = await authenticatedRequest<BackendBoardProject[]>(
      '/board-projects',
    )
    return projects.map(fromBackendProject)
  },
  create: async (document: BoardDraftDocument) =>
    fromBackendProject(
      await authenticatedRequest<BackendBoardProject>('/board-projects', {
        method: 'POST',
        body: JSON.stringify({
          name: textForLocale(
            document.information.name,
            document.information.default_locale,
          ),
          description: textForLocale(
            document.information.description,
            document.information.default_locale,
          ),
          document: toBackendDocument(document),
        }),
      }),
    ),
  get: async (projectId: string) =>
    fromBackendProject(
      await authenticatedRequest<BackendBoardProject>(
        `/board-projects/${projectId}`,
      ),
    ),
  save: async (projectId: string, change: BoardDraftSave) =>
    fromBackendProject(
      await authenticatedRequest<BackendBoardProject>(
        `/board-projects/${projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            revision: change.revision,
            name: textForLocale(
              change.document.information.name,
              change.document.information.default_locale,
            ),
            description: textForLocale(
              change.document.information.description,
              change.document.information.default_locale,
            ),
            document: toBackendDocument(change.document),
          }),
        },
      ),
    ),
  delete: (projectId: string, revision: number) =>
    authenticatedRequest<void>(
      `/board-projects/${projectId}?revision=${encodeURIComponent(revision)}`,
      {
        method: 'DELETE',
      },
    ),
  validate: (projectId: string, revision: number) =>
    authenticatedRequest<BackendValidation>(
      `/board-projects/${projectId}/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ revision }),
      },
    ),
  publish: (projectId: string, revision: number, version?: string) =>
    authenticatedRequest<BoardPublishResult>(
      `/board-projects/${projectId}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ revision, ...(version ? { version } : {}) }),
      },
    ),
  versions: (projectId: string) =>
    authenticatedRequest<BoardVersionSummary[]>(
      `/board-projects/${projectId}/versions`,
    ),
}

function toBackendDocument(document: BoardDraftDocument): BackendBoardDocument {
  const nameKey = 'board.name'
  const messages = createMessages(document.information.locales)
  writeMessages(messages, nameKey, document.information.name)
  writeMessages(messages, 'board.description', document.information.description)

  const groups = document.groups.map((group) => {
    const groupNameKey = `group.${group.id}.name`
    writeMessages(messages, groupNameKey, group.name)
    return { id: group.id, name_key: groupNameKey, color: group.color }
  })
  const tiles = document.tiles.map((tile) => {
    const tileNameKey = `tile.${tile.id}.name`
    writeMessages(messages, tileNameKey, tile.name)
    return toBackendTile(tile, tileNameKey)
  })
  const decks = document.decks.map((deck) => {
    const nameKey = `deck.${deck.id}.name`
    writeMessages(messages, nameKey, deck.name)
    return {
      id: deck.id,
      name_key: nameKey,
      cards: deck.cards.map((card) => {
        const messageKey = `card.${card.id}.message`
        const titleKey = `card.${card.id}.title`
        writeMessages(messages, titleKey, card.title)
        writeMessages(messages, messageKey, card.message)
        return {
          id: card.id,
          message_key: messageKey,
          title_key: titleKey,
          effects: card.effects.slice(0, 8),
        }
      }),
    }
  })

  return {
    schema_version: 5,
    name_key: nameKey,
    side_length: document.side_length,
    default_locale: document.information.default_locale,
    messages,
    min_players: document.information.min_players,
    max_players: document.information.max_players,
    starting_balance: document.economy.starting_balance,
    pass_start_salary: document.economy.pass_start_salary,
    mortgage_interest_percent: document.economy.mortgage_interest_percent,
    building_sell_percent: document.economy.building_sell_percent,
    monopoly_rent_multiplier: document.economy.monopoly_rent_multiplier,
    jail_fine: document.economy.jail_fine,
    jail_max_failed_rolls: document.economy.jail_max_failed_rolls,
    max_consecutive_doubles: document.economy.max_consecutive_doubles,
    house_supply: document.economy.house_supply,
    hotel_supply: document.economy.hotel_supply,
    default_rules: document.economy.default_rules,
    configurable_rules: document.economy.configurable_rules,
    groups,
    tiles,
    decks,
  }
}

function fromBackendProject(project: BackendBoardProject): BoardDraft {
  const backend = project.document
  const locales = Object.keys(backend.messages)
  const defaultLocale = backend.default_locale
  const localize = (key: string): LocalizedText =>
    Object.fromEntries(
      locales.map((locale) => [locale, backend.messages[locale]?.[key] ?? '']),
    )
  const groups = backend.groups.map((group) => {
    const matchingTile = backend.tiles.find((tile) => tile.group === group.id)
    return {
      id: group.id,
      name: localize(group.name_key),
      color: group.color,
      house_cost: matchingTile?.build_cost ?? 100,
      hotel_cost: matchingTile?.hotel_cost ?? matchingTile?.build_cost ?? 100,
    }
  })

  return {
    id: project.id,
    revision: project.revision,
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
    published_pack_id: project.published_pack_id,
    published_version: project.published_version,
    document: {
      schema_version: 5,
      side_length: backend.side_length,
      information: {
        name: localize(backend.name_key),
        description: {
          ...localize('board.description'),
          [defaultLocale]:
            backend.messages[defaultLocale]?.['board.description'] ??
            project.description ??
            '',
        },
        default_locale: defaultLocale,
        locales: locales.length > 0 ? locales : [defaultLocale],
        min_players: backend.min_players,
        max_players: backend.max_players,
      },
      economy: {
        starting_balance: backend.starting_balance,
        pass_start_salary: backend.pass_start_salary,
        mortgage_interest_percent: backend.mortgage_interest_percent,
        building_sell_percent: backend.building_sell_percent,
        monopoly_rent_multiplier: backend.monopoly_rent_multiplier,
        jail_fine: backend.jail_fine,
        jail_max_failed_rolls: backend.jail_max_failed_rolls,
        max_consecutive_doubles: backend.max_consecutive_doubles,
        house_supply: backend.house_supply,
        hotel_supply: backend.hotel_supply,
        default_rules: backend.default_rules,
        configurable_rules: backend.configurable_rules,
      },
      groups,
      tiles: backend.tiles.map((tile) => fromBackendTile(tile, localize)),
      decks: backend.decks.map((deck) => ({
        id: deck.id,
        name: localize(deck.name_key ?? `deck.${deck.id}.name`),
        cards: deck.cards.map((card) => ({
          id: card.id,
          title: localize(card.title_key ?? `card.${card.id}.title`),
          message: localize(card.message_key),
          effects: card.effects,
        })),
      })),
    },
  }
}

function toBackendTile(
  tile: BoardTileDraft,
  nameKey: string,
): BackendBoardDocument['tiles'][number] {
  const base = {
    id: tile.id,
    kind: tile.kind,
    name_key: nameKey,
    color: tile.color,
    icon: tile.icon,
    icon_background: tile.icon_background,
  }
  if (tile.kind === 'property') {
    const rents = tile.rent_levels
    return compactObject({
      ...base,
      group: tile.group_id,
      purchasable: true,
      price: tile.price,
      base_rent: tile.base_rent ?? rents?.[0],
      mortgage_value: tile.mortgage_value,
      build_cost: tile.build_cost,
      hotel_cost: tile.hotel_cost,
      rent_levels: rents,
    })
  }
  if (tile.kind === 'transport' || tile.kind === 'utility') {
    if (tile.purchasable === false) {
      return compactObject({
        ...base,
        purchasable: false,
        landing_effects: tile.landing_effects?.slice(0, 8),
      })
    }
    if (tile.kind === 'transport') {
      const rents = tile.rent_levels
      return compactObject({
        ...base,
        purchasable: true,
        price: tile.price,
        base_rent: tile.base_rent ?? rents?.[0],
        mortgage_value: tile.mortgage_value,
        rent_levels: rents,
      })
    }
    return compactObject({
      ...base,
      purchasable: true,
      price: tile.price,
      base_rent: tile.base_rent ?? tile.rent_levels?.[0],
      mortgage_value: tile.mortgage_value,
      rent_multipliers: tile.rent_multipliers,
    })
  }
  if (tile.kind === 'tax') {
    return compactObject({
      ...base,
      amount: tile.amount,
      net_worth_percent: tile.net_worth_percent,
    })
  }
  if (tile.kind === 'card') {
    return compactObject({ ...base, deck_id: tile.deck_id })
  }
  if (tile.kind === 'start' || tile.kind === 'jail' || tile.kind === 'free') {
    return compactObject({
      ...base,
      landing_effects: tile.landing_effects?.slice(0, 8),
    })
  }
  return compactObject(base)
}

function fromBackendTile(
  tile: BackendBoardDocument['tiles'][number],
  localize: (key: string) => LocalizedText,
): BoardTileDraft {
  const base: BoardTileDraft = {
    id: tile.id,
    kind: tile.kind,
    name: localize(tile.name_key),
    color: tile.color ?? undefined,
    icon: tile.icon ?? undefined,
    icon_background: tile.icon_background ?? undefined,
  }
  if (tile.kind === 'property') {
    return {
      ...base,
      purchasable: true,
      group_id: tile.group ?? undefined,
      price: tile.price ?? undefined,
      base_rent: tile.base_rent ?? tile.rent_levels?.[0],
      mortgage_value: tile.mortgage_value ?? undefined,
      build_cost: tile.build_cost ?? undefined,
      hotel_cost: tile.hotel_cost ?? tile.build_cost ?? undefined,
      rent_levels: tile.rent_levels ?? undefined,
    }
  }
  if (tile.kind === 'transport' || tile.kind === 'utility') {
    if (tile.purchasable === false) {
      return {
        ...base,
        purchasable: false,
        landing_effects: tile.landing_effects ?? [],
      }
    }
    if (tile.kind === 'transport') {
      return {
        ...base,
        purchasable: true,
        price: tile.price ?? undefined,
        base_rent: tile.base_rent ?? tile.rent_levels?.[0],
        mortgage_value: tile.mortgage_value ?? undefined,
        rent_levels: tile.rent_levels ?? undefined,
      }
    }
    return {
      ...base,
      purchasable: true,
      price: tile.price ?? undefined,
      base_rent: tile.base_rent ?? tile.rent_levels?.[0],
      mortgage_value: tile.mortgage_value ?? undefined,
      rent_multipliers: tile.rent_multipliers ?? undefined,
    }
  }
  if (tile.kind === 'tax') {
    return {
      ...base,
      amount: tile.amount ?? undefined,
      net_worth_percent: tile.net_worth_percent ?? undefined,
    }
  }
  if (tile.kind === 'card') {
    return { ...base, deck_id: tile.deck_id ?? undefined }
  }
  if (tile.kind === 'start' || tile.kind === 'jail' || tile.kind === 'free') {
    return { ...base, landing_effects: tile.landing_effects ?? [] }
  }
  return base
}

function createMessages(locales: string[]) {
  return Object.fromEntries(locales.map((locale) => [locale, {}]))
}

function writeMessages(
  messages: Record<string, Record<string, string>>,
  key: string,
  value: LocalizedText,
) {
  for (const locale of Object.keys(messages)) {
    messages[locale][key] = value[locale] ?? ''
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T
}
