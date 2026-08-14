import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { ContentPack, GameState, PublicProjectState, User } from '../types'
import { AdvancedEconomyPanel } from './AdvancedEconomyPanel'

const userId = '00000000-0000-4000-8000-000000000001'
const user = { id: userId, display_name: 'Espere' } as unknown as User

afterEach(async () => {
  await i18n.changeLanguage('es')
})

describe('AdvancedEconomyPanel', () => {
  it('names scheduled operating costs and explains accumulated inflation', async () => {
    await i18n.changeLanguage('es')
    const game = fixture({
      elapsedWeeks: 139,
      assessment: {
        due_week: 140,
        announced_week: 139,
        amounts: { [userId]: 198 },
        resolved_player_ids: [],
      },
    })

    const html = render(game)

    expect(html).toContain('Costos operativos programados')
    expect(html).toContain('$198')
    expect(html).toContain('Inflación acumulada')
    expect(html).toContain('1,8')
    expect(html).not.toContain('Próximo cierre')
    expect(html).toContain('border-radius:20px')
    expect(html).toContain('border-radius:16px')
  })

  it('marks a project closed as soon as its closing week begins', () => {
    const game = fixture({
      elapsedWeeks: 145,
      project: project({ bidding_ends_week: 145 }),
      ownsRequiredAsset: true,
    })

    const html = render(game)

    expect(html).toContain('Licitación cerrada')
    expect(html).toContain('El plazo terminó al comenzar la semana 145')
    expect(html).not.toContain('cierre semana 145')
  })

  it('shows the concrete reason when asset requirements block a bid', () => {
    const game = fixture({
      elapsedWeeks: 144,
      project: project({ bidding_ends_week: 145 }),
    })

    const html = render(game)

    expect(html).toContain('Última semana para ofertar: 144')
    expect(html).toContain('No puedes ofertar: todavía no cumples')
    expect(html).toContain('Efectivo: $20000')
  })
})

function render(game: GameState): string {
  return renderToStaticMarkup(
    createElement(AdvancedEconomyPanel, {
      game,
      pack: pack(),
      user,
      busy: false,
      onCommand: async () => true,
    }),
  )
}

function fixture({
  elapsedWeeks,
  assessment = null,
  project: activeProject,
  ownsRequiredAsset = false,
}: {
  elapsedWeeks: number
  assessment?: GameState['economy']['operating_cost_assessment']
  project?: PublicProjectState
  ownsRequiredAsset?: boolean
}): GameState {
  return {
    status: 'playing',
    settings: {
      advanced_economy_enabled: true,
      finale_duration_weeks: 12,
    },
    players: [
      {
        user_id: userId,
        display_name: 'Espere',
        balance: 20_000,
        bankrupt: false,
      },
    ],
    current_player_index: 0,
    owners: ownsRequiredAsset ? { utility_1: userId } : {},
    mortgaged_property_ids: [],
    building_levels: {},
    economy: {
      elapsed_weeks: elapsedWeeks,
      price_index_basis_points: 10_180,
      forecast_events: [],
      operating_cost_assessment: assessment,
      operating_debts: [],
      public_projects: activeProject ? [activeProject] : [],
      finale_vote: null,
      finale: null,
    },
  } as unknown as GameState
}

function project(
  overrides: Partial<PublicProjectState> = {},
): PublicProjectState {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    kind: 'energy_expansion',
    announced_week: 144,
    bidding_ends_week: 145,
    minimum_bid: 14_246,
    reward_amount: 19_944,
    required_tile_kind: 'utility',
    required_building_levels: 0,
    bids: {},
    status: 'bidding',
    owner_id: null,
    winning_bid: 0,
    completes_week: null,
    ...overrides,
  }
}

function pack(): ContentPack {
  return {
    board: {
      tiles: [
        {
          id: 'utility_1',
          kind: 'utility',
          name_key: 'utility_1',
        },
      ],
      decks: [],
    },
    messages: {},
  } as unknown as ContentPack
}
