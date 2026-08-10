import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { ContentPack, EconomicSimulationState, GameState } from '../types'
import { EconomicPulsePanel } from './EconomicPulsePanel'

const pack = {
  messages: {
    'instrument.telecom': 'Telecomunicaciones',
    'instrument.prison': 'Concesión penitenciaria',
    'instrument.centralBank': 'Banco central de la partida',
    'instrument.hidden': 'Instrumento fuera del límite',
  },
} as unknown as ContentPack

const baseEconomy: EconomicSimulationState = {
  current_date: '2026-09-07',
  elapsed_weeks: 4,
  season: 'spring',
  weather: 'storm',
  weather_intensity: 2,
  cycle: 'recovery',
  annual_growth_basis_points: 202,
  annual_inflation_basis_points: 342,
  policy_rate_basis_points: 461,
  unemployment_basis_points: 656,
  consumer_confidence: 87,
  market_sentiment: -3,
  active_events: [
    { kind: 'consumer_boom', remaining_weeks: 5, intensity: 2 },
  ],
  last_market_movements: [
    movement('telecom', 283),
    movement('prison', 262),
    movement('central-bank', 254),
    movement('hidden', 999),
  ],
  last_company_action: 'new_contract',
  last_company_instrument_id: 'telecom',
}

afterEach(async () => {
  await i18n.changeLanguage('es')
})

describe('EconomicPulsePanel', () => {
  it('uses localized, semantic and bounded economic presentation', async () => {
    await i18n.changeLanguage('es')

    const html = renderToStaticMarkup(
      createElement(EconomicPulsePanel, {
        game: gameWithEconomy(baseEconomy),
        pack,
      }),
    )

    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('dateTime="2026-09-07"')
    expect(html).toContain('7 de septiembre de 2026')
    expect(html).toContain('Semana 5')
    expect(html).toContain('Primavera · dificultad Estándar')
    expect(html).toContain('Indicadores económicos')
    expect(html).toMatch(/<dl\b/)
    expect(html).toMatch(/<dt\b/)
    expect(html).toMatch(/<dd\b/)
    expect(html).toMatch(/<ul\b/)
    expect(html).toMatch(/<li\b/)
    expect(html).toContain('2,02')
    expect(html).toContain('Auge del consumo')
    expect(html).toContain('5 semanas restantes')
    expect(html).toContain('Telecomunicaciones')
    expect(html).toContain('obtuvo un contrato importante')
    expect(html).toContain('+2,83')
    expect(html).toContain('Banco central de la partida')
    expect(html).not.toContain('Instrumento fuera del límite')
  })

  it('omits empty event, company and market sections', async () => {
    await i18n.changeLanguage('en')
    const html = renderToStaticMarkup(
      createElement(EconomicPulsePanel, {
        game: gameWithEconomy({
          ...baseEconomy,
          active_events: [],
          last_market_movements: [],
          last_company_action: null,
          last_company_instrument_id: null,
        }),
        pack,
      }),
    )

    expect(html).toContain('Economic indicators')
    expect(html).not.toContain('Active events')
    expect(html).not.toContain('Company news')
    expect(html).not.toContain('Weekly market movement')
  })

  it('uses truthful direction icons for negative growth and a flat market', async () => {
    await i18n.changeLanguage('es')
    const html = renderToStaticMarkup(
      createElement(EconomicPulsePanel, {
        game: gameWithEconomy({
          ...baseEconomy,
          annual_growth_basis_points: -125,
          active_events: [],
          last_market_movements: [movement('telecom', 0)],
          last_company_action: null,
          last_company_instrument_id: null,
        }),
        pack,
      }),
    )

    expect(html).toContain('TrendingDownRoundedIcon')
    expect(html).toContain('TrendingFlatRoundedIcon')
    expect(html).not.toContain('TrendingUpRoundedIcon')
  })
})

function movement(instrumentId: string, changeBasisPoints: number) {
  return {
    instrument_id: instrumentId,
    previous_price: 100,
    current_price: 103,
    change_basis_points: changeBasisPoints,
    primary_cause: 'economic_event',
  }
}

function gameWithEconomy(economy: EconomicSimulationState): GameState {
  return {
    economy,
    settings: { economic_difficulty: 'standard' },
    bank: {
      investments: [
        { id: 'telecom', name_key: 'instrument.telecom' },
        { id: 'prison', name_key: 'instrument.prison' },
        { id: 'central-bank', name_key: 'instrument.centralBank' },
        { id: 'hidden', name_key: 'instrument.hidden' },
      ],
    },
  } as unknown as GameState
}
