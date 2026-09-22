import type { Category, Transaction } from '../api/types'
import type { QueuedTransaction } from '../offline/queue'
import { periodKeyOf } from './period'

// Le due trasformazioni che stanno fra ciò che arriva (dal backend o dalla coda
// offline) e le righe che si vedono nell'elenco Transazioni. Estratte dalla
// pagina perché sono pure e perché entrambe hanno un presupposto che, se salta,
// non produce un errore ma un elenco sbagliato.

/** Una transazione dell'elenco; `pending` marca quelle ancora in coda. */
export type DisplayTransaction = Transaction & { pending?: boolean }

/**
 * Raggruppa per periodo stipendio-to-stipendio.
 *
 * <strong>Dipende dall'ordinamento del server.</strong> Le transazioni arrivano
 * già ordinate per data decrescente, quindi quelle dello stesso periodo sono
 * adiacenti e basta accumularle. Se un giorno il server cambia ordine, questa
 * funzione non fallisce: produce lo stesso periodo spezzato in più gruppi,
 * ognuno con la propria intestazione e i propri totali. A schermo sembra
 * plausibile, ed è il motivo per cui il presupposto va scritto e provato.
 */
export function groupByMonth(
  transactions: DisplayTransaction[],
  salaryDay: number | null,
): { key: string; items: DisplayTransaction[] }[] {
  const groups: { key: string; items: DisplayTransaction[] }[] = []
  for (const t of transactions) {
    const key = periodKeyOf(t.occurredOn, salaryDay)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.key === key) {
      lastGroup.items.push(t)
    } else {
      groups.push({ key, items: [t] })
    }
  }
  return groups
}

/**
 * Una spesa registrata senza rete, resa come riga dell'elenco.
 *
 * La categoria si risolve dalla copia locale: se non c'è più — archiviata o
 * cancellata mentre la spesa era in coda — si ripiega su un trattino invece di
 * lasciare la riga senza nome.
 */
export function toDisplayTransaction(q: QueuedTransaction, categories: Category[]): DisplayTransaction {
  const category = categories.find((c) => c.id === q.categoryId)
  return {
    id: q.localId,
    categoryId: q.categoryId,
    categoryName: category?.name ?? '—',
    categoryIcon: category?.icon ?? null,
    categoryColor: category?.color ?? null,
    amount: q.amount,
    type: q.type,
    occurredOn: q.occurredOn,
    description: q.description,
    recurringTransactionId: null,
    pending: true,
  }
}
