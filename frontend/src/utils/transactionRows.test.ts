import { describe, expect, it } from 'vitest'
import { groupByMonth, toDisplayTransaction, type DisplayTransaction } from './transactionRows'
import type { Category, Transaction } from '../api/types'
import type { QueuedTransaction } from '../offline/queue'

// Le due trasformazioni dell'elenco Transazioni. Nessuna delle due fallisce se
// il suo presupposto salta: producono un elenco sbagliato ma plausibile, che
// nessuno pensa di verificare.

const tx = (occurredOn: string, over: Partial<DisplayTransaction> = {}): DisplayTransaction => ({
  id: `t-${occurredOn}`,
  categoryId: 'c-1',
  categoryName: 'Spesa',
  categoryIcon: null,
  categoryColor: null,
  amount: 10,
  type: 'EXPENSE',
  occurredOn,
  description: null,
  recurringTransactionId: null,
  ...over,
})

// Stipendio il 27: il periodo di una data parte dal 27 del mese prima.
const SALARY_DAY = 27

describe('groupByMonth', () => {
  it('senza transazioni non produce gruppi', () => {
    expect(groupByMonth([], SALARY_DAY)).toEqual([])
  })

  it('raggruppa per periodo stipendio-to-stipendio, non per mese di calendario', () => {
    // Il 2 e il 20 marzo stanno nello stesso periodo (27 feb → 26 mar); il 28
    // marzo è già nel periodo dopo.
    const gruppi = groupByMonth(
      [tx('2026-03-20'), tx('2026-03-02'), tx('2026-03-28')],
      SALARY_DAY,
    )

    expect(gruppi).toHaveLength(2)
    expect(gruppi[0].items.map((t) => t.occurredOn)).toEqual(['2026-03-20', '2026-03-02'])
    expect(gruppi[1].items.map((t) => t.occurredOn)).toEqual(['2026-03-28'])
  })

  /**
   * Il presupposto scritto nero su bianco: le transazioni <em>devono</em>
   * arrivare ordinate, altrimenti lo stesso periodo si spezza in più gruppi.
   * Qui l'ordine è rotto di proposito, e il risultato — tre gruppi invece di
   * uno — è il modo in cui il bug si presenterebbe: nessun errore, solo
   * intestazioni e totali duplicati.
   */
  it('con l input non ordinato spezza lo stesso periodo (presupposto documentato)', () => {
    const gruppi = groupByMonth(
      [tx('2026-03-20'), tx('2026-04-15'), tx('2026-03-02')],
      SALARY_DAY,
    )

    // Il 20/03 e il 02/03 sono lo stesso periodo, ma il 15/04 in mezzo li separa.
    expect(gruppi).toHaveLength(3)
  })

  it('tiene tutte le transazioni, in ordine di arrivo dentro il gruppo', () => {
    const gruppi = groupByMonth([tx('2026-03-10'), tx('2026-03-05'), tx('2026-03-01')], SALARY_DAY)

    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].items).toHaveLength(3)
  })
})

describe('toDisplayTransaction', () => {
  const coda: QueuedTransaction = {
    localId: 'local-1',
    categoryId: 'c-1',
    amount: 42.5,
    type: 'EXPENSE',
    occurredOn: '2026-03-02',
    description: 'Ekom',
    queuedAt: '2026-03-02T10:00:00Z',
  }

  const categorie: Category[] = [
    { id: 'c-1', name: 'Alimentari', type: 'EXPENSE', color: '#F6C9C0', icon: 'cart', parentId: null, archived: false },
  ]

  it('risolve nome, colore e icona dalla categoria in memoria', () => {
    const riga = toDisplayTransaction(coda, categorie)

    expect(riga.categoryName).toBe('Alimentari')
    expect(riga.categoryColor).toBe('#F6C9C0')
    expect(riga.categoryIcon).toBe('cart')
    expect(riga.id).toBe('local-1')
    expect(riga.pending).toBe(true)
  })

  /**
   * Il caso di ripiego: la categoria è sparita mentre la spesa era in coda
   * (archiviata, o cancellata). La riga deve comunque comparire, con un
   * trattino al posto del nome, invece di restare senza etichetta o di far
   * saltare il rendering.
   */
  it('se la categoria non c e piu ripiega su un trattino', () => {
    const riga = toDisplayTransaction(coda, [])

    expect(riga.categoryName).toBe('—')
    expect(riga.categoryColor).toBeNull()
    expect(riga.pending).toBe(true)
  })
})
