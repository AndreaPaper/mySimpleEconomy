import { act, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineSyncProvider, useOfflineSync } from './OfflineSyncContext'
import { enqueue, getQueue } from '../offline/queue'

// La sincronizzazione differita: quello che succede fra il momento in cui una
// spesa viene registrata senza rete e quello in cui arriva davvero in archivio.
//
// È il punto dell'app dove un errore perde dati dell'utente in modo definitivo,
// e dove non c'è nulla a schermo che lo segnali: la coda si svuota, il
// contatore va a zero, e la spesa semplicemente non c'è.

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
})
afterAll(() => server.close())

function Spia() {
  const { pendingCount, backendReachable, isOnline } = useOfflineSync()
  return (
    <div>
      <span data-testid="in-coda">{pendingCount}</span>
      <span data-testid="backend">{backendReachable ? 'su' : 'giu'}</span>
      <span data-testid="rete">{isOnline ? 'online' : 'offline'}</span>
    </div>
  )
}

const monta = () => render(<OfflineSyncProvider><Spia /></OfflineSyncProvider>)

const spesa = (description: string) => ({
  categoryId: 'cat-1',
  amount: 10,
  type: 'EXPENSE' as const,
  occurredOn: '2026-03-02',
  description,
})

describe('la coda in sospeso', () => {
  /**
   * Il caso per cui esiste il tentativo all'avvio: la spesa è stata registrata
   * senza rete in una sessione precedente e l'app è stata poi riaperta. In
   * questa sessione nessun evento "backend irraggiungibile" scatterà mai, e
   * senza quel tentativo la spesa resterebbe in coda per sempre — invisibile,
   * perché il contatore la mostra ma nessuno lo guarda due volte.
   */
  it('si svuota all avvio se c era qualcosa da mandare', async () => {
    enqueue(spesa('Farmacia'))
    enqueue(spesa('Ekom'))
    server.use(http.post('*/api/transactions', () => HttpResponse.json({ id: 't' }, { status: 201 })))

    monta()

    await waitFor(() => expect(screen.getByTestId('in-coda')).toHaveTextContent('0'))
    expect(getQueue()).toHaveLength(0)
  })

  /**
   * E la regola opposta, che è quella che protegge i dati: se una spesa non
   * riesce a passare, l'esecuzione si ferma lì e il resto resta in coda. Andare
   * avanti "saltando quella rotta" scaricherebbe l'errore su una spesa a caso e
   * lascerebbe l'utente con un archivio incompleto e nessun modo di saperlo.
   */
  it('un errore a metà lascia in coda il resto invece di proseguire', async () => {
    enqueue(spesa('Prima'))
    enqueue(spesa('Seconda'))
    enqueue(spesa('Terza'))
    let inviate = 0
    server.use(
      http.post('*/api/transactions', () => {
        inviate++
        return inviate === 1
          ? HttpResponse.json({ id: 't' }, { status: 201 })
          : new HttpResponse(null, { status: 500 })
      }),
    )

    monta()

    await waitFor(() => expect(getQueue()).toHaveLength(2))
    expect(getQueue().map((q) => q.description)).toEqual(['Seconda', 'Terza'])
    // Il tentativo si è fermato: la terza non è nemmeno stata provata.
    expect(inviate).toBe(2)
  })

  it('senza nulla in coda non chiama il backend', async () => {
    let chiamate = 0
    server.use(
      http.post('*/api/transactions', () => {
        chiamate++
        return HttpResponse.json({ id: 't' }, { status: 201 })
      }),
    )

    monta()

    await waitFor(() => expect(screen.getByTestId('in-coda')).toHaveTextContent('0'))
    expect(chiamate).toBe(0)
  })

  it('l accesso riuscito fa ripartire la sincronizzazione', async () => {
    monta()
    server.use(http.post('*/api/transactions', () => HttpResponse.json({ id: 't' }, { status: 201 })))
    enqueue(spesa('Farmacia'))

    // È l'accoppiamento fra AuthContext e questo context: l'accesso emette
    // l'evento, e ciò che era rimasto in coda parte senza che l'utente faccia
    // nulla. Non si vede da nessuna parte se non seguendo l'evento.
    act(() => {
      window.dispatchEvent(new Event('auth:login-success'))
    })

    await waitFor(() => expect(getQueue()).toHaveLength(0))
  })
})

describe('il ricontrollo del backend', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('l evento di irraggiungibilità segna il backend come giù', async () => {
    monta()

    act(() => {
      window.dispatchEvent(new Event('backend:unreachable'))
    })

    expect(screen.getByTestId('backend')).toHaveTextContent('giu')
  })

  /**
   * L'evento arriva una volta per ogni chiamata fallita, e una pagina ne fa
   * sei o sette insieme. Senza la guardia si avvierebbero sette timer, ognuno
   * dei quali sonderebbe il backend ogni cinque secondi e — al ritorno — ne
   * chiamerebbe il ricaricamento: l'app entrerebbe in un ciclo di ricariche.
   */
  it('più eventi ravvicinati avviano un solo ricontrollo', async () => {
    let sondaggi = 0
    server.use(
      http.get('*/api/categories', () => {
        sondaggi++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    monta()

    act(() => {
      window.dispatchEvent(new Event('backend:unreachable'))
      window.dispatchEvent(new Event('backend:unreachable'))
      window.dispatchEvent(new Event('backend:unreachable'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(sondaggi).toBe(1)
  })

  it('smontare il componente ferma il ricontrollo', async () => {
    let sondaggi = 0
    server.use(
      http.get('*/api/categories', () => {
        sondaggi++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const { unmount } = monta()
    act(() => {
      window.dispatchEvent(new Event('backend:unreachable'))
    })

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })

    expect(sondaggi).toBe(0)
  })

  // Dopo lo smontaggio nessuno dei quattro ascoltatori deve restare appeso:
  // in test si vedrebbe come un aggiornamento di stato su un componente morto,
  // in produzione come una perdita di memoria a ogni cambio di pagina.
  it('smontare il componente stacca gli ascoltatori', async () => {
    const { unmount } = monta()
    unmount()

    // Se un ascoltatore fosse rimasto, React segnalerebbe l'aggiornamento su un
    // componente smontato; l'assenza di errori è l'asserzione.
    act(() => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('offline'))
      window.dispatchEvent(new Event('auth:login-success'))
      window.dispatchEvent(new Event('backend:unreachable'))
    })
  })
})
