import { beforeEach, describe, expect, it } from 'vitest'
import { clearQueue, count, dequeue, enqueue, getQueue } from './queue'

// La coda delle transazioni registrate offline. Se qualcosa qui si rompe, la
// spesa che hai appena inserito senza rete non arriva mai al server: è l'unico
// posto dove un dato dell'utente vive solo nel browser.

const CHIAVE = 'offline_pending_transactions'

const spesa = {
  categoryId: 'cat-1',
  amount: 12.5,
  type: 'EXPENSE' as const,
  occurredOn: '2026-08-28',
  description: 'Caffè',
}

beforeEach(() => {
  clearQueue()
})

describe('andata e ritorno', () => {
  it('una transazione accodata si rilegge', () => {
    const accodata = enqueue(spesa)
    const coda = getQueue()

    expect(coda).toHaveLength(1)
    expect(coda[0]).toMatchObject(spesa)
    expect(coda[0].localId).toBe(accodata.localId)
  })

  it('assegna un identificativo locale e il momento dell accodamento', () => {
    const accodata = enqueue(spesa)

    expect(accodata.localId).toBeTruthy()
    expect(() => new Date(accodata.queuedAt).toISOString()).not.toThrow()
  })

  it('due transazioni ricevono identificativi diversi', () => {
    expect(enqueue(spesa).localId).not.toBe(enqueue(spesa).localId)
  })

  it('mantiene l ordine di inserimento', () => {
    enqueue({ ...spesa, description: 'prima' })
    enqueue({ ...spesa, description: 'seconda' })

    expect(getQueue().map((t) => t.description)).toEqual(['prima', 'seconda'])
  })

  it('conta quante ne restano', () => {
    expect(count()).toBe(0)
    enqueue(spesa)
    enqueue(spesa)
    expect(count()).toBe(2)
  })
})

describe('rimozione', () => {
  it('toglie solo quella indicata', () => {
    const prima = enqueue({ ...spesa, description: 'prima' })
    enqueue({ ...spesa, description: 'seconda' })

    dequeue(prima.localId)

    expect(getQueue().map((t) => t.description)).toEqual(['seconda'])
  })

  it('rimuovere un identificativo inesistente non tocca la coda', () => {
    enqueue(spesa)

    dequeue('non-esiste')

    expect(count()).toBe(1)
  })

  it('svuotare la coda la azzera', () => {
    enqueue(spesa)

    clearQueue()

    expect(getQueue()).toEqual([])
  })
})

describe('archiviazione corrotta', () => {
  // Può succedere: un'altra scheda che scrive, un aggiornamento a metà, un
  // utente che fruga negli strumenti di sviluppo. La coda deve degradare a
  // vuota, non far esplodere l'app all'avvio.
  it('un contenuto che non è JSON viene ignorato', () => {
    localStorage.setItem(CHIAVE, 'non-json{{{')

    expect(getQueue()).toEqual([])
    expect(count()).toBe(0)
  })

  it('un JSON valido ma che non è un elenco viene ignorato', () => {
    localStorage.setItem(CHIAVE, '{"non":"un elenco"}')

    expect(getQueue()).toEqual([])
    expect(count()).toBe(0)
  })

  it('accodare dopo un contenuto corrotto riparte da una coda pulita', () => {
    localStorage.setItem(CHIAVE, 'non-json{{{')

    enqueue(spesa)

    expect(count()).toBe(1)
  })
})
