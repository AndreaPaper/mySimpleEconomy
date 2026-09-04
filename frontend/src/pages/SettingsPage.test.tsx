import { screen } from '@testing-library/react'
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
