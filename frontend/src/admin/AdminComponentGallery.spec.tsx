import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { AdminComponentGallery } from './AdminComponentGallery'

afterEach(async () => {
  await i18n.changeLanguage('es')
})

describe('AdminComponentGallery', () => {
  it('renders the complete visual catalog in Spanish', async () => {
    await i18n.changeLanguage('es')

    const html = renderToStaticMarkup(createElement(AdminComponentGallery))

    expect(html).toContain('Catálogo de componentes')
    expect(html).toContain('Módulos de la aplicación')
    expect(html).toContain('Partidas activas')
    expect(html).toContain('Chat de la mesa')
    expect(html).toContain('Banco y crédito')
    expect(html).toContain('Mercado')
    expect(html).toContain('Propiedades')
    expect(html).toContain('Intercambios')
    expect(html).toContain('Administración de bots')
    expect(html).toContain('Modales y tarjetas')
    expect(html).toContain('Subasta · ofertas')
    expect(html).toContain('Tarjetas · selección')
    expect(html).toContain('Detalle de propiedad')
    expect(html).toContain('Fundamentos')
    expect(html).toContain('Botones y acciones')
    expect(html).toContain('Formularios y selección')
    expect(html).toContain('Estados y feedback')
    expect(html).toContain('Componentes del juego')
  })

  it('has English catalog translations', async () => {
    await i18n.changeLanguage('en')

    const html = renderToStaticMarkup(createElement(AdminComponentGallery))

    expect(html).toContain('Component catalog')
    expect(html).toContain('Application modules')
    expect(html).toContain('Bank and credit')
    expect(html).toContain('Bot management')
    expect(html).toContain('Dialogs and cards')
    expect(html).toContain('Auction · bidding')
    expect(html).toContain('Game components')
  })
})
