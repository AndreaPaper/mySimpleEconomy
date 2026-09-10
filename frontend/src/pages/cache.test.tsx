import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STALE_TIME_MS } from '../api/queryClient'
import { debito } from '../test/handlers'
import { mountApp } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// La cache dei dati fra una pagina e l'altra.
//
// Prima ogni navigazione rifaceva tutte le richieste della pagina e aspettava
// con lo scheletro, anche per dati visti un attimo prima: con il backend in
// produzione, ~0,5 s a regime e ~2 s dopo una pausa, a ogni clic del menu.
// Questi test navigano davvero fra le pagine — menu vero, un solo QueryClient
// per tutta la visita — perché la cache si vede solo passando da una all'altra.

setupApiMocks()

afterEach(() => {
  vi.useRealTimers()
})

// Con l'orologio finto userEvent deve farlo avanzare; senza, non deve toccarlo.
const utente = (orologioFinto = false) =>
  userEvent.setup(orologioFinto ? { advanceTimers: vi.advanceTimersByTime } : {})

// La voce del menu laterale. La barra in basso del telefono è nel DOM anche su
// desktop (la nasconde il CSS), e ha alcune voci con lo stesso nome.
const voceMenu = (nome: string) =>
  screen.getAllByRole('link', { name: nome }).find((l) => !l.closest('[aria-label="Navigazione principale"]'))!
const vaiA = (u: ReturnType<typeof utente>, voce: string) => u.click(voceMenu(voce))

/**
 * Un gestore che conta le richieste all'elenco dei debiti. Nome e ritardo sono
 * modificabili a metà test, sullo stesso contatore.
 */
function contaDebiti() {
  const stato = { n: 0, ritardoMs: 0, nome: (_n: number) => 'Prestito auto' }
  server.use(
    http.get('*/api/debts', async () => {
      stato.n++
      if (stato.ritardoMs) await delay(stato.ritardoMs)
      return HttpResponse.json([debito({ id: 'd-1', name: stato.nome(stato.n) })])
    }),
  )
  return stato
}

describe('tornare su una pagina già vista', () => {
  /**
   * Il punto di tutto il lavoro. Entro staleTime la pagina si riapre coi dati
   * in cache, subito, e non parte nessuna richiesta.
   *
   * Il controllo è fatto con getByText, non findByText, e subito dopo il clic:
   * findByText aspetterebbe, e passerebbe anche se prima comparisse lo
   * scheletro. Qui deve esserci già.
   */
  it('la mostra subito, senza scheletro e senza rifare la richiesta', async () => {
    const u = utente()
    const debiti = contaDebiti()
    mountApp({ route: '/debiti' })
    await screen.findByText('Prestito auto')
    expect(debiti.n).toBe(1)

    await vaiA(u, 'Promemoria')
    await screen.findByRole('heading', { name: /Promemoria/ })
    await vaiA(u, 'Debiti')

    expect(screen.getByText('Prestito auto')).toBeInTheDocument()
    expect(debiti.n).toBe(1)
  })

  /**
   * Oltre staleTime i dati vanno riletti — ma la pagina non deve aspettarli:
   * mostra quelli in cache e intanto chiede i nuovi. È esattamente la regola
   * isPending contro isFetching: legato a isFetching, lo scheletro
   * ricomparirebbe durante l'aggiornamento e il primo controllo fallirebbe.
   *
   * La risposta nuova è ritardata apposta: altrimenti il prefetch partito al
   * passaggio sopra il link potrebbe arrivare prima del montaggio, e il test
   * non distinguerebbe più "cache mostrata subito" da "dati nuovi già arrivati".
   */
  it('con dati scaduti mostra quelli in cache e intanto li aggiorna', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const u = utente(true)
    const debiti = contaDebiti()
    debiti.nome = (n) => (n === 1 ? 'Prestito auto' : 'Prestito aggiornato')
    mountApp({ route: '/debiti' })
    await screen.findByText('Prestito auto')

    await vaiA(u, 'Promemoria')
    await screen.findByRole('heading', { name: /Promemoria/ })
    // Da qui la risposta tarda: quella in cache deve bastare a riempire la pagina.
    debiti.ritardoMs = 300
    vi.setSystemTime(Date.now() + STALE_TIME_MS + 1000)
    await vaiA(u, 'Debiti')

    expect(screen.getByText('Prestito auto')).toBeInTheDocument()
    expect(await screen.findByText('Prestito aggiornato')).toBeInTheDocument()
    // Due richieste: la prima visita, e l'aggiornamento dei dati scaduti. Non
    // tre — il prefetch al passaggio sopra il link e il montaggio si fondono.
    expect(debiti.n).toBe(2)
  })
})

describe('dopo una scrittura', () => {
  /**
   * Una scrittura invalida tutta la cache, non solo la pagina dove avviene.
   * Qui: la Dashboard ha la previsione in cache e fresca; si cancella un debito
   * altrove; tornando sulla Dashboard la previsione va richiesta di nuovo, anche
   * se staleTime non è passato. Senza l'invalidazione resterebbe quella di
   * prima, mostrata come attuale.
   */
  it('la pagina che si riapre rilegge i dati, anche se erano freschi', async () => {
    const u = utente()
    const previsioni = { n: 0 }
    server.use(
      http.get('*/api/forecast', () => {
        previsioni.n++
        return HttpResponse.json({ currentBalance: 0, months: [] })
      }),
      http.get('*/api/debts', () => HttpResponse.json([debito({ id: 'd-1', name: 'Prestito auto' })])),
      http.delete('*/api/debts/:id', () => new HttpResponse(null, { status: 204 })),
    )
    mountApp({ route: '/' })
    await waitFor(() => expect(previsioni.n).toBe(1))

    await vaiA(u, 'Debiti')
    await screen.findByText('Prestito auto')
    await u.click(screen.getByRole('button', { name: 'Elimina' }))
    const conferma = await screen.findAllByRole('button', { name: 'Elimina' })
    await u.click(conferma[conferma.length - 1])

    await vaiA(u, 'Dashboard')
    await waitFor(() => expect(previsioni.n).toBe(2))
  })
})

describe('i dati prima del clic', () => {
  /**
   * Passando sopra un link del menu, la richiesta della pagina parte prima del
   * clic; al clic non ne parte una seconda, perché i dati sono già in cache.
   */
  it('passando sopra il link la richiesta parte prima del clic', async () => {
    const u = utente()
    const debiti = contaDebiti()
    mountApp({ route: '/promemoria' })
    await screen.findByRole('heading', { name: /Promemoria/ })
    expect(debiti.n).toBe(0)

    await u.hover(voceMenu('Debiti'))
    await waitFor(() => expect(debiti.n).toBe(1))

    await u.click(voceMenu('Debiti'))
    expect(await screen.findByText('Prestito auto')).toBeInTheDocument()
    expect(debiti.n).toBe(1)
  })

  /**
   * La Dashboard è il caso che può divergere: le sue chiavi dipendono
   * dall'intervallo del grafico e dal giorno dello stipendio. Se il prefetch
   * calcolasse una finestra diversa di anche un solo giorno, riempirebbe una
   * voce di cache che la pagina non legge, e al clic tutto ripartirebbe da
   * capo. Qui si verifica che al clic non parta nessuna seconda richiesta, né
   * per la previsione né per lo storico.
   */
  it('le chiavi precaricate per la Dashboard sono quelle che la pagina legge', async () => {
    const u = utente()
    const conta = { previsione: 0, storico: 0 }
    server.use(
      http.get('*/api/forecast', () => {
        conta.previsione++
        return HttpResponse.json({ currentBalance: 0, months: [] })
      }),
      http.get('*/api/transactions', ({ request }) => {
        if (new URL(request.url).searchParams.has('from')) conta.storico++
        return HttpResponse.json({ content: [], hasNext: false })
      }),
    )
    mountApp({ route: '/debiti', profile: { salaryDay: 27 } })
    await screen.findByRole('heading', { name: /Debiti/ })

    await u.hover(voceMenu('Dashboard'))
    await waitFor(() => expect(conta.previsione).toBe(1))
    await waitFor(() => expect(conta.storico).toBe(1))

    await u.click(voceMenu('Dashboard'))
    await screen.findByText(/Saldo attuale/)
    expect(conta.previsione).toBe(1)
    expect(conta.storico).toBe(1)
  })
})
