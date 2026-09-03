import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TransactionsPage from './TransactionsPage'
import { transazione } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'
import { enqueue } from '../offline/queue'

// La pagina Transazioni. La derivazione delle righe è già coperta in
// utils/transactionRows; qui si prova ciò che vive solo nella pagina — la
// guardia contro le risposte fuori ordine, la paginazione, l'esportazione — e
// che non si vede a schermo quando si rompe.

setupApiMocks()

afterEach(() => {
  vi.restoreAllMocks()
})

const pagina = (content: ReturnType<typeof transazione>[], hasNext = false) => ({ content, hasNext })

describe('elenco e paginazione', () => {
  it('mostra le transazioni del primo caricamento', async () => {
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json(pagina([transazione({ id: 't-1', description: 'Ekom', amount: 42.5 })])),
      ),
    )
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('Ekom')).toBeInTheDocument()
  })

  it('"Carica altro" accoda la pagina successiva invece di sostituirla', async () => {
    let chiamate = 0
    server.use(
      http.get('*/api/transactions', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page')
        chiamate++
        if (page === '0') return HttpResponse.json(pagina([transazione({ id: 't-1', description: 'Prima' })], true))
        return HttpResponse.json(pagina([transazione({ id: 't-2', description: 'Seconda' })], false))
      }),
    )
    const utente = userEvent.setup()
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 } })

    await screen.findByText('Prima')
    await utente.click(screen.getByRole('button', { name: 'Carica altro' }))

    // Le due restano insieme: la seconda pagina si aggiunge, non rimpiazza.
    expect(await screen.findByText('Seconda')).toBeInTheDocument()
    expect(screen.getByText('Prima')).toBeInTheDocument()
    expect(chiamate).toBeGreaterThanOrEqual(2)
  })
})

describe('la guardia contro le risposte fuori ordine', () => {
  /**
   * Il test che vale la pagina. Cambiando filtro in fretta, la prima richiesta
   * (lenta) risponde dopo la seconda (veloce): senza `latestRequest` che scarta
   * la risposta superata, l'elenco mostrerebbe i risultati del filtro vecchio, e
   * niente a schermo lo direbbe. Qui la prima risposta arriva volutamente per
   * ultima, e non deve vincere.
   */
  it('scarta la risposta di una richiesta superata da una più recente', async () => {
    // La corsa vera è fra due cambi di filtro consecutivi (il primo cambio,
    // finché il caricamento iniziale è in volo, è bloccato da `if (loading)`).
    // Il caricamento iniziale è quindi veloce; poi due cambi ravvicinati: il
    // primo lento porta "vecchio", il secondo veloce porta "nuovo".
    let chiamata = 0
    server.use(
      http.get('*/api/transactions', async () => {
        chiamata++
        if (chiamata === 1) return HttpResponse.json(pagina([]))
        if (chiamata === 2) {
          await new Promise((r) => setTimeout(r, 150))
          return HttpResponse.json(pagina([transazione({ id: 'vecchia', description: 'Risultato vecchio' })]))
        }
        return HttpResponse.json(pagina([transazione({ id: 'nuova', description: 'Risultato nuovo' })]))
      }),
    )
    // I filtri per data stanno nel foglio su mobile (su desktop è un calendario):
    // qui serve un input diretto da cambiare, quindi mobile + apertura del foglio.
    const utente = userEvent.setup()
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 }, viewport: 'mobile' })

    await utente.click(await screen.findByRole('button', { name: 'Filtri' }))
    const dal = await screen.findByLabelText('Dal')
    // Aspetta che il caricamento iniziale sia finito, altrimenti il primo cambio
    // viene ignorato dalla guardia `if (loading)`.
    await waitFor(() => expect(chiamata).toBe(1))

    // Due cambi ravvicinati: parte la richiesta lenta, poi subito la veloce.
    fireEvent.change(dal, { target: { value: '2026-03-01' } })
    fireEvent.change(dal, { target: { value: '2026-03-02' } })

    expect(await screen.findByText('Risultato nuovo')).toBeInTheDocument()
    // La risposta lenta arriva dopo: la guardia la scarta, non deve rimpiazzare.
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByText('Risultato vecchio')).not.toBeInTheDocument()
    expect(screen.getByText('Risultato nuovo')).toBeInTheDocument()
  })
})

describe('le spese in coda', () => {
  it('compaiono nell elenco marcate come in attesa, insieme a quelle salvate', async () => {
    enqueue({
      categoryId: 'c-1',
      amount: 15,
      type: 'EXPENSE',
      occurredOn: '2026-03-05',
      description: 'In coda',
    })
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json(pagina([transazione({ id: 't-1', description: 'Salvata', occurredOn: '2026-03-04' })])),
      ),
      http.get('*/api/categories', () =>
        HttpResponse.json([
          { id: 'c-1', name: 'Alimentari', type: 'EXPENSE', color: '#F6C9C0', icon: null, parentId: null, archived: false },
        ]),
      ),
    )
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('In coda')).toBeInTheDocument()
    expect(screen.getByText('Salvata')).toBeInTheDocument()
  })
})

describe('esportazione', () => {
  /**
   * L'export fabbrica un `<a download>` con un blob e lo clicca. Il nome del
   * file cambia a seconda che ci siano filtri attivi: perderlo darebbe a ogni
   * esportazione lo stesso nome, e i download filtrati si sovrascriverebbero.
   */
  it('scarica un file col nome giusto quando non ci sono filtri', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let scaricato: string | null = null
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      scaricato = this.download
    })
    const utente = userEvent.setup()
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 } })

    await screen.findByRole('button', { name: 'Esporta' })
    await utente.click(screen.getByRole('button', { name: 'Esporta' }))

    await waitFor(() => expect(scaricato).toBe('transazioni.xlsx'))
    expect(createUrl).toHaveBeenCalled()
  })
})

describe('eliminazione', () => {
  it('un errore resta nel dialogo invece di chiuderlo in silenzio', async () => {
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json(pagina([transazione({ id: 't-1', description: 'Da eliminare' })])),
      ),
      http.delete('*/api/transactions/:id', () => new HttpResponse(null, { status: 500 })),
    )
    const utente = userEvent.setup()
    mountPage(<TransactionsPage />, { profile: { salaryDay: 27 } })

    const riga = (await screen.findByText('Da eliminare')).closest('li') as HTMLElement
    await utente.click(within(riga).getByRole('button', { name: 'Elimina' }))
    // Il pulsante della riga e quello del dialogo hanno lo stesso nome: la
    // conferma si prende dentro il dialogo, per titolo.
    const dialogo = (await screen.findByText('Elimina transazione')).closest('div[class*="max-w"]') as HTMLElement
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    expect(await screen.findByText(/Eliminazione non riuscita/)).toBeInTheDocument()
  })
})
