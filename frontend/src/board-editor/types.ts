import type { TileIcon, TileIconBackground } from '../types'

export type BoardDraftStatus = 'draft' | 'published'

export type BoardEditorStep =
  | 'information'
  | 'economy'
  | 'groups'
  | 'tiles'
  | 'decks'
  | 'publish'

export type LocalizedText = Record<string, string>

export type EditableTileKind =
  | 'start'
  | 'property'
  | 'tax'
  | 'card'
  | 'jail'
  | 'go_to_jail'
  | 'free'
  | 'transport'
  | 'utility'

export interface BoardInformation {
  name: LocalizedText
  description: LocalizedText
  default_locale: string
  locales: string[]
  min_players: number
  max_players: number
}

export interface BoardEconomy {
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
}

export interface PropertyGroupDraft {
  id: string
  name: LocalizedText
  color: string
  house_cost: number
  hotel_cost: number
}

export interface BoardTileDraft {
  id: string
  kind: EditableTileKind
  name: LocalizedText
  group_id?: string
  color?: string
  icon?: TileIcon
  icon_background?: TileIconBackground
  asset_path?: string
  purchasable?: boolean
  deck_id?: string
  price?: number
  base_rent?: number
  mortgage_value?: number
  build_cost?: number
  hotel_cost?: number
  rent_levels?: number[]
  rent_multipliers?: number[]
  amount?: number
  net_worth_percent?: number
  landing_effects?: BoardCardEffect[]
}

export type BoardCardEffect =
  | { type: 'cash'; amount: number }
  | { type: 'cash_each'; amount: number }
  | { type: 'move_to'; tile_id: string; collect_start: boolean }
  | { type: 'move_relative'; steps: number; collect_start: boolean }
  | {
      type: 'move_to_nearest'
      tile_kind: 'transport' | 'utility'
      collect_start: boolean
      rent_multiplier: number
      dice_multiplier: number | null
    }
  | { type: 'repairs'; house_amount: number; hotel_amount: number }
  | { type: 'go_to_jail' }
  | { type: 'get_out_of_jail' }

export interface BoardCardDraft {
  id: string
  title: LocalizedText
  message: LocalizedText
  effects: BoardCardEffect[]
}

export interface BoardDeckDraft {
  id: string
  name: LocalizedText
  cards: BoardCardDraft[]
}

export interface BoardDraftDocument {
  schema_version: 5
  side_length: number
  information: BoardInformation
  economy: BoardEconomy
  groups: PropertyGroupDraft[]
  tiles: BoardTileDraft[]
  decks: BoardDeckDraft[]
}

export interface BoardDraft {
  id: string
  revision: number
  status: BoardDraftStatus
  document: BoardDraftDocument
  created_at: string
  updated_at: string
  published_pack_id?: string | null
  published_version?: string | null
}

export interface BoardDraftSummary {
  id: string
  revision: number
  status: BoardDraftStatus
  name: LocalizedText
  side_length: number
  tile_count: number
  updated_at: string
  published_pack_id?: string | null
  published_version?: string | null
}

export interface BoardDraftSave {
  revision: number
  document: BoardDraftDocument
}

export interface BoardValidationIssue {
  path: string
  message: string
}

export interface BoardPublishResult {
  project_id: string
  pack_id: string
  version: string
  manifest: Record<string, unknown>
  published_at: string
}

export interface BoardVersionSummary {
  version: string
  pack_id: string
  published_at: string
}

export interface BoardAsset {
  id: string
  project_id: string
  name: string
  content_type: 'image/svg+xml'
  size_bytes: number
  sha256: string
  path: string
  created_at: string
}
