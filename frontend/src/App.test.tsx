import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mountApp } from './test/mountPage'
import { setupApiMocks } from './test/server'

// L'albero di rotte vero. Non è una tabella e basta: contiene due decisioni che
// si notano solo quando mancano — chi non ha una sessione finisce al login, e un
// indirizzo sconosciuto torna alla Dashboard invece di lasciare una pagina
// bianca.

setupApiMocks()

describe('rotte', () => {
  it('senza sessione qualunque pagina protetta porta al login', async () => {
    const vista = mountApp({ route: '/transazioni', authenticated: false })

    await waitFor(() => expect(vista.currentPath()).toBe('/login'))
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeInTheDocument()
  })

  it('con la sessione la pagina protetta si apre', async () => {
    mountApp({ route: '/transazioni' })

    // "Transazioni" compare anche nelle due barre di navigazione: si guarda
    // l'intestazione della pagina, non un testo qualunque.
    expect(await screen.findByRole('heading', { name: 'Transazioni' })).toBeInTheDocument()
  })

  /**
   * Un indirizzo che non esiste — un vecchio segnalibro, un link rotto — riporta alla
   * Dashboard. Senza il catch-all resterebbe una pagina bianca senza spiegazione e senza
   * un modo ovvio per uscirne.
   */
  it('una rotta sconosciuta riporta alla Dashboard', async () => {
    const vista = mountApp({ route: '/pagina-che-non-esiste' })

    await waitFor(() => expect(vista.currentPath()).toBe('/'))
  })

  it('il login resta raggiungibile anche con una sessione attiva', async () => {
    const vista = mountApp({ route: '/login' })

    await waitFor(() => expect(vista.currentPath()).toBe('/login'))
  })
})
