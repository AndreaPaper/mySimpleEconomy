import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'
import { previsioneVuota, transazione } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// La Dashboard, la pagina con piu' logica non di markup. La curva del saldo e la
// suddivisione in fette hanno gia' i loro test (balanceSeries, categoryBreakdown,
// categorySlices); qui si prova cio' che vive solo nella pagina: la finestra di
// previsione, il fallimento parziale, e lo sfoglio dei periodi.

setupApiMocks()

beforeEach(() => {
  // La pagina calcola finestre e chiavi di periodo da new Date(): senza una data
  // fissa i test dipenderebbero dal giorno in cui girano. shouldAdvanceTime
  // tiene vivi i timer di axios/MSW.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-03-15T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('saldo e previsione', () => {
  it('mostra il saldo attuale che arriva dalla previsione', async () => {
    server.use(
      http.get('*/api/forecast', () => HttpResponse.json({ ...previsioneVuota, currentBalance: 1234.5 })),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('1.234,50 €')).toBeInTheDocument()
  })

  /**
   * Il fallimento parziale, che e' la ragione dell'allSettled: se i promemoria
   * non arrivano, il saldo si deve vedere lo stesso. La spia su console.error e'
   * per-test — zittirla ovunque nasconderebbe gli avvisi di React.
   */
  it('mostra il saldo anche se i promemoria non rispondono', async () => {
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(
      http.get('*/api/forecast', () => HttpResponse.json({ ...previsioneVuota, currentBalance: 500 })),
      // 500, non un errore di rete: quello accenderebbe il fail-fast del client
      // e farebbe partire il polling di OfflineSyncContext.
      http.get('*/api/expense-reminders/upcoming', () => new HttpResponse(null, { status: 500 })),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('500,00 €')).toBeInTheDocument()
    await waitFor(() =>
      expect(errori).toHaveBeenCalledWith('Aggiornamento promemoria non riuscito', expect.anything()),
    )
  })

  /**
   * La finestra di previsione: il motore parte sempre da oggi, quindi i mesi
   * richiesti coprono da questo mese fino alla fine dell'intervallo del grafico.
   * Con l'intervallo predefinito (che arriva a fine anno) sono i mesi da marzo a
   * dicembre. Un errore qui dà un grafico troncato o troppo lungo, non un errore.
   */
  it('chiede alla previsione i mesi che coprono l intervallo', async () => {
    let mesiRichiesti: string | null = null
    server.use(
      http.get('*/api/forecast', ({ request }) => {
        mesiRichiesti = new URL(request.url).searchParams.get('months')
        return HttpResponse.json(previsioneVuota)
      }),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    // L'intervallo predefinito arriva a oggi + 6 mesi (set 2026): da marzo a
    // settembre sono 7 mesi, mese corrente compreso.
    await waitFor(() => expect(mesiRichiesti).toBe('7'))
  })
})

describe('sfoglio dei periodi nella card "Spese per categoria"', () => {
  const storico = [
    transazione({ id: 'a', description: 'Spesa febbraio', occurredOn: '2026-02-10', amount: 100 }),
    transazione({ id: 'b', description: 'Spesa marzo', occurredOn: '2026-03-10', amount: 50 }),
  ]

  it('parte dal periodo corrente e lascia tornare indietro', async () => {
    server.use(
      // La finestra storica è la seconda chiamata a /transactions (ha i parametri
      // from/to); qui rispondiamo uguale a entrambe, basta che i dati ci siano.
      http.get('*/api/transactions', () => HttpResponse.json({ content: storico, hasNext: false })),
    )
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    // Il periodo corrente è marcato "· corrente".
    expect(await screen.findByText(/· corrente/)).toBeInTheDocument()

    const indietro = screen.getByRole('button', { name: 'Mese precedente' })
    await waitFor(() => expect(indietro).toBeEnabled())
    await utente.click(indietro)

    // Tornati indietro, l'etichetta non dice più "corrente".
    await waitFor(() => expect(screen.queryByText(/· corrente/)).not.toBeInTheDocument())
  })

  it('non si può andare oltre il periodo corrente', async () => {
    server.use(http.get('*/api/transactions', () => HttpResponse.json({ content: storico, hasNext: false })))
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    await screen.findByText(/· corrente/)
    // Già sul corrente: avanti è bloccato.
    expect(screen.getByRole('button', { name: 'Mese successivo' })).toBeDisabled()
  })
})
