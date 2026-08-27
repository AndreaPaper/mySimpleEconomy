import { useEffect, useRef, useState } from 'react'
import { categoriesApi, excelExportApi, transactionsApi } from '../api/endpoints'
import type { Category, Transaction, TransactionType } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import { getCategoryIcon } from '../constants/icons'
import { TransactionsPageSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useOfflineSync } from '../context/OfflineSyncContext'
import { cacheCategories, loadCachedCategories } from '../offline/categoriesCache'
import { getQueue, type QueuedTransaction } from '../offline/queue'
import { periodKeyOf } from '../utils/period'

const PAGE_SIZE = 30
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return monthLabelFormatter.format(new Date(year, month - 1, 1))
}

// Le transazioni arrivano già ordinate per data decrescente, quindi quelle
// dello stesso periodo sono sempre adiacenti: basta accumularle in gruppi.
function groupByMonth(
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
  const { salaryDay } = useAuth()
  const { isOnline, backendReachable, pendingCount, addOfflineTransaction } = useOfflineSync()
  const offlineLike = !isOnline || !backendReachable
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [pendingItems, setPendingItems] = useState<QueuedTransaction[]>(() => getQueue())
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [exporting, setExporting] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const prevPendingCount = useRef(pendingCount)

  // I filtri viaggiano insieme perché l'elenco arriva paginato dal server: se
  // si filtrasse solo la pagina già scaricata si vedrebbero i risultati di una
  // finestra di 30 transazioni, non quelli di tutto l'archivio. Le stringhe
  // vuote diventano undefined, così il parametro non parte affatto.
  const activeFilters = {
    categoryId: categoryFilter || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  }
  const hasActiveFilters = Boolean(categoryFilter || dateFrom || dateTo)

  const clearFilters = () => {
    setCategoryFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Ogni richiesta prende un numero progressivo e solo l'ultima può scrivere
  // nello stato. Cambiando le date partono più chiamate ravvicinate (il campo
  // data emette un evento per ogni pezzo che si compila) e senza questo
  // controllo la risposta di un filtro intermedio, se arriva per ultima,
  // sovrascrive quella del filtro davvero impostato.
  const latestRequest = useRef(0)

  const reloadTransactions = () => {
    const requestId = ++latestRequest.current
    return transactionsApi
      .list({ ...activeFilters, page: 0, size: PAGE_SIZE })
      .then((res) => {
        if (requestId !== latestRequest.current) return
        setTransactions(res.content)
        setPage(0)
        setHasMore(res.hasNext)
      })
      .catch(() => {})
  }

  const loadMore = async () => {
    const requestId = ++latestRequest.current
    setLoadingMore(true)
    try {
      const res = await transactionsApi.list({ ...activeFilters, page: page + 1, size: PAGE_SIZE })
      if (requestId !== latestRequest.current) return
      setTransactions((prev) => [...prev, ...res.content])
      setPage((p) => p + 1)
      setHasMore(res.hasNext)
    } finally {
      setLoadingMore(false)
    }
  }

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
    if (loading) return
    reloadTransactions()
  }, [categoryFilter, dateFrom, dateTo])

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

  const handleCreateCategory = async (data: { name: string; type: TransactionType; color: string | null; icon: string | null }) => {
    const category = await categoriesApi.create(data)
    const updated = await categoriesApi.list()
    cacheCategories(updated)
    setCategories(updated)
    return category
  }

  const askDelete = (transaction: Transaction) => {
    setDeleteError(null)
    setPendingDelete(transaction)
  }

  // Con window.confirm la cancellazione era istantanea e un errore spariva in
  // silenzio. Ora la richiesta parte a dialogo aperto, quindi va detto quando
  // sta lavorando e va mostrato l'errore lì dentro invece di chiudere e basta.
  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await transactionsApi.delete(pendingDelete.id)
      setPendingDelete(null)
      await reloadTransactions()
    } catch {
      setDeleteError('Eliminazione non riuscita. Riprova.')
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // Esporta quello che stai guardando: senza filtri impostati activeFilters
      // è vuoto e scarica tutto, come prima.
      const blob = await excelExportApi.download(activeFilters)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = hasActiveFilters ? 'transazioni-filtrate.xlsx' : 'transazioni.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <TransactionsPageSkeleton />

  // Le transazioni ancora in coda offline non passano dal server, quindi i
  // filtri vanno riapplicati qui a mano, altrimenti resterebbero visibili
  // anche fuori dall'intervallo scelto. Le date sono stringhe ISO, quindi il
  // confronto lessicografico e' anche quello cronologico.
  const filteredPendingItems = pendingItems.filter(
    (q) =>
      (!categoryFilter || q.categoryId === categoryFilter) &&
      (!dateFrom || q.occurredOn >= dateFrom) &&
      (!dateTo || q.occurredOn <= dateTo),
  )

  const displayTransactions: DisplayTransaction[] = [
    ...filteredPendingItems.map((q) => toDisplayTransaction(q, categories)),
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
            className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
          >
            Nuova transazione
          </button>
        </div>
      </div>

      {/* I filtri stanno su una riga sola e vanno a capo sugli schermi
          stretti: sono tre controlli brevi, uno sotto l'altro sprecherebbero
          tutta l'altezza utile prima di arrivare all'elenco. */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="tx-category-filter">
            Categoria
          </label>
          <select
            id="tx-category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full max-w-xs rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          >
            <option value="">Tutte le categorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* max/min incrociati: il browser impedisce di comporre un intervallo
            rovesciato, che darebbe zero risultati senza spiegare perché. */}
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="tx-date-from">
            Dal
          </label>
          <input
            id="tx-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="tx-date-to">
            Al
          </label>
          <input
            id="tx-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {displayTransactions.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">
          {hasActiveFilters ? 'Nessuna transazione con questi filtri.' : 'Nessuna transazione ancora.'}
        </p>
      ) : (
        <div className="space-y-6">
          {groupByMonth(displayTransactions, salaryDay).map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-sm font-medium capitalize text-slate-600 dark:text-slate-300">
                {monthLabel(group.key)}
              </p>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
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
                          className="-m-1 p-1 text-sm text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => askDelete(t)}
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
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 hover:dark:bg-zinc-900 disabled:opacity-50"
              >
                {loadingMore ? 'Caricamento...' : 'Carica altro'}
              </button>
            </div>
          )}
        </div>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica transazione' : 'Nuova transazione'} onClose={closeModal}>
          <TransactionForm
            categories={categories}
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onCreateCategory={handleCreateCategory}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Elimina transazione"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        >
          <p>Questa transazione verrà eliminata definitivamente.</p>
          {/* La riga in grassetto è la descrizione, che però è facoltativa:
              quando manca ci va la categoria, e allora non la si ripete sotto
              perché la stessa parola due volte sembra un errore. */}
          <p className="mt-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
            <span className="font-medium text-slate-900 dark:text-white">
              {pendingDelete.description || pendingDelete.categoryName}
            </span>
            <br />
            {pendingDelete.occurredOn}
            {pendingDelete.description ? ` · ${pendingDelete.categoryName}` : ''} ·{' '}
            {pendingDelete.type === 'EXPENSE' ? '-' : '+'}
            {currency.format(pendingDelete.amount)}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
