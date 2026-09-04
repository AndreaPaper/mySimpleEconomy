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

// Il guscio di navigazione e il pannello delle eccezioni. Erano tutti e tre a
// zero: il commento che avevo lasciato in mountPage.tsx diceva che Layout aveva
// un proprio test, e non era vero. Ora lo è.

setupApiMocks()

// ------------------------------------------------------------------
// OverridesPanel
// ------------------------------------------------------------------

describe('OverridesPanel', () => {
  it('elenca le eccezioni della regola', async () => {
    server.use(
      http.get('*/api/recurring-transactions/:id/overrides', () =>
        HttpResponse.json([eccezione({ id: 'o-1', overrideAmount: 230, note: 'conguaglio' })]),
      ),
    )
    mountPage(<OverridesPanel recurringTransactionId="r-1" />)

    expect(await screen.findByText(/conguaglio/)).toBeInTheDocument()
  })

  it('senza eccezioni lo dice invece di mostrare un elenco vuoto', async () => {
    mountPage(<OverridesPanel recurringTransactionId="r-1" />)

    expect(await screen.findByText(/Nessuna eccezione/)).toBeInTheDocument()
  })

  /**
   * L'aggiunta ricarica l'elenco e ripulisce i campi: senza il ricaricamento
   * l'eccezione appena creata non comparirebbe finché non si riapre il pannello, e
   * l'utente proverebbe ad aggiungerla di nuovo — trovando l'errore del doppione.
   */
  it('aggiungere un eccezione ricarica l elenco e svuota i campi', async () => {
    let creazioni = 0
    server.use(
      http.post('*/api/recurring-transactions/:id/overrides', () => {
        creazioni++
        return HttpResponse.json(eccezione(), { status: 201 })
      }),
      http.get('*/api/recurring-transactions/:id/overrides', () =>
        creazioni === 0 ? HttpResponse.json([]) : HttpResponse.json([eccezione({ note: 'aggiunta' })]),
      ),
    )
    const utente = userEvent.setup()
    mountPage(<OverridesPanel recurringTransactionId="r-1" />)
    await screen.findByText(/Nessuna eccezione/)

    await utente.type(screen.getByLabelText('Importo eccezione'), '230')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi' }))

    expect(await screen.findByText(/aggiunta/)).toBeInTheDocument()
    expect((screen.getByLabelText('Importo eccezione') as HTMLInputElement).value).toBe('')
  })

  it('una data già usata lo dice invece di fallire in silenzio', async () => {
    server.use(
      http.post('*/api/recurring-transactions/:id/overrides', () => new HttpResponse(null, { status: 409 })),
    )
    const utente = userEvent.setup()
    mountPage(<OverridesPanel recurringTransactionId="r-1" />)
    await screen.findByText(/Nessuna eccezione/)

    await utente.type(screen.getByLabelText('Importo eccezione'), '230')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi' }))

    expect(await screen.findByText(/Esiste già un'eccezione per questa data/)).toBeInTheDocument()
  })
})

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
