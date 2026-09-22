import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import CategoriesPage from './CategoriesPage'
import DebtsPage from './DebtsPage'
import RecurringPage from './RecurringPage'
import RemindersPage from './RemindersPage'
import TransactionsPage from './TransactionsPage'
import { categoria, debito, promemoria, ricorrente, transazione } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Salvare e cancellare davvero.
//
// I test delle pagine si fermavano tutti un clic prima del punto in cui i dati
// cambiano: provavano che "Modifica" apre il modulo e che "Elimina" apre la
// domanda, mai che premendo Salva parta la richiesta giusta o che rispondendo
// "sì" si cancelli la cosa giusta. `handleSubmit` e `confirmDelete` erano
// scoperti in tutte e cinque le pagine.
//
// Per questo ogni prova qui ispeziona **verbo, indirizzo e corpo** della
// richiesta invece di limitarsi a "non è esploso": i gestori MSW predefiniti
// rispondono a tutto, quindi una pagina che chiamasse l'indirizzo sbagliato —
// o POST invece di PUT, creando un doppione invece di modificare — passerebbe
// lo stesso.
//
// Si usa lo schermo del telefono perché il foglio azioni è la strada già
// provata in mobile.test.tsx per arrivare a Modifica ed Elimina; il gestore
// che si esercita è lo stesso delle due varianti.

setupApiMocks()

const utente = () => userEvent.setup()
const foglio = () => document.querySelector('.fixed.inset-0.z-50') as HTMLElement

/** Registra verbo, indirizzo e corpo di una richiesta di scrittura. */
interface Scrittura {
  metodo: string
  url: string
  corpo: unknown
}

const categorie = [categoria({ id: 'c-1', name: 'Casa' })]

/** Apre il foglio azioni della riga e ne sceglie una voce. */
async function scegliDalFoglio(u: ReturnType<typeof userEvent.setup>, riga: string, voce: string) {
  await u.click(await screen.findByText(riga))
  await u.click(within(foglio()).getByText(voce))
}

describe('Debiti', () => {
  const prestito = debito({ id: 'd-1', name: 'Prestito auto', categoryId: 'c-1' })

  it('salvare una modifica manda un PUT sull id giusto', async () => {
    const u = utente()
    const scritture: Scrittura[] = []
    server.use(
      http.get('*/api/debts', () => HttpResponse.json([prestito])),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      http.put('*/api/debts/:id', async ({ request }) => {
        scritture.push({ metodo: 'PUT', url: request.url, corpo: await request.json() })
        return HttpResponse.json(prestito)
      }),
      // Se la pagina creasse invece di modificare, finirebbe qui: registrarlo
      // rende il fallimento leggibile invece di un timeout.
      http.post('*/api/debts', async ({ request }) => {
        scritture.push({ metodo: 'POST', url: request.url, corpo: await request.json() })
        return HttpResponse.json(prestito, { status: 201 })
      }),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Prestito auto', 'Modifica')
    await u.clear(screen.getByLabelText('Nome'))
    await u.type(screen.getByLabelText('Nome'), 'Prestito moto')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(scritture).toHaveLength(1))
    expect(scritture[0].metodo).toBe('PUT')
    expect(scritture[0].url).toContain('/api/debts/d-1')
    expect(scritture[0].corpo).toMatchObject({ name: 'Prestito moto' })
  })

  /**
   * La regressione che questo test difende, e che è già successa una volta.
   *
   * <p>Un debito creato senza acconto torna dal backend con
   * {@code alreadyPaidAmount: 0} — ce lo mette {@code Debt.onCreate}, quindi
   * vale per <em>tutti</em> i debiti normali. Finché il modulo giudicava sulla
   * stringa, "0" non era vuota: faceva comparire il campo data obbligatorio di
   * un acconto inesistente, e quel campo bloccava l'invio a livello di browser.
   * Si apriva un debito qualsiasi, si premeva Salva, e non partiva nulla —
   * nemmeno il messaggio d'errore, perché il modulo non arrivava a inviarsi.
   *
   * <p>Ora il giudizio è sul numero, come già faceva il backend
   * ({@code DebtService.validatedAlreadyPaidAmount} confronta con zero).
   */
  it('uno zero come "già pagato" non chiede nessuna data', async () => {
    const u = utente()
    let inviato = false
    server.use(
      http.get('*/api/debts', () => HttpResponse.json([prestito])),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      http.put('*/api/debts/:id', () => {
        inviato = true
        return HttpResponse.json(prestito)
      }),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Prestito auto', 'Modifica')
    expect(screen.getByLabelText(/Già pagato prima di iniziare/i)).toHaveValue(0)
    // Lo zero non è un acconto: il campo data non compare affatto.
    expect(screen.queryByLabelText('Già pagato fino al')).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(inviato).toBe(true))
  })

  /**
   * E il verso che deve restare: con un acconto <em>vero</em> la data serve
   * ancora, perché senza si sommerebbero due volte le spese storiche della
   * categoria. La correzione doveva togliere di mezzo lo zero, non spegnere la
   * validazione.
   */
  it('con un acconto vero la data resta obbligatoria', async () => {
    const u = utente()
    server.use(
      http.get('*/api/debts', () => HttpResponse.json([prestito])),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Prestito auto', 'Modifica')
    const acconto = screen.getByLabelText(/Già pagato prima di iniziare/i)
    await u.clear(acconto)
    await u.type(acconto, '500')

    const data = screen.getByLabelText('Già pagato fino al')
    expect(data).toBeRequired()
    // E viene proposta oggi, così il campo non resta vuoto per distrazione.
    expect(data).toHaveValue(new Date().toISOString().slice(0, 10))
  })

  it('confermando l eliminazione parte la DELETE e la riga sparisce', async () => {
    const u = utente()
    let cancellato: string | null = null
    server.use(
      http.get('*/api/debts', () => HttpResponse.json(cancellato ? [] : [prestito])),
      http.delete('*/api/debts/:id', ({ params }) => {
        cancellato = params.id as string
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Prestito auto', 'Elimina')
    const dialogo = within((await screen.findByText('Elimina debito')).closest('.fixed') as HTMLElement)
    await u.click(dialogo.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(cancellato).toBe('d-1'))
    await waitFor(() => expect(screen.queryByText('Prestito auto')).not.toBeInTheDocument())
  })

  /**
   * Un'eliminazione che fallisce deve dirlo <em>dentro</em> il dialogo, che
   * resta aperto. Chiudere e basta lascerebbe credere che sia andata, e la riga
   * riapparirebbe al prossimo caricamento senza spiegazione.
   */
  it('un eliminazione fallita lo dice e lascia aperto il dialogo', async () => {
    const u = utente()
    server.use(
      http.get('*/api/debts', () => HttpResponse.json([prestito])),
      http.delete('*/api/debts/:id', () => new HttpResponse(null, { status: 500 })),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Prestito auto', 'Elimina')
    const dialogo = within((await screen.findByText('Elimina debito')).closest('.fixed') as HTMLElement)
    await u.click(dialogo.getByRole('button', { name: 'Elimina' }))

    expect(await screen.findByText(/Eliminazione non riuscita/)).toBeInTheDocument()
    expect(screen.getByText('Elimina debito')).toBeInTheDocument()
  })
})

describe('Ricorrenti', () => {
  const affitto = ricorrente({ id: 'r-1', name: 'Affitto', categoryId: 'c-1' })

  it('salvare una modifica manda un PUT sull id giusto', async () => {
    const u = utente()
    const scritture: Scrittura[] = []
    server.use(
      http.get('*/api/recurring-transactions', () => HttpResponse.json([affitto])),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      http.put('*/api/recurring-transactions/:id', async ({ request }) => {
        scritture.push({ metodo: 'PUT', url: request.url, corpo: await request.json() })
        return HttpResponse.json(affitto)
      }),
      http.post('*/api/recurring-transactions', async ({ request }) => {
        scritture.push({ metodo: 'POST', url: request.url, corpo: await request.json() })
        return HttpResponse.json(affitto, { status: 201 })
      }),
    )
    mountPage(<RecurringPage />, { route: '/ricorrenti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Affitto', 'Modifica')
    await u.clear(screen.getByLabelText('Nome'))
    await u.type(screen.getByLabelText('Nome'), 'Affitto garage')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(scritture).toHaveLength(1))
    expect(scritture[0].metodo).toBe('PUT')
    expect(scritture[0].url).toContain('/api/recurring-transactions/r-1')
    expect(scritture[0].corpo).toMatchObject({ name: 'Affitto garage' })
  })

  it('confermando l eliminazione parte la DELETE sull id giusto', async () => {
    const u = utente()
    let cancellato: string | null = null
    server.use(
      http.get('*/api/recurring-transactions', () => HttpResponse.json(cancellato ? [] : [affitto])),
      http.delete('*/api/recurring-transactions/:id', ({ params }) => {
        cancellato = params.id as string
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountPage(<RecurringPage />, { route: '/ricorrenti', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Affitto', 'Elimina')
    const dialogo = within((await screen.findByText(/Elimina regola/)).closest('.fixed') as HTMLElement)
    await u.click(dialogo.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(cancellato).toBe('r-1'))
  })
})

describe('Categorie', () => {
  const casa = categoria({ id: 'c-1', name: 'Casa' })

  /**
   * La modifica di una categoria manda nome, colore, icona e padre — <em>non</em>
   * il tipo, che è immutabile e che il backend non accetta in modifica. Mandarlo
   * non darebbe errore: verrebbe ignorato, e la pagina crederebbe di poterlo
   * cambiare.
   */
  it('salvare una modifica manda i campi modificabili e non il tipo', async () => {
    const u = utente()
    const scritture: Scrittura[] = []
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([casa])),
      http.put('*/api/categories/:id', async ({ request }) => {
        scritture.push({ metodo: 'PUT', url: request.url, corpo: await request.json() })
        return HttpResponse.json(casa)
      }),
    )
    mountPage(<CategoriesPage />, { route: '/categorie', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Casa', 'Modifica')
    await u.clear(screen.getByLabelText('Nome'))
    await u.type(screen.getByLabelText('Nome'), 'Abitazione')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(scritture).toHaveLength(1))
    expect(scritture[0].url).toContain('/api/categories/c-1')
    expect(scritture[0].corpo).toMatchObject({ name: 'Abitazione' })
    expect(scritture[0].corpo).not.toHaveProperty('type')
  })

  it('confermando l archiviazione parte la richiesta di archivio, non la DELETE', async () => {
    const u = utente()
    const chiamate: string[] = []
    server.use(
      http.get('*/api/categories', () => HttpResponse.json([casa])),
      http.post('*/api/categories/:id/archive', ({ params }) => {
        chiamate.push('archive:' + params.id)
        return new HttpResponse(null, { status: 200 })
      }),
      http.delete('*/api/categories/:id', ({ params }) => {
        chiamate.push('delete:' + params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountPage(<CategoriesPage />, { route: '/categorie', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Casa', 'Archivia')
    const dialogo = within((await screen.findByText(/Archivia categoria/)).closest('.fixed') as HTMLElement)
    await u.click(dialogo.getByRole('button', { name: /Archivia/ }))

    // Archiviare e cancellare condividono lo stesso dialogo: sbagliare ramo qui
    // significa cancellare per sempre una categoria che si voleva mettere via.
    await waitFor(() => expect(chiamate).toEqual(['archive:c-1']))
  })
})

describe('Promemoria', () => {
  const bollo = promemoria({ id: 'p-1', name: 'Bollo auto', categoryId: 'c-1' })

  it('salvare una modifica manda un PUT sull id giusto', async () => {
    const u = utente()
    const scritture: Scrittura[] = []
    server.use(
      http.get('*/api/expense-reminders', () => HttpResponse.json([bollo])),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      http.put('*/api/expense-reminders/:id', async ({ request }) => {
        scritture.push({ metodo: 'PUT', url: request.url, corpo: await request.json() })
        return HttpResponse.json(bollo)
      }),
      http.post('*/api/expense-reminders', async ({ request }) => {
        scritture.push({ metodo: 'POST', url: request.url, corpo: await request.json() })
        return HttpResponse.json(bollo, { status: 201 })
      }),
    )
    mountPage(<RemindersPage />, { route: '/promemoria', viewport: 'mobile' })

    // Qui non c'è foglio azioni: il tocco sulla riga apre già la modifica.
    await u.click(await screen.findByText('Bollo auto'))
    await u.clear(screen.getByLabelText('Nome'))
    await u.type(screen.getByLabelText('Nome'), 'Bollo moto')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(scritture).toHaveLength(1))
    expect(scritture[0].metodo).toBe('PUT')
    expect(scritture[0].url).toContain('/api/expense-reminders/p-1')
    expect(scritture[0].corpo).toMatchObject({ name: 'Bollo moto' })
  })
})

describe('Transazioni', () => {
  const benzina = transazione({ id: 't-1', description: 'Benzina', amount: 45, categoryId: 'c-1' })

  it('salvare una modifica manda un PUT sull id giusto', async () => {
    const u = utente()
    const scritture: Scrittura[] = []
    server.use(
      http.get('*/api/transactions', () => HttpResponse.json({ content: [benzina], hasNext: false })),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      http.put('*/api/transactions/:id', async ({ request }) => {
        scritture.push({ metodo: 'PUT', url: request.url, corpo: await request.json() })
        return HttpResponse.json(benzina)
      }),
      http.post('*/api/transactions', async ({ request }) => {
        scritture.push({ metodo: 'POST', url: request.url, corpo: await request.json() })
        return HttpResponse.json(benzina, { status: 201 })
      }),
    )
    mountPage(<TransactionsPage />, { route: '/transazioni', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Benzina', 'Modifica')
    await u.clear(screen.getByLabelText(/Descrizione/))
    await u.type(screen.getByLabelText(/Descrizione/), 'Gasolio')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(scritture).toHaveLength(1))
    expect(scritture[0].metodo).toBe('PUT')
    expect(scritture[0].url).toContain('/api/transactions/t-1')
    expect(scritture[0].corpo).toMatchObject({ description: 'Gasolio' })
  })

  it('confermando l eliminazione parte la DELETE sull id giusto', async () => {
    const u = utente()
    let cancellato: string | null = null
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json({ content: cancellato ? [] : [benzina], hasNext: false }),
      ),
      http.delete('*/api/transactions/:id', ({ params }) => {
        cancellato = params.id as string
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountPage(<TransactionsPage />, { route: '/transazioni', viewport: 'mobile' })

    await scegliDalFoglio(u, 'Benzina', 'Elimina')
    const dialogo = within((await screen.findByText(/Elimina transazione/)).closest('.fixed') as HTMLElement)
    await u.click(dialogo.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(cancellato).toBe('t-1'))
  })

  /**
   * La promessa centrale della modalità offline, dal lato di chi registra la
   * spesa: se il backend non risponde, la transazione <em>non</em> va persa né
   * dà errore — finisce in coda e compare in elenco marcata "in attesa".
   *
   * I test esistenti della coda partono tutti da una coda già piena: nessuno
   * provava il momento in cui qualcosa ci finisce dentro.
   */
  it('senza backend la spesa finisce in coda invece di andare persa', async () => {
    const u = utente()
    server.use(
      http.get('*/api/transactions', () => HttpResponse.json({ content: [], hasNext: false })),
      http.get('*/api/categories', () => HttpResponse.json(categorie)),
      // Errore di rete vero (non un 500): è così che il codice riconosce il
      // backend irraggiungibile e devia sulla coda.
      http.post('*/api/transactions', () => HttpResponse.error()),
    )
    mountPage(<TransactionsPage />, { route: '/transazioni', viewport: 'mobile' })

    await u.click(await screen.findByRole('button', { name: 'Nuova transazione' }))
    await u.type(screen.getByLabelText(/Importo/), '12')
    await u.type(screen.getByLabelText(/Descrizione/), 'Caffè senza rete')
    await u.click(screen.getByRole('button', { name: 'Salva' }))

    // Compare in elenco come voce in attesa, e la coda in memoria locale la
    // contiene: è quello che la fa sopravvivere alla chiusura dell'app.
    expect(await screen.findByText('Caffè senza rete')).toBeInTheDocument()
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('offline_pending_transactions') ?? '[]')).toHaveLength(1),
    )
  })
})
