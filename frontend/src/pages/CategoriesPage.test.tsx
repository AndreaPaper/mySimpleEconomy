import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import CategoriesPage from './CategoriesPage'
import { categoria } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Categorie. La logica che vale un test è la macchina a stati della conferma:
// tre azioni (archivia, elimina, ripristina) e tre messaggi di errore distinti.
// È il punto dove un catch unico direbbe la cosa sbagliata — "archiviazione non
// riuscita" quando invece è un'eliminazione bloccata da una transazione
// collegata, cioè il caso più frequente.

setupApiMocks()

const casa = categoria({ id: 'c-casa', name: 'Casa' })

// Il dialogo di conferma è dentro il Modal (.fixed.inset-0); si prende da lì
// per non pescare l'intestazione di pagina.
const dialogo = () => document.querySelector('.fixed.inset-0') as HTMLElement

describe('gli errori della conferma parlano dell azione giusta', () => {
  it('un eliminazione bloccata suggerisce di archiviare', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([casa])),
      http.delete('*/api/categories/:id', () => new HttpResponse(null, { status: 409 })),
    )
    const utente = userEvent.setup()
    mountPage(<CategoriesPage />, { route: '/categorie' })

    await screen.findByText('Casa')
    await utente.click(screen.getByRole('button', { name: 'Elimina' }))
    const box = dialogo()
    await utente.click(within(box).getByRole('button', { name: 'Elimina' }))

    // Il messaggio è specifico dell'eliminazione: nomina i collegamenti e
    // suggerisce l'archiviazione.
    expect(await screen.findByText(/Impossibile eliminare/)).toBeInTheDocument()
    expect(screen.getByText(/archiviarla/)).toBeInTheDocument()
  })

  it('un archiviazione fallita dà il proprio messaggio, non quello dell eliminazione', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([casa])),
      http.post('*/api/categories/:id/archive', () => new HttpResponse(null, { status: 500 })),
    )
    const utente = userEvent.setup()
    mountPage(<CategoriesPage />, { route: '/categorie' })

    await screen.findByText('Casa')
    await utente.click(screen.getByRole('button', { name: 'Archivia' }))
    const box = dialogo()
    await utente.click(within(box).getByRole('button', { name: 'Archivia' }))

    expect(await screen.findByText('Archiviazione non riuscita. Riprova.')).toBeInTheDocument()
    expect(screen.queryByText(/Impossibile eliminare/)).not.toBeInTheDocument()
  })

  it('una riattivazione fallita dà il proprio messaggio', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([])),
      http.get('*/api/categories/archived', () => HttpResponse.json([casa])),
      http.post('*/api/categories/:id/unarchive', () => new HttpResponse(null, { status: 500 })),
    )
    const utente = userEvent.setup()
    mountPage(<CategoriesPage />, { route: '/categorie' })

    // Le archiviate stanno in un pannello richiuso: prima lo si apre.
    await utente.click(await screen.findByRole('button', { name: /Categorie archiviate/i }))
    await screen.findByText('Casa')
    await utente.click(screen.getByRole('button', { name: 'Riattiva' }))
    const box = dialogo()
    await utente.click(within(box).getByRole('button', { name: /Ripristina|Riattiva/ }))

    expect(await screen.findByText('Riattivazione non riuscita. Riprova.')).toBeInTheDocument()
  })
})

describe('categorie predefinite', () => {
  it('dice quante ne ha aggiunte', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([])),
      http.post('*/api/categories/generate-defaults', () =>
        HttpResponse.json([categoria({ id: 'g1', name: 'Alimentari' }), categoria({ id: 'g2', name: 'Trasporti' })]),
      ),
    )
    const utente = userEvent.setup()
    mountPage(<CategoriesPage />, { route: '/categorie' })

    await utente.click(await screen.findByRole('button', { name: /Genera predefinite/i }))

    expect(await screen.findByText('2 categorie aggiunte.')).toBeInTheDocument()
  })

  it('quando le aveva già tutte lo dice', async () => {
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([casa])),
      http.post('*/api/categories/generate-defaults', () => HttpResponse.json([])),
    )
    const utente = userEvent.setup()
    mountPage(<CategoriesPage />, { route: '/categorie' })

    await utente.click(await screen.findByRole('button', { name: /Genera predefinite/i }))

    expect(await screen.findByText('Le avevi già tutte.')).toBeInTheDocument()
  })
})
