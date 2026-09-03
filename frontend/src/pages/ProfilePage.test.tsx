import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import ProfilePage from './ProfilePage'
import { profiloVuoto } from '../test/handlers'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Profilo. Tre cose non di markup: il rilevamento delle modifiche (fatto
// confrontando due JSON, quindi fragile all'ordine delle chiavi), la
// marshalling numero↔stringa nei due versi, e i due salvataggi indipendenti —
// saldo e profilo — che non devono interferire.

setupApiMocks()

const profilo = (over = {}) => ({ ...profiloVuoto, ...over })

describe('rilevamento delle modifiche', () => {
  it('parte da "Tutto salvato" e passa a "Modifiche non salvate" al primo cambio', async () => {
    server.use(http.get('*/api/profile', () => HttpResponse.json(profilo({ nickname: 'Andrea' }))))
    const utente = userEvent.setup()
    mountPage(<ProfilePage />, { route: '/profilo' })

    expect(await screen.findByText('Tutto salvato')).toBeInTheDocument()

    await utente.type(screen.getByLabelText('Nickname'), '!')
    expect(await screen.findByText('Modifiche non salvate')).toBeInTheDocument()
  })
})

describe('marshalling dei numeri', () => {
  /**
   * Un campo svuotato deve tornare `null`, non `0` né `""`. Salvare 0 come
   * stipendio farebbe stimare un budget a zero; salvare "" romperebbe la
   * validazione lato server.
   */
  it('lo stipendio svuotato viene salvato come null', async () => {
    let corpo: Record<string, unknown> | null = null
    server.use(
      http.get('*/api/profile', () => HttpResponse.json(profilo({ defaultSalaryAmount: 1800 }))),
      http.put('*/api/profile', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(profilo())
      }),
    )
    const utente = userEvent.setup()
    mountPage(<ProfilePage />, { route: '/profilo' })

    const stipendio = await screen.findByPlaceholderText('Es. 1800.00')
    await utente.clear(stipendio)
    await utente.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    await waitFor(() => expect(corpo).not.toBeNull())
    expect(corpo!.defaultSalaryAmount).toBeNull()
  })

  it('uno stipendio valorizzato viene mandato come numero, non come stringa', async () => {
    let corpo: Record<string, unknown> | null = null
    server.use(
      http.put('*/api/profile', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(profilo())
      }),
    )
    const utente = userEvent.setup()
    mountPage(<ProfilePage />, { route: '/profilo' })

    const stipendio = await screen.findByPlaceholderText('Es. 1800.00')
    await utente.type(stipendio, '1850')
    await utente.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    await waitFor(() => expect(corpo).not.toBeNull())
    expect(corpo!.defaultSalaryAmount).toBe(1850)
  })
})

describe('i due salvataggi indipendenti', () => {
  /**
   * Saldo e profilo sono due flussi separati, con errori e stati propri. Un
   * errore sul saldo non deve toccare lo stato del profilo, e viceversa.
   */
  it('un errore sul saldo non tocca il profilo', async () => {
    server.use(http.post('*/api/balance-checkpoints', () => new HttpResponse(null, { status: 500 })))
    const utente = userEvent.setup()
    mountPage(<ProfilePage />, { route: '/profilo' })

    const saldo = await screen.findByPlaceholderText('Es. 1500,00')
    await utente.type(saldo, '2000')
    await utente.click(screen.getByRole('button', { name: 'Registra' }))

    expect(await screen.findByText(/Salvataggio non riuscito/)).toBeInTheDocument()
    // Il profilo resta "Tutto salvato": non è stato toccato.
    expect(screen.getByText('Tutto salvato')).toBeInTheDocument()
  })

  it('salvato il profilo torna "Tutto salvato"', async () => {
    server.use(http.get('*/api/profile', () => HttpResponse.json(profilo({ nickname: 'Andrea' }))))
    const utente = userEvent.setup()
    mountPage(<ProfilePage />, { route: '/profilo' })

    await utente.type(await screen.findByLabelText('Nickname'), '!')
    await screen.findByText('Modifiche non salvate')
    await utente.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(await screen.findByText('Tutto salvato')).toBeInTheDocument()
  })
})
