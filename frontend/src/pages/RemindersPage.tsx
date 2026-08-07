import { useEffect, useState } from 'react'
import { categoriesApi, remindersApi } from '../api/endpoints'
import type { Category, ExpenseReminder, IntervalUnit } from '../api/types'
import Modal from '../components/Modal'
import ExpenseReminderForm from '../components/ExpenseReminderForm'
import { ListPageSkeleton } from '../components/Skeleton'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function RemindersPage() {
  const [items, setItems] = useState<ExpenseReminder[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ExpenseReminder | null>(null)

  const reload = () => remindersApi.list().then(setItems)

  useEffect(() => {
    Promise.all([reload(), categoriesApi.list().then(setCategories)]).finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (item: ExpenseReminder) => {
    setEditing(item)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: {
    categoryId: string
    name: string
    amount: number | null
    intervalUnit: IntervalUnit
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate: string | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await remindersApi.update(editing.id, data)
    } else {
      await remindersApi.create(data)
    }
    await reload()
    closeModal()
  }

  const handleToggleActive = async (item: ExpenseReminder) => {
    if (item.active) {
      await remindersApi.deactivate(item.id)
    } else {
      await remindersApi.reactivate(item.id)
    }
    await reload()
  }

  if (loading) return <ListPageSkeleton />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Promemoria spese fisse</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ricordano quando ricorrono le spese fisse; con categoria e prezzo (opzionale), a inizio mese vengono
            già contate come uscite.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
        >
          Nuovo promemoria
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessun promemoria ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">
                  {r.name} {!r.active && <span className="text-xs text-slate-400 dark:text-slate-500">(disattivato)</span>}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ogni {r.intervalValue} {r.intervalUnit.toLowerCase()} · prossima: {r.nextDueDate}
                  {r.categoryName && ` · ${r.categoryName}`}
                  {r.amount != null && ` · ${currency.format(r.amount)}`}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => openEdit(r)} className="-m-1 p-1 text-brand-700 hover:underline">
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleActive(r)}
                  className="-m-1 p-1 text-slate-500 dark:text-slate-400 hover:underline"
                >
                  {r.active ? 'Disattiva' : 'Riattiva'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica promemoria' : 'Nuovo promemoria'} onClose={closeModal}>
          <ExpenseReminderForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
