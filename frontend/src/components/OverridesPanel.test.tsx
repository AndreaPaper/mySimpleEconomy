import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import OverridesPanel from './OverridesPanel'
import { eccezione } from '../test/handlers'
import { server, setupApiMocks } from '../test/server'
import { withQueryClient } from '../test/queryClient'

// Le eccezioni di una regola ricorrente: "questo mese l'affitto è 830 invece
// di 750".
//
// Quando ho creato questo file avevo scritto che il pannello non era «mai stato
// montato da un test»: era falso, quattro di questi casi vivevano già dentro
// shell.test.tsx, che parla del guscio di navigazione. Li ho portati qui, dove
// stanno con gli altri tre — la nota vuota che diventa null e le due prove
// sulla cancellazione — e tolti da lì.
//
// Non serve mountPage: il pannello non legge contesti né rotta, riceve solo
// l'id della regola e parla da sé con l'API.

setupApiMocks()

const monta = () => render(withQueryClient(<OverridesPanel recurringTransactionId="r-1" />))

describe('elenco', () => {
  it('mostra le eccezioni con data, importo e nota', async () => {
    server.use(
      http.get('*/api/recurring-transactions/:id/overrides', () =>
        HttpResponse.json([eccezione({ occurrenceDate: '2026-04-01', overrideAmount: 830, note: 'aumento' })]),
      ),
    )
    monta()

    expect(await screen.findByText('2026-04-01')).toBeInTheDocument()
    expect(screen.getByText(/830,00/)).toBeInTheDocument()
    expect(screen.getByText(/aumento/)).toBeInTheDocument()
  })

  it('senza eccezioni lo dice invece di mostrare un elenco vuoto', async () => {
    monta()

    expect(await screen.findByText('Nessuna eccezione per questa regola.')).toBeInTheDocument()
  })
})

describe('aggiunta', () => {
  it('manda data, importo e nota, poi ricarica l elenco', async () => {
    const u = userEvent.setup()
    let inviato: Record<string, unknown> | null = null
    let letture = 0
    server.use(
      http.get('*/api/recurring-transactions/:id/overrides', () => {
        letture++
        return HttpResponse.json(letture > 1 ? [eccezione({ occurrenceDate: '2026-05-01' })] : [])
      }),
      http.post('*/api/recurring-transactions/:id/overrides', async ({ request }) => {
        inviato = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(eccezione(), { status: 201 })
      }),
    )
    monta()

    await screen.findByText('Nessuna eccezione per questa regola.')
    await u.clear(screen.getByLabelText('Data'))
    await u.type(screen.getByLabelText('Data'), '2026-05-01')
    await u.type(screen.getByLabelText('Importo eccezione'), '830')
    await u.type(screen.getByLabelText('Nota (opzionale)'), 'aumento')
    await u.click(screen.getByRole('button', { name: 'Aggiungi' }))

    await waitFor(() => expect(inviato).not.toBeNull())
    expect(inviato).toMatchObject({ occurrenceDate: '2026-05-01', overrideAmount: 830, note: 'aumento' })
    // L'elenco si ricarica da solo: l'eccezione appena creata compare.
    expect(await screen.findByText('2026-05-01')).toBeInTheDocument()
  })

  /**
   * Una nota lasciata vuota va mandata come null, non come stringa vuota: sono
   * due cose diverse in archivio, e a schermo la stringa vuota stamperebbe il
   * separatore "·" senza niente dopo.
   */
  it('una nota vuota diventa null', async () => {
    const u = userEvent.setup()
    let inviato: Record<string, unknown> | null = null
    server.use(
      http.post('*/api/recurring-transactions/:id/overrides', async ({ request }) => {
        inviato = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(eccezione(), { status: 201 })
      }),
    )
    monta()

    await screen.findByText('Nessuna eccezione per questa regola.')
    await u.type(screen.getByLabelText('Importo eccezione'), '830')
    await u.click(screen.getByRole('button', { name: 'Aggiungi' }))

    await waitFor(() => expect(inviato).not.toBeNull())
    expect(inviato).toMatchObject({ note: null })
  })

  /**
   * Il vincolo che il messaggio nomina — una sola eccezione per data — vive sul
   * database, quindi il fallimento arriva come errore dell'API e non si può
   * prevenire nel modulo. Se il messaggio non comparisse, il pulsante
   * sembrerebbe semplicemente non fare nulla.
   */
  it('un doppione sulla stessa data lo dice invece di restare muto', async () => {
    const u = userEvent.setup()
    server.use(
      http.post('*/api/recurring-transactions/:id/overrides', () => new HttpResponse(null, { status: 409 })),
    )
    monta()

    await screen.findByText('Nessuna eccezione per questa regola.')
    await u.type(screen.getByLabelText('Importo eccezione'), '830')
    await u.click(screen.getByRole('button', { name: 'Aggiungi' }))

    expect(await screen.findByText(/Esiste già un'eccezione per questa data/)).toBeInTheDocument()
  })
})

describe('cancellazione', () => {
  it('chiede conferma prima di eliminare', async () => {
    const u = userEvent.setup()
    let cancellato = false
    server.use(
      http.get('*/api/recurring-transactions/:id/overrides', () => HttpResponse.json([eccezione()])),
      http.delete('*/api/recurring-transactions/:id/overrides/:overrideId', () => {
        cancellato = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    monta()

    await u.click(await screen.findByRole('button', { name: 'Elimina' }))

    expect(await screen.findByText('Elimina eccezione')).toBeInTheDocument()
    expect(cancellato).toBe(false)
  })

  it('confermando la elimina e ricarica', async () => {
    const u = userEvent.setup()
    let cancellato = false
    server.use(
      http.get('*/api/recurring-transactions/:id/overrides', () =>
        HttpResponse.json(cancellato ? [] : [eccezione()]),
      ),
      http.delete('*/api/recurring-transactions/:id/overrides/:overrideId', () => {
        cancellato = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    monta()

    await u.click(await screen.findByRole('button', { name: 'Elimina' }))
    // Il pulsante di conferma porta la stessa scritta di quello della riga:
    // va cercato dentro il dialogo, non a schermo intero.
    const dialogo = within(await screen.findByText('Elimina eccezione').then((t) => t.closest('.fixed') as HTMLElement))
    await u.click(dialogo.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(cancellato).toBe(true))
    expect(await screen.findByText('Nessuna eccezione per questa regola.')).toBeInTheDocument()
  })
})
