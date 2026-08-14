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
    expect(html).toContain('Game components')
  })
})
