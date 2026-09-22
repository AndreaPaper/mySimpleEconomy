import type { TransactionType } from '../api/types'

const STORAGE_KEY = 'offline_pending_transactions'

export interface QueuedTransaction {
  localId: string
  categoryId: string
  amount: number
  type: TransactionType
  occurredOn: string
  description: string | null
  queuedAt: string
}

export function getQueue(): QueuedTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Il try/catch da solo non basta: un JSON valido ma che non è un elenco
    // (un'altra scheda che scrive, un aggiornamento a metà) passava di qui
    // intatto, e poi faceva esplodere count() e ogni .map() a valle. Qui c'è
    // l'unico dato dell'utente che vive solo nel browser: deve degradare a
    // coda vuota, non impedire l'avvio dell'app.
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedTransaction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

export function enqueue(data: {
  categoryId: string
  amount: number
  type: TransactionType
  occurredOn: string
  description: string | null
}): QueuedTransaction {
  const entry: QueuedTransaction = {
    ...data,
    localId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  }
  const queue = getQueue()
  queue.push(entry)
  saveQueue(queue)
  return entry
}

export function dequeue(localId: string) {
  saveQueue(getQueue().filter((t) => t.localId !== localId))
}

export function clearQueue() {
  localStorage.removeItem(STORAGE_KEY)
}

export function count(): number {
  return getQueue().length
}
