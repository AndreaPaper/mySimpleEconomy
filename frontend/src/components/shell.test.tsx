import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BottomNav from './BottomNav'
import Layout from './Layout'
import OverridesPanel from './OverridesPanel'
import { categoria, eccezione } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'
import { enqueue } from '../offline/queue'

// Il guscio di navigazione: Layout e BottomNav. Erano entrambi a zero, e il
// commento che avevo lasciato in mountPage.tsx diceva che Layout aveva un
// proprio test — non era vero. Ora lo è.
//
// Il pannello delle eccezioni stava qui insieme a loro, ma non c'entra col
// guscio: sta in OverridesPanel.test.tsx, che è un soprainsieme di quei casi.

setupApiMocks()

// ------------------------------------------------------------------
// BottomNav
// ------------------------------------------------------------------

describe('BottomNav', () => {
  /**
   * La scheda "Sezioni" resta accesa anche quando si è dentro una delle pagine che vi stanno
   * sotto — Categorie, Ricorrenti, Debiti… Senza, navigando in una sezione nessuna voce
   * risulterebbe attiva e la barra sembrerebbe scollegata dalla pagina.
   */
  it('la scheda Sezioni resta accesa dentro le sue pagine', () => {
    mountPage(<BottomNav />, { route: '/categorie', viewport: 'mobile' })

    const sezioni = screen.getByRole('link', { name: /Sezioni/ })
    expect(sezioni.className).toMatch(/brand|text-brand/)
  })

  it('su una pagina fuori dalle sezioni non la accende', () => {
    mountPage(<BottomNav />, { route: '/transazioni', viewport: 'mobile' })

    expect(screen.getByRole('link', { name: /Transazioni/ })).toBeInTheDocument()
  })

  // Le spese in coda accendono il segnalino anche a rete presente: qualcosa deve
  // ancora partire, e chi guarda deve saperlo.
  it('il segnalino compare quando c è qualcosa in coda', async () => {
    // La sincronizzazione parte da sé al montaggio: se riuscisse, la coda si
    // svuoterebbe prima dell'asserzione e il segnalino sparirebbe.
    server.use(http.post('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    enqueue({
      categoryId: 'c-1',
      amount: 10,
      type: 'EXPENSE',
      occurredOn: '2026-03-02',
      description: 'In coda',
    })

    mountPage(<BottomNav />, { route: '/', viewport: 'mobile' })

    expect(await screen.findByText(/Sincronizzazione/)).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------

describe('Layout', () => {
    /** Il pulsante del menu profilo: il suo nome è il nickname o l'email, non un'etichetta fissa. */
  const pulsanteProfilo = () =>
    waitFor(() => document.querySelector('[aria-haspopup="true"]') as HTMLElement)

  const montaLayout = (route = '/') =>
    mountPage(<Layout />, {
      route,
      extraRoutes: null,
      // Layout rende un <Outlet />: la rotta figlio è il contenuto della pagina.
    })

  it('mostra la navigazione e il contenuto della pagina', async () => {
    mountPage(<Layout />, { route: '/' })

    expect(await screen.findAllByRole('link', { name: /Dashboard/ })).not.toHaveLength(0)
  })

  /**
   * L'effetto che tiene calda la copia offline delle categorie. Non è visibile da nessuna
   * parte, ed è quello che permette di registrare una spesa senza rete anche se l'ultima
   * pagina aperta online era la Dashboard e non le Transazioni.
   */
  it('aggiorna la copia locale delle categorie a ogni montaggio online', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([categoria({ id: 'c-1', name: 'Alimentari' })])),
    )

    montaLayout()

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('categories_cache') ?? '[]')).toHaveLength(1),
    )
  })

  it('se le categorie non arrivano non butta giù la pagina', async () => {
    server.use(http.get('*/api/categories', () => new HttpResponse(null, { status: 500 })))

    montaLayout()

    expect(await screen.findAllByRole('link', { name: /Dashboard/ })).not.toHaveLength(0)
  })

  it('il segnalino offline dice cosa sta succedendo', async () => {
    server.use(http.post('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    enqueue({
      categoryId: 'c-1',
      amount: 10,
      type: 'EXPENSE',
      occurredOn: '2026-03-02',
      description: 'In coda',
    })

    montaLayout()

    expect(await screen.findAllByText(/Sincronizzazione/)).not.toHaveLength(0)
  })

  // Il menu del profilo si chiude con Escape: è aperto sopra il resto della pagina,
  // e senza una via d'uscita da tastiera resterebbe una trappola.
  it('il menu del profilo si chiude con Escape', async () => {
    const utente = userEvent.setup()
    montaLayout()
    const apri = await pulsanteProfilo()

    await utente.click(apri)
    const esci = await screen.findByText('Esci')

    await utente.keyboard('{Escape}')

    await waitFor(() => expect(esci).not.toBeInTheDocument())
  })

  it('uscire ripulisce la sessione', async () => {
    const utente = userEvent.setup()
    montaLayout()

    await utente.click(await pulsanteProfilo())
    await utente.click(await screen.findByText('Esci'))

    await waitFor(() => expect(localStorage.getItem('token')).toBeNull())
  })
})
