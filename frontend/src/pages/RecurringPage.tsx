import { useEffect, useState } from 'react'
import { categoriesApi, recurringApi } from '../api/endpoints'
import type { Category, IntervalUnit, RecurringTransaction } from '../api/types'
import Modal from '../components/Modal'
import RecurringTransactionForm from '../components/RecurringTransactionForm'
import OverridesPanel from '../components/OverridesPanel'

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

  if (loading) return <p className="text-slate-500">Caricamento...</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transazioni ricorrenti</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Nuova regola
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500">Nessuna regola ricorrente ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {items.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {r.name} {!r.active && <span className="text-xs text-slate-400">(disattivata)</span>}
                  </p>
                  <p className="text-sm text-slate-500">
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
                    className="-m-1 p-1 text-sm text-green-600 hover:underline"
                  >
                    Eccezioni
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="-m-1 p-1 text-sm text-green-600 hover:underline"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(r)}
                    className="-m-1 p-1 text-sm text-slate-500 hover:underline"
                  >
                    {r.active ? 'Disattiva' : 'Riattiva'}
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
    </div>
  )
}
