import type { GameState, TileDefinition } from '../types'

export function indexedAmount(
  game: GameState,
  amount: number,
  passThroughPercent = 100,
): number {
  if (!game.settings?.advanced_economy_enabled || amount <= 0) return Math.max(0, amount)
  const delta = (game.economy?.price_index_basis_points ?? 10_000) - 10_000
  const effectiveIndex = 10_000 + Math.round((delta * passThroughPercent) / 100)
  return Math.round((amount * effectiveIndex) / 10_000)
}

export function indexedRent(
  game: GameState,
  tile: TileDefinition,
  amount: number,
): number {
  let percent = 100
  if (
    game.settings?.advanced_economy_enabled &&
    (game.economy?.elapsed_weeks ?? 0) >= 12
  ) {
    percent = {
      expansion: 108,
      slowdown: 92,
      recession: 85,
      recovery: 105,
    }[game.economy?.cycle ?? 'expansion']
    for (const event of game.economy?.active_events ?? []) {
      if (event.kind === 'consumer_boom' && tile.kind === 'property') percent += 5 * event.intensity
      else if (
        (event.kind === 'supply_shock' && ['transport', 'utility'].includes(tile.kind)) ||
        (event.kind === 'innovation_boom' && tile.kind === 'utility')
      ) percent += 8 * event.intensity
      else if (event.kind === 'labor_dispute' && tile.kind === 'transport') percent -= 8 * event.intensity
      else if (event.kind === 'fiscal_stimulus' && tile.kind === 'transport') percent += 5 * event.intensity
      else if (event.kind === 'credit_tightening' && tile.kind === 'property') percent -= 3 * event.intensity
    }
  }
  const ownerId = game.owners[tile.id]
  const hasOperatingDebt = (game.economy?.operating_debts ?? []).some(
    (debt) => debt.player_id === ownerId,
  )
  const adjusted = Math.round(
    (indexedAmount(game, amount, 65) * Math.max(60, Math.min(140, percent))) / 100,
  )
  return hasOperatingDebt ? Math.round((adjusted * 75) / 100) : adjusted
}
