import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import SettingsPage from './SettingsPage'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Impostazioni. Due cose non di markup: la navigazione da tastiera fra le
// schede (che, dichiarata con role="tab", va implementata per intero o il
// lettore di schermo annuncia un comportamento che non c'è) e il cancello della
// parola digitata davanti alla cancellazione di tutti i dati.

setupApiMocks()

describe('navigazione fra le schede da tastiera', () => {
  it('le frecce spostano la scheda attiva e girano in tondo', async () => {
    const utente = userEvent.setup()
    mountPage(<SettingsPage />, { route: '/impostazioni' })

    const aspetto = screen.getByRole('tab', { name: 'Aspetto' })
    aspetto.focus()

    await utente.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Importa' })).toHaveAttribute('aria-selected', 'true')

    await utente.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Transazioni' })).toHaveAttribute('aria-selected', 'true')

    // Da qui una freccia a destra torna alla prima: l'indice gira in tondo.
    await utente.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Aspetto' })).toHaveAttribute('aria-selected', 'true')

    // E indietro dalla prima si arriva all'ultima.
    await utente.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Transazioni' })).toHaveAttribute('aria-selected', 'true')
  })

  // Un solo bottone raggiungibile con Tab: gli altri hanno tabIndex -1, come
  // vuole il pattern tablist.
  it('solo la scheda attiva è raggiungibile con Tab', () => {
    mountPage(<SettingsPage />, { route: '/impostazioni' })

    expect(screen.getByRole('tab', { name: 'Aspetto' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Importa' })).toHaveAttribute('tabindex', '-1')
  })
})

describe('il cancello della parola digitata', () => {
  const vaiAllaScheda = async (utente: ReturnType<typeof userEvent.setup>) => {
    await utente.click(screen.getByRole('tab', { name: 'Transazioni' }))
  }

  it('il pulsante resta bloccato finché non si scrive ELIMINA', async () => {
    const utente = userEvent.setup()
    mountPage(<SettingsPage />, { route: '/impostazioni' })
    await vaiAllaScheda(utente)

    // Apre il pannello di conferma della cancellazione totale.
    await utente.click(screen.getByRole('button', { name: 'Elimina tutto' }))
    const conferma = screen.getByRole('button', { name: 'Elimina definitivamente' })
    expect(conferma).toBeDisabled()

    const campo = screen.getByPlaceholderText('ELIMINA')
    await utente.type(campo, 'elimina') // minuscolo: non basta
    expect(conferma).toBeDisabled()

    await utente.clear(campo)
    await utente.type(campo, 'ELIMINA')
    expect(conferma).toBeEnabled()
  })

  /**
   * L'eliminazione per intervallo: sta accanto alla cancellazione totale, è
   * altrettanto distruttiva, e non aveva un test. Le due date scelte devono
   * arrivare nella richiesta — mandarne una sbagliata, o ometterle, cancella un
   * periodo diverso da quello che si è appena letto a schermo.
   */
  it('l eliminazione per periodo manda le date scelte', async () => {
    let inviate: URLSearchParams | null = null
    server.use(
      http.delete('*/api/data-cleanup', ({ request }) => {
        inviate = new URL(request.url).searchParams
        return HttpResponse.json({
          transactionsDeleted: 4,
          recurringTransactionsDeleted: 0,
          balanceCheckpointsDeleted: 0,
          expenseRemindersDeleted: 0,
        })
      }),
    )
    const utente = userEvent.setup()
    mountPage(<SettingsPage />, { route: '/impostazioni' })
    await vaiAllaScheda(utente)

    // Senza date il pulsante è bloccato: è la sola difesa contro un clic che
    // cancellerebbe tutto passando dalla porta di servizio.
    const pulsante = screen.getByRole('button', { name: 'Elimina nel periodo' })
    expect(pulsante).toBeDisabled()

    await utente.type(screen.getByLabelText('Da'), '2026-01-01')
    await utente.type(screen.getByLabelText('A'), '2026-03-31')
    await utente.click(pulsante)

    await waitFor(() => expect(inviate).not.toBeNull())
    expect(inviate!.get('from')).toBe('2026-01-01')
    expect(inviate!.get('to')).toBe('2026-03-31')
    expect(await screen.findByText(/4/)).toBeInTheDocument()
  })

  it('scritta la parola, cancella e mostra il riepilogo', async () => {
    server.use(
      http.delete('*/api/data-cleanup', () =>
        HttpResponse.json({
          transactionsDeleted: 12,
          recurringTransactionsDeleted: 3,
          balanceCheckpointsDeleted: 1,
          expenseRemindersDeleted: 0,
        }),
      ),
    )
    const utente = userEvent.setup()
    mountPage(<SettingsPage />, { route: '/impostazioni' })
    await vaiAllaScheda(utente)

    await utente.click(screen.getByRole('button', { name: 'Elimina tutto' }))
    await utente.type(screen.getByPlaceholderText('ELIMINA'), 'ELIMINA')
    await utente.click(screen.getByRole('button', { name: 'Elimina definitivamente' }))

    expect(await screen.findByText(/12/)).toBeInTheDocument()
  })
})
