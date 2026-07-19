import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { categoriesApi, transactionsApi } from '../api/endpoints'
import type { TransactionType } from '../api/types'
import { count, dequeue, enqueue, getQueue, type QueuedTransaction } from '../offline/queue'

// Ogni quanto ricontrollare se il backend è tornato raggiungibile, una volta
// rilevato un timeout (vedi api/client.ts).
const BACKEND_POLL_INTERVAL_MS = 5000

interface OfflineSyncContextValue {
  isOnline: boolean
  backendReachable: boolean
  pendingCount: number
  addOfflineTransaction: (data: {
    categoryId: string
    amount: number
    type: TransactionType
    occurredOn: string
    description: string | null
  }) => QueuedTransaction
  syncPending: () => Promise<void>
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | undefined>(undefined)

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [backendReachable, setBackendReachable] = useState(true)
  const [pendingCount, setPendingCount] = useState(count())
  const isSyncing = useRef(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncPending = async () => {
    if (isSyncing.current) return
    isSyncing.current = true
    try {
      for (const item of getQueue()) {
        try {
          await transactionsApi.create({
            categoryId: item.categoryId,
            amount: item.amount,
            type: item.type,
            occurredOn: item.occurredOn,
            description: item.description,
          })
          dequeue(item.localId)
          setPendingCount(count())
        } catch (err) {
          // 401: existing client.ts interceptor already redirects to /login.
          // Any other error: stop the run and leave the remainder queued
          // rather than risk silently dropping data.
          const status = (err as { response?: { status?: number } }).response?.status
          if (status === 401) return
          return
        }
      }
    } finally {
      isSyncing.current = false
    }
  }

  const addOfflineTransaction: OfflineSyncContextValue['addOfflineTransaction'] = (data) => {
    const entry = enqueue(data)
    setPendingCount(count())
    return entry
  }

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncPending()
    }
    const handleOffline = () => setIsOnline(false)
    const handleLoginSuccess = () => syncPending()

    // Rilevato un timeout verso il backend (vedi api/client.ts): comincia a
    // ricontrollare in background finché non torna raggiungibile, poi
    // ricarica la pagina per riottenere tutte le funzionalità con dati
    // freschi, senza dover chiedere all'utente di farlo manualmente.
    const handleBackendUnreachable = () => {
      if (pollTimer.current) return
      setBackendReachable(false)
      pollTimer.current = setInterval(async () => {
        try {
          await categoriesApi.list()
          if (pollTimer.current) clearInterval(pollTimer.current)
          pollTimer.current = null
          setBackendReachable(true)
          await syncPending()
          window.location.reload()
        } catch {
          // Ancora irraggiungibile: il prossimo tick riprova.
        }
      }, BACKEND_POLL_INTERVAL_MS)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('auth:login-success', handleLoginSuccess)
    window.addEventListener('backend:unreachable', handleBackendUnreachable)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('auth:login-success', handleLoginSuccess)
      window.removeEventListener('backend:unreachable', handleBackendUnreachable)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  return (
    <OfflineSyncContext.Provider value={{ isOnline, backendReachable, pendingCount, addOfflineTransaction, syncPending }}>
      {children}
    </OfflineSyncContext.Provider>
  )
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext)
  if (!ctx) throw new Error('useOfflineSync must be used within OfflineSyncProvider')
  return ctx
}
