import { useEffect, useRef, useState } from 'react'
import { categoriesApi, excelExportApi, transactionsApi } from '../api/endpoints'
import type { Category, Transaction, TransactionType } from '../api/types'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import { getCategoryIcon } from '../constants/icons'
import { TransactionsPageSkeleton } from '../components/Skeleton'
import { useOfflineSync } from '../context/OfflineSyncContext'
import { cacheCategories, loadCachedCategories } from '../offline/categoriesCache'
import { getQueue, type QueuedTransaction } from '../offline/queue'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return monthLabelFormatter.format(new Date(year, month - 1, 1))
}

// Le transazioni arrivano già ordinate per data decrescente, quindi quelle
// dello stesso mese sono sempre adiacenti: basta accumularle in gruppi.
function groupByMonth(transactions: DisplayTransaction[]): { key: string; items: DisplayTransaction[] }[] {
  const groups: { key: string; items: DisplayTransaction[] }[] = []
  for (const t of transactions) {
    const key = t.occurredOn.slice(0, 7)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.key === key) {
      lastGroup.items.push(t)
    } else {
      groups.push({ key, items: [t] })
    }
  }
  return groups
}

type DisplayTransaction = Transaction & { pending?: boolean }

function toDisplayTransaction(q: QueuedTransaction, categories: Category[]): DisplayTransaction {
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

export default function TransactionsPage() {
  const { isOnline, backendReachable, pendingCount, addOfflineTransaction } = useOfflineSync()
  const offlineLike = !isOnline || !backendReachable
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [pendingItems, setPendingItems] = useState<QueuedTransaction[]>(() => getQueue())
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [exporting, setExporting] = useState(false)
  const prevPendingCount = useRef(pendingCount)

  const reloadTransactions = () => transactionsApi.list().then(setTransactions).catch(() => {})

  useEffect(() => {
    Promise.all([
      reloadTransactions(),
      categoriesApi
        .list()
        .then((cats) => {
          cacheCategories(cats)
          setCategories(cats)
        })
        .catch(() => setCategories(loadCachedCategories())),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setPendingItems(getQueue())
    if (prevPendingCount.current > 0 && pendingCount === 0) {
      reloadTransactions()
    }
    prevPendingCount.current = pendingCount
  }, [pendingCount])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (transaction: Transaction) => {
    setEditing(transaction)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: {
    categoryId: string
    amount: number
    type: string
    occurredOn: string
    description: string | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await transactionsApi.update(editing.id, data)
      await reloadTransactions()
      closeModal()
      return
    }

    if (offlineLike) {
      addOfflineTransaction({ ...data, type: data.type as TransactionType })
      closeModal()
      return
    }

    try {
      await transactionsApi.create(data)
    } catch (err) {
      if ((err as { response?: unknown }).response === undefined) {
        addOfflineTransaction({ ...data, type: data.type as TransactionType })
        closeModal()
        return
      }
      throw err
    }
    await reloadTransactions()
    closeModal()
  }

  const handleDelete = async (transaction: Transaction) => {
    if (!window.confirm('Eliminare questa transazione?')) return
    await transactionsApi.delete(transaction.id)
    await reloadTransactions()
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await excelExportApi.download()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'transazioni.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <TransactionsPageSkeleton />

  const displayTransactions: DisplayTransaction[] = [
    ...pendingItems.map((q) => toDisplayTransaction(q, categories)),
    ...transactions,
  ].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transazioni</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 hover:dark:bg-zinc-900 disabled:opacity-50"
          >
            {exporting ? 'Esportazione...' : 'Esporta in Excel'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Nuova transazione
          </button>
        </div>
      </div>

      {displayTransactions.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessuna transazione ancora.</p>
      ) : (
        <div className="space-y-6">
          {groupByMonth(displayTransactions).map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-sm font-medium capitalize text-slate-600 dark:text-slate-300">
                {monthLabel(group.key)}
              </p>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
                {group.items.map((t) => {
                  const Icon = getCategoryIcon(t.categoryIcon)
                  const actionsDisabled = offlineLike || t.pending
                  return (
                    <li key={t.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: t.categoryColor ?? '#94a3b8' }}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </span>
                        <div>
                          <p className="font-medium">{t.description || t.categoryName}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t.occurredOn} · {t.categoryName}
                            {t.recurringTransactionId && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(ricorrente)</span>}
                            {t.pending && <span className="ml-1 text-xs text-amber-600">(in attesa di sincronizzazione)</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={t.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}>
                          {t.type === 'INCOME' ? '+' : '-'}
                          {currency.format(t.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          disabled={actionsDisabled}
                          title={offlineLike ? 'Non disponibile offline' : undefined}
                          className="-m-1 p-1 text-sm text-green-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          disabled={actionsDisabled}
                          title={offlineLike ? 'Non disponibile offline' : undefined}
                          className="-m-1 p-1 text-sm text-slate-500 dark:text-slate-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                        >
                          Elimina
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica transazione' : 'Nuova transazione'} onClose={closeModal}>
          <TransactionForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
