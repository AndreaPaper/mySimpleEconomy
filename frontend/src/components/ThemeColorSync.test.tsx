import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ThemeColorSync from './ThemeColorSync'

// Il colore della barra del browser. In jsdom il CSS dell'app non c'è: uno stile
// minimo fa la parte di index.css, con uno sfondo per il chiaro, uno per lo scuro e
// uno per un'altra palette — gli stessi selettori con cui index.css colora lo sfondo
// del Layout.

const stile = document.createElement('style')
stile.textContent = `
  .bg-brand-100 { background-color: rgb(245, 250, 255); }
  html.dark .bg-brand-100.dark\\:bg-black { background-color: rgb(11, 22, 32); }
  html[data-palette="vividkpi"] .bg-brand-100 { background-color: rgb(255, 244, 239); }
`

const metas = () =>
  Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map((m) => m.content)

beforeEach(() => {
  document.head.appendChild(stile)
  // Come index.html: un colore per il telefono chiaro e uno per quello scuro.
  for (const [media, content] of [
    ['(prefers-color-scheme: light)', '#F5FAFF'],
    ['(prefers-color-scheme: dark)', '#0B1620'],
  ]) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.media = media
    meta.content = content
    document.head.appendChild(meta)
  }
})

afterEach(() => {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  stile.remove()
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-palette')
})

describe('il colore della barra del browser', () => {
  it('prende lo sfondo della pagina', async () => {
    render(<ThemeColorSync />)

    await waitFor(() => expect(metas()).toEqual(['rgb(245, 250, 255)', 'rgb(245, 250, 255)']))
  })

  /**
   * Il tema scelto nell'app vale più di quello del telefono: tutti e due i meta
   * prendono lo stesso colore, anche quello riservato al telefono chiaro. Senza, con
   * il telefono in chiaro e l'app in scuro la barra resterebbe chiara.
   */
  it('passando allo scuro la barra lo segue', async () => {
    render(<ThemeColorSync />)

    document.documentElement.classList.add('dark')

    await waitFor(() => expect(metas()).toEqual(['rgb(11, 22, 32)', 'rgb(11, 22, 32)']))
  })

  it('cambiando palette la barra la segue', async () => {
    render(<ThemeColorSync />)

    document.documentElement.setAttribute('data-palette', 'vividkpi')

    await waitFor(() => expect(metas()).toEqual(['rgb(255, 244, 239)', 'rgb(255, 244, 239)']))
  })

  // Il CSS che arriva dopo il primo tentativo: a pagina caricata la barra si
  // riallinea, invece di restare sul colore di partenza fino al primo cambio di tema.
  it('se lo stile arriva dopo, si riallinea a pagina caricata', async () => {
    stile.remove()
    render(<ThemeColorSync />)
    await new Promise((r) => setTimeout(r, 20))
    expect(metas()).toEqual(['#F5FAFF', '#0B1620'])

    document.head.appendChild(stile)
    window.dispatchEvent(new Event('load'))

    await waitFor(() => expect(metas()).toEqual(['rgb(245, 250, 255)', 'rgb(245, 250, 255)']))
  })

  // Senza CSS lo sfondo è trasparente: dipingere la barra di nero sarebbe peggio
  // che tenere il colore di partenza.
  it('senza uno sfondo calcolato lascia il colore di partenza', async () => {
    stile.remove()
    render(<ThemeColorSync />)

    await new Promise((r) => setTimeout(r, 20))
    expect(metas()).toEqual(['#F5FAFF', '#0B1620'])
  })
})
