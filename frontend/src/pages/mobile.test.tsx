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

// L'app a schermo di telefono.
//
// Fino a questo file tutte le prove giravano su desktop: l'unico posto che
// chiamava setViewport('mobile') era il test del gancio useIsMobile. In un'app
// costruita per il telefono — barra in basso, PWA, card invece di tabelle —
// significava che l'intera superficie con cui la si usa davvero non aveva un
// test.
//
// Su telefono le azioni non stanno sulla riga: la riga si tocca e si apre un
// foglio dal basso (BottomSheet). Quel foglio è l'unico modo di modificare o
// eliminare qualcosa da un telefono, e quello che si prova qui è quale azione
// parte da quale voce — non il markup, che è in gran parte lo stesso del
// desktop a meno delle classi.
//
// La forma è la stessa per tutte le pagine, ed è la ragione per cui stanno in
// un file solo invece che sparse nei rispettivi: si tocca la riga, si sceglie
// una voce, si guarda cosa si apre e su quale elemento.

setupApiMocks()

const utente = () => userEvent.setup()

/** Il foglio azioni: è l'unico dialogo ancorato al fondo dello schermo. */
const foglio = () => document.querySelector('.fixed.inset-0.z-50') as HTMLElement

describe('Debiti', () => {
  const prestito = debito({ id: 'd1', name: 'Prestito auto', categoryName: 'Auto' })

  const montaConUnDebito = () => {
    server.use(http.get('*/api/debts', () => HttpResponse.json([prestito])))
    return mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })
  }

  /**
   * La prova che si è davvero sul telefono e non su un desktop travestito: le
   * icone di riga del desktop non esistono. Senza questo controllo un test
   * potrebbe passare perché la pagina ha reso l'altra variante, e non
   * proverebbe nulla di ciò che dice di provare.
   */
  it('non mostra le azioni di riga del desktop', async () => {
    montaConUnDebito()

    await screen.findByText('Prestito auto')
    expect(screen.queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina' })).not.toBeInTheDocument()
  })

  it('toccare la card apre il foglio azioni intitolato al debito', async () => {
    const u = utente()
    montaConUnDebito()

    await u.click(await screen.findByText('Prestito auto'))

    // Il titolo del foglio è il nome del debito: su un telefono è l'unica cosa
    // che dice su cosa si sta per agire, perché la card sottostante è coperta.
    expect(within(foglio()).getByText('Prestito auto')).toBeInTheDocument()
    expect(within(foglio()).getByText('Modifica')).toBeInTheDocument()
    expect(within(foglio()).getByText('Elimina')).toBeInTheDocument()
  })

  /**
   * Due debiti, si tocca il secondo: la modale deve aprirsi in modifica e
   * contenere <em>quello</em>. Con un elemento solo il test non distinguerebbe
   * "apre la modifica del debito toccato" da "apre la modifica di un debito
   * qualsiasi", e su un telefono le due card sono a un dito di distanza.
   *
   * (Il `const debt = actionSheetDebt` prima di azzerare lo stato sembra la
   * riga da proteggere, ma non lo è: la chiusura del gestore ha già catturato
   * il valore di quel render. Quello che questo test coglie davvero è aprire
   * la creazione invece della modifica, o farlo sull'elemento sbagliato —
   * verificato neutralizzando entrambe.)
   */
  it('Modifica apre la modifica del debito toccato, non di un altro', async () => {
    const u = utente()
    server.use(
      http.get('*/api/debts', () =>
        HttpResponse.json([prestito, debito({ id: 'd2', name: 'Mutuo casa', categoryName: 'Casa' })]),
      ),
      // Senza una categoria di uscita DebtForm non rende i campi: al loro
      // posto scrive "Crea prima almeno una categoria di uscita", e un test
      // che guardasse solo il titolo della modale non se ne accorgerebbe.
      http.get('*/api/categories', () => HttpResponse.json([categoria({ id: 'c-1', name: 'Casa' })])),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await u.click(await screen.findByText('Mutuo casa'))
    await u.click(within(foglio()).getByText('Modifica'))

    expect(await screen.findByText('Modifica debito')).toBeInTheDocument()
    // Non "Nuovo debito": il modulo è in modifica, ed è quello del secondo.
    expect(screen.queryByText('Nuovo debito')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Mutuo casa')
  })

  it('Elimina chiede conferma invece di cancellare subito', async () => {
    const u = utente()
    let cancellato = false
    server.use(
      http.get('*/api/debts', () => HttpResponse.json([prestito])),
      http.delete('*/api/debts/:id', () => {
        cancellato = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountPage(<DebtsPage />, { route: '/debiti', viewport: 'mobile' })

    await u.click(await screen.findByText('Prestito auto'))
    await u.click(within(foglio()).getByText('Elimina'))

    expect(await screen.findByText('Elimina debito')).toBeInTheDocument()
    expect(cancellato).toBe(false)
  })

  /**
   * Escape chiude il foglio senza fare niente. Conta perché il foglio si apre
   * col tocco sulla card, cioè per sbaglio molto più spesso di una modale, e
   * sotto la voce "Modifica" c'è "Elimina".
   */
  it('Escape chiude il foglio senza aprire nulla', async () => {
    const u = utente()
    montaConUnDebito()

    await u.click(await screen.findByText('Prestito auto'))
    expect(foglio()).toBeInTheDocument()

    await u.keyboard('{Escape}')

    await waitFor(() => expect(foglio()).toBeNull())
    expect(screen.queryByText('Modifica debito')).not.toBeInTheDocument()
    expect(screen.queryByText('Elimina debito')).not.toBeInTheDocument()
  })

  it('il pulsante tondo apre la creazione', async () => {
    const u = utente()
    montaConUnDebito()

    await screen.findByText('Prestito auto')
    await u.click(screen.getByRole('button', { name: 'Nuovo debito' }))

    expect(await screen.findByText('Nuovo debito', { selector: 'h2' })).toBeInTheDocument()
  })
})

describe('Ricorrenti', () => {
  const affitto = ricorrente({ id: 'r1', name: 'Affitto' })

  const montaConUnaRegola = () => {
    server.use(http.get('*/api/recurring-transactions', () => HttpResponse.json([affitto])))
    return mountPage(<RecurringPage />, { route: '/ricorrenti', viewport: 'mobile' })
  }

  it('toccare la riga apre il foglio con le tre azioni', async () => {
    const u = utente()
    montaConUnaRegola()

    await u.click(await screen.findByText('Affitto'))

    const f = within(foglio())
    expect(f.getByText('Eccezioni')).toBeInTheDocument()
    expect(f.getByText('Modifica')).toBeInTheDocument()
    expect(f.getByText('Elimina')).toBeInTheDocument()
  })

  /**
   * Su telefono "Eccezioni" non espande la riga come sul desktop — il foglio
   * azioni è già chiuso quando la si sceglie — ma apre una modale a parte.
   * È un ramo che sul desktop non esiste affatto.
   */
  it('Eccezioni apre la modale dedicata, non l espansione della riga', async () => {
    const u = utente()
    montaConUnaRegola()

    await u.click(await screen.findByText('Affitto'))
    await u.click(within(foglio()).getByText('Eccezioni'))

    expect(await screen.findByText('Eccezioni · Affitto')).toBeInTheDocument()
  })

  it('Modifica apre la modifica di quella regola', async () => {
    const u = utente()
    montaConUnaRegola()

    await u.click(await screen.findByText('Affitto'))
    await u.click(within(foglio()).getByText('Modifica'))

    expect(await screen.findByText('Modifica regola')).toBeInTheDocument()
  })
})

describe('Categorie', () => {
  const spesa = categoria({ id: 'c1', name: 'Spesa' })

  const montaConUnaCategoria = () => {
    server.use(http.get('*/api/categories', () => HttpResponse.json([spesa])))
    return mountPage(<CategoriesPage />, { route: '/categorie', viewport: 'mobile' })
  }

  /**
   * Qui il foglio ha tre voci e due sono distruttive: archivia ed elimina, che
   * su un telefono sono a un dito di distanza l'una dall'altra. Che partano
   * due dialoghi diversi è ciò che impedisce di cancellare una categoria
   * credendo di metterla da parte.
   */
  it('Archivia ed Elimina aprono due conferme diverse', async () => {
    const u = utente()
    montaConUnaCategoria()

    await u.click(await screen.findByText('Spesa'))
    await u.click(within(foglio()).getByText('Archivia'))
    expect(await screen.findByText(/Archivia categoria/)).toBeInTheDocument()
  })

  it('Modifica apre il modulo di quella categoria', async () => {
    const u = utente()
    montaConUnaCategoria()

    await u.click(await screen.findByText('Spesa'))
    await u.click(within(foglio()).getByText('Modifica'))

    expect(await screen.findByText('Modifica categoria')).toBeInTheDocument()
  })
})

describe('Transazioni', () => {
  const spesaFatta = transazione({ id: 't1', description: 'Benzina', amount: 45 })

  /**
   * La regola che protegge i dati: una transazione ancora in coda — registrata
   * senza rete e non ancora arrivata al server — non si può modificare né
   * eliminare, perché non esiste ancora da nessuna parte se non nel telefono.
   * Le due voci restano visibili ma spente, con scritto il perché.
   */
  it('una transazione registrata offline non si può modificare né eliminare', async () => {
    const u = utente()
    // La coda offline vive in localStorage: la pagina la unisce all'elenco
    // arrivato dal server marcandola "pending". La data è oggi perché la
    // pagina filtra la coda con lo stesso intervallo dell'elenco, che parte
    // dal mese corrente.
    const oggi = new Date().toISOString().slice(0, 10)
    localStorage.setItem(
      'offline_pending_transactions',
      JSON.stringify([
        {
          localId: 'l1',
          categoryId: 'cat-1',
          amount: 12,
          type: 'EXPENSE',
          occurredOn: oggi,
          description: 'Caffè senza rete',
          queuedAt: new Date().toISOString(),
        },
      ]),
    )
    // Senza questo il test non prova nulla: appena la pagina monta, la
    // sincronizzazione differita manda la coda al server, la riga smette di
    // essere "in attesa" e sparisce prima del tocco. Un invio che fallisce la
    // lascia in coda — che è poi la situazione in cui l'utente la vede.
    server.use(http.post('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    mountPage(<TransactionsPage />, { route: '/transazioni', viewport: 'mobile' })

    await u.click(await screen.findByText('Caffè senza rete'))

    const f = within(foglio())
    expect(f.getByText('In attesa di sincronizzazione.')).toBeInTheDocument()
    expect(f.getByText('Modifica').closest('button')).toBeDisabled()
    expect(f.getByText('Elimina').closest('button')).toBeDisabled()
  })

  it('una transazione già archiviata si può modificare', async () => {
    const u = utente()
    server.use(
      http.get('*/api/transactions', () => HttpResponse.json({ content: [spesaFatta], hasNext: false })),
    )
    mountPage(<TransactionsPage />, { route: '/transazioni', viewport: 'mobile' })

    await u.click(await screen.findByText('Benzina'))

    expect(within(foglio()).getByText('Modifica').closest('button')).toBeEnabled()
  })
})

describe('Promemoria', () => {
  /**
   * L'unica pagina senza foglio azioni, ed è voluto: c'è solo "Modifica",
   * quindi il tocco sulla riga apre direttamente il modulo. Sta qui perché
   * l'asimmetria con le altre quattro invita a "uniformarla".
   */
  it('toccare la riga apre direttamente la modifica, senza foglio', async () => {
    const u = utente()
    server.use(
      http.get('*/api/expense-reminders', () => HttpResponse.json([promemoria({ id: 'p1', name: 'Bollo auto' })])),
    )
    mountPage(<RemindersPage />, { route: '/promemoria', viewport: 'mobile' })

    await u.click(await screen.findByText('Bollo auto'))

    expect(await screen.findByText('Modifica promemoria')).toBeInTheDocument()
  })
})
