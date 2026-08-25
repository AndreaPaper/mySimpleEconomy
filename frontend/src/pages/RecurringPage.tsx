import { useEffect, useState } from 'react'
import { categoriesApi, recurringApi } from '../api/endpoints'
import type { Category, IntervalUnit, RecurringTransaction } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RecurringTransactionForm from '../components/RecurringTransactionForm'
import OverridesPanel from '../components/OverridesPanel'
import { ListPageSkeleton } from '../components/Skeleton'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reload = () => recurringApi.list().then(setItems)

  useEffect(() => {
    Promise.all([reload(), categoriesApi.list().then(setCategories)]).finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (item: RecurringTransaction) => {
    setEditing(item)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: {
    categoryId: string
    name: string
    defaultAmount: number
    intervalUnit: IntervalUnit
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate: string | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await recurringApi.update(editing.id, data)
    } else {
      await recurringApi.create(data)
    }
    await reload()
    closeModal()
  }

  const handleToggleActive = async (item: RecurringTransaction) => {
    if (item.active) {
      await recurringApi.deactivate(item.id)
    } else {
      await recurringApi.reactivate(item.id)
    }
    await reload()
  }

  const [pendingDelete, setPendingDelete] = useState<RecurringTransaction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const askDelete = (item: RecurringTransaction) => {
    setDeleteError(null)
    setPendingDelete(item)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await recurringApi.delete(pendingDelete.id)
      setPendingDelete(null)
      await reload()
    } catch {
      setDeleteError('Eliminazione non riuscita. Riprova.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <ListPageSkeleton />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transazioni ricorrenti</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
        >
          Nuova regola
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessuna regola ricorrente ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
          {items.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {r.name} {!r.active && <span className="text-xs text-slate-400 dark:text-slate-500">(disattivata)</span>}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {r.categoryName} · ogni {r.intervalValue} {r.intervalUnit.toLowerCase()} · prossima:{' '}
                    {r.nextDueDate}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={r.categoryType === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}>
                    {currency.format(r.defaultAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="-m-1 p-1 text-sm text-brand-700 hover:underline"
                  >
                    Eccezioni
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="-m-1 p-1 text-sm text-brand-700 hover:underline"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(r)}
                    className="-m-1 p-1 text-sm text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    {r.active ? 'Disattiva' : 'Riattiva'}
                  </button>
                  <button
                    type="button"
                    onClick={() => askDelete(r)}
                    className="-m-1 p-1 text-sm text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    Elimina
                  </button>
                </div>
              </div>
              {expandedId === r.id && <OverridesPanel recurringTransactionId={r.id} />}
            </li>
          ))}
        </ul>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica regola' : 'Nuova regola ricorrente'} onClose={closeModal}>
          <RecurringTransactionForm
            categories={categories}
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Elimina regola ricorrente"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        >
          <p>
            La regola non genererà più transazioni. Quelle già generate non vengono toccate.
          </p>
          {/* Stessa riga che si legge in elenco: importo, cadenza e prossima
              scadenza, cioè quello che si sta per smettere di generare. */}
          <p className="mt-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
            <span className="font-medium text-slate-900 dark:text-white">{pendingDelete.name}</span>
            <br />
            {currency.format(pendingDelete.defaultAmount)} · {pendingDelete.categoryName} · ogni{' '}
            {pendingDelete.intervalValue} {pendingDelete.intervalUnit.toLowerCase()} · prossima:{' '}
            {pendingDelete.nextDueDate}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
