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

    // Matcher tollerante al separatore delle migliaia: i dati ICU del runner
    // (Node 24) rendono "1234,50" senza il punto, la mia macchina "1.234,50".
    // Asserire la stringa esatta legava il test all'ICU locale.
    expect(await screen.findByText(/1\.?234,50\s*€/)).toBeInTheDocument()
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
   * La finestra di previsione: il motore parte sempre da oggi, quindi i periodi
   * richiesti coprono da quello in corso fino alla fine dell'intervallo del
   * grafico. Un errore qui dà un grafico troncato o troppo lungo, non un errore.
   */
  it('chiede alla previsione i periodi che coprono l intervallo', async () => {
    let periodiRichiesti: string | null = null
    server.use(
      http.get('*/api/forecast', ({ request }) => {
        periodiRichiesti = new URL(request.url).searchParams.get('periods')
        return HttpResponse.json(previsioneVuota)
      }),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    // Oggi è il 15 marzo e l'accredito è il 27: il periodo in corso è quello
    // che finisce a marzo. L'intervallo predefinito arriva a oggi + 6 mesi
    // (15 settembre, ancora nel periodo di settembre): sette periodi in tutto.
    await waitFor(() => expect(periodiRichiesti).toBe('7'))
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

describe('aggiunta rapida', () => {
  /**
   * Il bottone tondo della Dashboard: è il gesto più frequente dell'app —
   * registrare una spesa appena fatta — e `handleQuickAdd` non era coperto.
   * Si verifica il corpo della richiesta, non che "non sia esploso": una
   * transazione salvata con l'importo o la data sbagliata è peggio di una non
   * salvata, perché nessuno va a ricontrollarla.
   */
  it('salva la transazione e ricarica la previsione', async () => {
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let creata: Record<string, unknown> | null = null
    // Un registro ordinato, non un contatore: la Dashboard chiede la previsione
    // piu' volte gia' al montaggio, quindi "quante" non distingue il
    // ricaricamento dopo il salvataggio. Conta che ce ne sia una *dopo* il POST.
    const ordine: string[] = []
    server.use(
      http.get('*/api/categories', () =>
        HttpResponse.json([{ id: 'c-1', name: 'Spesa', type: 'EXPENSE', color: null, icon: null, parentId: null, archived: false }]),
      ),
      http.get('*/api/forecast', () => {
        ordine.push('previsione')
        return HttpResponse.json(previsioneVuota)
      }),
      http.post('*/api/transactions', async ({ request }) => {
        creata = (await request.json()) as Record<string, unknown>
        ordine.push('creazione')
        return HttpResponse.json(transazione(), { status: 201 })
      }),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 }, viewport: 'mobile' })

    await utente.click(await screen.findByRole('button', { name: 'Nuova transazione' }))
    await utente.type(screen.getByLabelText(/Importo/), '18.5')
    await utente.type(screen.getByLabelText(/Descrizione/), 'Pranzo')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(creata).not.toBeNull())
    expect(creata).toMatchObject({ amount: 18.5, description: 'Pranzo', categoryId: 'c-1' })
    // La previsione si ricarica dopo il salvataggio: senza, il saldo a schermo
    // resterebbe quello di prima della spesa appena inserita.
    await waitFor(() => expect(ordine.slice(ordine.indexOf('creazione'))).toContain('previsione'))
  })

  /**
   * Senza rete la spesa va in coda invece di andare persa, esattamente come
   * nella pagina Transazioni. Vale la pena provarlo anche qui perché il ramo è
   * scritto due volte, in due file diversi: correggerne uno solo è facile.
   */
  it('senza backend finisce in coda invece di andare persa', async () => {
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    server.use(
      http.get('*/api/categories', () =>
        HttpResponse.json([{ id: 'c-1', name: 'Spesa', type: 'EXPENSE', color: null, icon: null, parentId: null, archived: false }]),
      ),
      http.post('*/api/transactions', () => HttpResponse.error()),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 }, viewport: 'mobile' })

    await utente.click(await screen.findByRole('button', { name: 'Nuova transazione' }))
    await utente.type(screen.getByLabelText(/Importo/), '7')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('offline_pending_transactions') ?? '[]')).toHaveLength(1),
    )
  })
})

describe('la card del saldo previsto', () => {
  const previsione = (over: Record<string, unknown> = {}) => ({
    ...previsioneVuota,
    currentBalance: 1000,
    periods: [
      {
        period: '2026-04',
        periodStart: '2026-03-27',
        periodEnd: '2026-04-26',
        projectedIncome: 1800,
        projectedExpense: 650,
        netBalance: 1150,
        runningBalance: 2150,
        categoryBreakdown: [],
      },
    ],
    currentMonth: {
      period: '2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      projectedIncome: 1800,
      projectedExpense: 900,
      netBalance: 900,
      runningBalance: 1900,
      categoryBreakdown: [],
    },
    ...over,
  })

  /**
   * La card conta il mese di CALENDARIO, mentre il resto della pagina conta da
   * un accredito al successivo: chi la guarda vuole sapere quanti soldi avrà a
   * fine mese, stipendio nuovo compreso.
   *
   * La previsione di prova mette due cifre diverse nei due campi apposta: 1.900
   * per il mese, 2.150 per il periodo in corso. Leggendo il campo sbagliato la
   * card mostrerebbe comunque un numero plausibile, ed è il modo peggiore di
   * sbagliare — quindi il test controlla anche che l'altro NON compaia.
   */
  it('mostra il saldo di fine mese di calendario, non quello di fine periodo', async () => {
    server.use(http.get('*/api/forecast', () => HttpResponse.json(previsione())))
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText(/1\.?900,00\s*€/)).toBeInTheDocument()
    expect(screen.queryByText(/2\.?150,00\s*€/)).not.toBeInTheDocument()
  })

  /**
   * L'etichetta resta "a fine mese" anche con un accredito configurato, perché
   * è del mese di calendario che la card parla. Sotto il numero non va nessuna
   * data: "fine mese" dice già da sé qual è l'ultimo giorno.
   */
  it('parla di fine mese anche con un accredito il 27, e senza data sotto', async () => {
    server.use(http.get('*/api/forecast', () => HttpResponse.json(previsione())))
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('Saldo previsto a fine mese')).toBeInTheDocument()
    expect(screen.queryByText(/^al /)).not.toBeInTheDocument()
  })

  /**
   * Le tre card dei totali, il sottotitolo del grafico e il vuoto della card
   * "Spese per categoria" contavano gia' per periodo ma dicevano "mese": con
   * l'accredito il 27, "Uscite (mese corrente)" somma anche le spese dei primi
   * giorni del mese successivo, che di quel mese non sono. La parola ora segue
   * il numero.
   */
  it('anche le card dei totali e il grafico dicono periodo', async () => {
    server.use(http.get('*/api/forecast', () => HttpResponse.json(previsione())))
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('Uscite (periodo corrente)')).toBeInTheDocument()
    expect(screen.getByText('Entrate (periodo corrente)')).toBeInTheDocument()
    expect(screen.getByText('Saldo netto (periodo corrente)')).toBeInTheDocument()
    expect(
      screen.getByText('Clicca un periodo per vederne le spese per categoria'),
    ).toBeInTheDocument()
  })

  // Senza accredito il periodo e' il mese di calendario, e li' "mese" e' esatto.
  it('senza accredito le stesse card restano al mese', async () => {
    server.use(http.get('*/api/forecast', () => HttpResponse.json(previsione())))
    mountPage(<DashboardPage />, { profile: { salaryDay: null } })

    expect(await screen.findByText('Uscite (mese corrente)')).toBeInTheDocument()
    expect(
      screen.getByText('Clicca un mese per vederne le spese per categoria'),
    ).toBeInTheDocument()
  })
})

describe('il grafico "Andamento saldo"', () => {
  /**
   * La segnalazione da cui è nato questo lavoro: il primo punto previsto della
   * curva era il periodo <em>successivo</em> a quello in corso, quindi il
   * numero della card non compariva da nessuna parte sul grafico e la
   * previsione cominciava con un periodo di ritardo.
   *
   * Oggi è il 15 marzo con accredito il 27: il periodo in corso è quello che
   * finisce a marzo, e la sua etichetta sull'asse è "mar 26". Sull'asse non può
   * arrivarci da nessun'altra parte — i punti storici sono periodi conclusi,
   * cioè precedenti — quindi trovarla è la prova che il grafico parte dal
   * periodo in corso.
   */
  it('il primo punto previsto è il periodo in corso, quello della card', async () => {
    server.use(
      http.get('*/api/forecast', () =>
        HttpResponse.json({
          ...previsioneVuota,
          currentBalance: 1000,
          periods: [
            { period: '2026-03', periodStart: '2026-02-27', periodEnd: '2026-03-26', projectedIncome: 0, projectedExpense: 0, netBalance: 0, runningBalance: 1150, categoryBreakdown: [] },
            { period: '2026-04', periodStart: '2026-03-27', periodEnd: '2026-04-26', projectedIncome: 0, projectedExpense: 0, netBalance: 0, runningBalance: 1300, categoryBreakdown: [] },
          ],
        }),
      ),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(await screen.findByText('mar 26')).toBeInTheDocument()
    expect(screen.getByText('apr 26')).toBeInTheDocument()
  })
})

describe("l'ipotesi sotto il grafico", () => {
  /**
   * La curva tratteggiata sale o scende per ragioni che il grafico da solo non
   * dice. La riga sotto scrive quanto toglie di spese variabili e su quanto
   * storico lo ha calcolato: quando la previsione sembra strana, la causa si
   * legge lì invece che nel codice.
   */
  it('scrive la media delle spese variabili e su quanti periodi è calcolata', async () => {
    server.use(
      http.get('*/api/forecast', () =>
        HttpResponse.json({ ...previsioneVuota, variableExpenseAverage: 850, historyPeriods: 3 }),
      ),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(
      await screen.findByText(
        'Oltre a entrate, spese fisse e rate dei debiti, la previsione toglie 850,00 € a periodo di spese variabili: la media degli ultimi 3 periodi.',
      ),
    ).toBeInTheDocument()
  })

  // Senza accredito il periodo è il mese, e con un solo mese di storico la frase
  // va al singolare.
  it('senza accredito parla di mesi, e al singolare con un mese solo', async () => {
    server.use(
      http.get('*/api/forecast', () =>
        HttpResponse.json({ ...previsioneVuota, variableExpenseAverage: 120, historyPeriods: 1 }),
      ),
    )
    mountPage(<DashboardPage />, { profile: { salaryDay: null } })

    expect(
      await screen.findByText(
        "Oltre a entrate, spese fisse e rate dei debiti, la previsione toglie 120,00 € a mese di spese variabili: la media dell'ultimo mese.",
      ),
    ).toBeInTheDocument()
  })

  /**
   * Con lo storico a zero non c'è media da togliere, e una curva costruita solo
   * su entrate e spese fisse sale quasi sempre: la riga lo dice, invece di
   * lasciare che la curva finga di sapere.
   */
  it('senza storico dice che non ce n è abbastanza', async () => {
    server.use(http.get('*/api/forecast', () => HttpResponse.json({ ...previsioneVuota, historyPeriods: 0 })))
    mountPage(<DashboardPage />, { profile: { salaryDay: 27 } })

    expect(
      await screen.findByText(
        "Non c'è ancora abbastanza storico per stimare le spese variabili: la previsione conta solo entrate, spese fisse e rate dei debiti.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/la previsione toglie/)).not.toBeInTheDocument()
  })
})
