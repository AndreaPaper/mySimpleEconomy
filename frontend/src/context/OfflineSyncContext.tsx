import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { transactionsApi } from '../api/endpoints'
import type { TransactionType } from '../api/types'
import { count, dequeue, enqueue, getQueue, type QueuedTransaction } from '../offline/queue'

interface OfflineSyncContextValue {
  isOnline: boolean
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
  const [pendingCount, setPendingCount] = useState(count())
  const isSyncing = useRef(false)

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

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('auth:login-success', handleLoginSuccess)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('auth:login-success', handleLoginSuccess)
    }
  }, [])

  return (
    <OfflineSyncContext.Provider value={{ isOnline, pendingCount, addOfflineTransaction, syncPending }}>
      {children}
    </OfflineSyncContext.Provider>
  )
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext)
  if (!ctx) throw new Error('useOfflineSync must be used within OfflineSyncProvider')
  return ctx
}
