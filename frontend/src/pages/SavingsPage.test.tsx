import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SavingsPage from './SavingsPage'
import { transazione } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Risparmio. La logica di calcolo dei periodi sta in utils (buildPeriodSavings,
// lastPeriodKeys); qui si prova la decisione di prodotto che quel calcolo non
// contiene: i mesi prima del primo movimento vengono scartati, perché non sono
// mesi in cui non si è risparmiato — sono mesi in cui l'app non era in uso, e
// contarli abbasserebbe la media con degli zeri.

setupApiMocks()

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('taglio dei mesi iniziali inattivi', () => {
  /**
   * Con dodici periodi mostrabili ma movimenti solo negli ultimi tre, il totale
   * deve parlare di tre periodi, non di dodici: i nove vuoti in testa sono
   * scartati. Se comparissero, la media dei risparmi crollerebbe.
   */
  it('conta solo dai primi movimenti in poi, non tutti i dodici periodi', async () => {
    // Stipendio il 27: i movimenti di aprile/maggio/giugno cadono nei tre
    // periodi più recenti. I nove precedenti restano vuoti.
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json({
          content: [
            transazione({ id: 'a', type: 'INCOME', amount: 1800, occurredOn: '2026-04-28' }),
            transazione({ id: 'b', type: 'EXPENSE', amount: 500, occurredOn: '2026-05-05' }),
            transazione({ id: 'c', type: 'INCOME', amount: 1800, occurredOn: '2026-06-01' }),
          ],
          hasNext: false,
        }),
      ),
    )
    mountPage(<SavingsPage />, { profile: { salaryDay: 27, savingsEnabled: true, savingsPercent: 15 } })

    // Il totale nomina un numero piccolo di periodi (i tre attivi), non dodici.
    // Ancora sulla card della media (desktop): prova che la pagina ha reso.
    expect(await screen.findByText('Media periodi conclusi')).toBeInTheDocument()
    // Il totale non nomina dodici periodi: i nove vuoti in testa sono scartati.
    expect(screen.queryByText(/12 period/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ultimi 12/)).not.toBeInTheDocument()
  })

  it('senza alcun movimento non esplode e mostra il periodo corrente', async () => {
    server.use(http.get('*/api/transactions', () => HttpResponse.json({ content: [], hasNext: false })))
    mountPage(<SavingsPage />, { profile: { salaryDay: 27 } })

    // Con firstActive == -1 la pagina ripiega sull'ultimo periodo invece di
    // restare senza dati: la card "Media" c'è comunque.
    expect(await screen.findByText(/Media/)).toBeInTheDocument()
  })
})
