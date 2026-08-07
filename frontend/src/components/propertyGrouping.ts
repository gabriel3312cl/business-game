import type { ContentPack, TileKind } from '../types'
import { defaultTileColor } from './tilePresentation'

export interface PropertyGroupBucket {
  key: string
  name: string | null
  kind: TileKind
  accent: string
  propertyIds: string[]
}

export function groupPropertyIds(
  pack: ContentPack,
  propertyIds: string[],
): PropertyGroupBucket[] {
  const requested = new Set(propertyIds)
  const buckets = new Map<string, PropertyGroupBucket>()

  for (const tile of pack.board.tiles) {
    if (!requested.has(tile.id)) continue
    const group = pack.board.groups?.find(
      (candidate) => candidate.id === tile.group,
    )
    const key = group ? `group:${group.id}` : `kind:${tile.kind}`
    const existing = buckets.get(key)
    if (existing) {
      existing.propertyIds.push(tile.id)
      continue
    }
    buckets.set(key, {
      key,
      name: group ? (pack.messages[group.name_key] ?? group.id) : null,
      kind: tile.kind,
      accent: group?.color ?? tile.color ?? defaultTileColor(tile.kind),
      propertyIds: [tile.id],
    })
  }

  return [...buckets.values()]
}
