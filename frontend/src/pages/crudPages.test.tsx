import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import RecurringPage from './RecurringPage'
import RemindersPage from './RemindersPage'
import DebtsPage from './DebtsPage'
import { debito, promemoria, ricorrente } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Le pagine CRUD leggere (Ricorrenti, Promemoria) e i Debiti. La logica di
// calcolo — projectPayoff, le fette, i periodi — sta negli utils testati a
// parte; qui si prova solo ciò che vive nella pagina: l'interruttore
// attiva/disattiva e i rami che l'utente vede.

setupApiMocks()

describe('Ricorrenti', () => {
  it('elenca le regole e le mostra', async () => {
    server.use(http.get('*/api/recurring-transactions', () => HttpResponse.json([ricorrente({ name: 'Affitto' })])))
    mountPage(<RecurringPage />, { route: '/ricorrenti' })

    expect(await screen.findByText('Affitto')).toBeInTheDocument()
  })

  /**
   * L'interruttore chiama disattiva o riattiva a seconda dello stato: sono due
   * endpoint diversi, ed è l'unica azione della riga che parte al primo tocco,
   * senza dialogo. Sbagliare il ramo riattiverebbe ciò che si voleva spegnere.
   */
  it('l interruttore di una regola attiva chiama disattiva', async () => {
    let chiamato: string | null = null
    server.use(
      http.get('*/api/recurring-transactions', () => HttpResponse.json([ricorrente({ name: 'Affitto', active: true })])),
      http.post('*/api/recurring-transactions/:id/deactivate', () => {
        chiamato = 'deactivate'
        return HttpResponse.json(ricorrente({ active: false }))
      }),
    )
    const utente = userEvent.setup()
    mountPage(<RecurringPage />, { route: '/ricorrenti' })

    await screen.findByText('Affitto')
    await utente.click(screen.getByRole('switch', { name: 'Disattiva' }))

    await waitFor(() => expect(chiamato).toBe('deactivate'))
  })

  it('l interruttore di una regola spenta chiama riattiva', async () => {
    let chiamato: string | null = null
    server.use(
      http.get('*/api/recurring-transactions', () => HttpResponse.json([ricorrente({ name: 'Affitto', active: false })])),
      http.post('*/api/recurring-transactions/:id/reactivate', () => {
        chiamato = 'reactivate'
        return HttpResponse.json(ricorrente({ active: true }))
      }),
    )
    const utente = userEvent.setup()
    mountPage(<RecurringPage />, { route: '/ricorrenti' })

    await screen.findByText('Affitto')
    await utente.click(screen.getByRole('switch', { name: 'Riattiva' }))

    await waitFor(() => expect(chiamato).toBe('reactivate'))
  })
})

describe('Promemoria', () => {
  it('elenca i promemoria', async () => {
    server.use(http.get('*/api/expense-reminders', () => HttpResponse.json([promemoria({ name: 'Bollo auto' })])))
    mountPage(<RemindersPage />, { route: '/promemoria' })

    expect(await screen.findByText('Bollo auto')).toBeInTheDocument()
  })

  it('l interruttore rispetta lo stato del promemoria', async () => {
    let chiamato: string | null = null
    server.use(
      http.get('*/api/expense-reminders', () => HttpResponse.json([promemoria({ name: 'Bollo auto', active: true })])),
      http.post('*/api/expense-reminders/:id/deactivate', () => {
        chiamato = 'deactivate'
        return HttpResponse.json(promemoria({ active: false }))
      }),
    )
    const utente = userEvent.setup()
    mountPage(<RemindersPage />, { route: '/promemoria' })

    await screen.findByText('Bollo auto')
    await utente.click(screen.getByRole('switch', { name: 'Disattiva' }))

    await waitFor(() => expect(chiamato).toBe('deactivate'))
  })
})

describe('Debiti', () => {
  it('mostra la data di estinzione stimata per un debito con rata', async () => {
    server.use(
      http.get('*/api/debts', () =>
        HttpResponse.json([debito({ name: 'Prestito auto', remainingAmount: 4800, monthlyPaymentAmount: 200 })]),
      ),
    )
    mountPage(<DebtsPage />, { route: '/debiti' })

    expect(await screen.findByText('Prestito auto')).toBeInTheDocument()
    // Il testo della proiezione compare (la data esatta dipende da oggi, quindi
    // si controlla la frase, non il mese).
    expect(screen.getByText(/saldo previsto per/)).toBeInTheDocument()
  })

  it('un debito saldato mostra lo stato estinto invece della proiezione', async () => {
    server.use(
      http.get('*/api/debts', () =>
        HttpResponse.json([debito({ name: 'Prestito estinto', remainingAmount: 0, paidAmount: 6000, totalAmount: 6000 })]),
      ),
    )
    mountPage(<DebtsPage />, { route: '/debiti' })

    await screen.findByText('Prestito estinto')
    expect(screen.queryByText(/saldo previsto per/)).not.toBeInTheDocument()
  })
})
