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
    return raw ? JSON.parse(raw) : []
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
