import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { categoriesApi, remindersApi } from '../api/endpoints'
import type { Category, ExpenseReminder, IntervalUnit } from '../api/types'
import Modal from '../components/Modal'
import ExpenseReminderForm from '../components/ExpenseReminderForm'
import { ListPageSkeleton } from '../components/Skeleton'
import { categoryInk } from '../constants/colors'
import { getCategoryIcon } from '../constants/icons'
import { useIsMobile } from '../hooks/useIsMobile'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function RemindersPage() {
  const isMobile = useIsMobile()
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
          <h1 className={isMobile ? 'text-2xl font-bold' : 'text-lg font-semibold'}>
            {isMobile ? 'Promemoria' : 'Promemoria spese fisse'}
          </h1>
          {/* Su mobile la spiegazione si accorcia: la card larga la teneva su
              due righe, qui ne basta una perché lo spazio sotto il titolo
              serve anche all'elenco. */}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isMobile
              ? 'Avvisano quando ricorre una spesa fissa.'
              : 'Ricordano quando ricorrono le spese fisse; con categoria e prezzo (opzionale), a inizio mese vengono già contate come uscite.'}
          </p>
        </div>
        {/* Su mobile "Nuovo promemoria" diventa il tondo flottante sopra la
            lista, come per Transazioni e Ricorrenti. */}
        {!isMobile && (
          <button
            type="button"
            onClick={openCreate}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-900"
          >
            <Plus className="h-4 w-4" />
            Nuovo promemoria
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessun promemoria ancora.</p>
      ) : isMobile ? (
        <div className="flex flex-col gap-2.5">
          {items.map((r) => {
            const Icon = getCategoryIcon(r.categoryIcon)
            return (
              <div
                key={r.id}
                style={{ opacity: r.active ? 1 : 0.5 }}
                className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-brand-300 p-3.5 dark:border-slate-800 dark:bg-black"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: r.categoryColor ?? '#94a3b8' }}
                >
                  <Icon className="h-[18px] w-[18px]" style={{ color: categoryInk(r.categoryColor ?? '#94a3b8') }} />
                </span>
                {/* Niente foglio azioni: qui c'è solo Modifica, e il tocco
                    sulla riga apre già il form direttamente. */}
                <button type="button" onClick={() => openEdit(r)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14.5px] font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    ogni {r.intervalValue} {r.intervalUnit.toLowerCase()} · {r.nextDueDate}
                    {r.categoryName && ` · ${r.categoryName}`}
                    {r.amount != null && ` · ${currency.format(r.amount)}`}
                  </p>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.active}
                  aria-label={r.active ? 'Disattiva' : 'Riattiva'}
                  onClick={() => handleToggleActive(r)}
                  className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${
                    r.active ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${
                      r.active ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-brand-300 dark:border-slate-800 dark:bg-black">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((r) => {
              const Icon = getCategoryIcon(r.categoryIcon)
              return (
                <li key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    {/* Interruttore sempre in vista invece del link
                        "Disattiva"/"Riattiva": stessa scelta già fatta per le
                        Regole ricorrenti, qui resta solo Modifica accanto. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.active}
                      aria-label={r.active ? 'Disattiva' : 'Riattiva'}
                      onClick={() => handleToggleActive(r)}
                      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                        r.active ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          r.active ? 'left-[14px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: r.categoryColor ?? '#94a3b8' }}
                    >
                      <Icon className="h-4 w-4" style={{ color: categoryInk(r.categoryColor ?? '#94a3b8') }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        ogni {r.intervalValue} {r.intervalUnit.toLowerCase()} · prossima: {r.nextDueDate}
                        {r.categoryName && ` · ${r.categoryName}`}
                        {r.amount != null && ` · ${currency.format(r.amount)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      title="Modifica"
                      aria-label="Modifica"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/30 dark:hover:bg-brand-900/40"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isMobile && (
        <button
          type="button"
          onClick={openCreate}
          aria-label="Nuovo promemoria"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-900"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica promemoria' : 'Nuovo promemoria'} onClose={closeModal}>
          <ExpenseReminderForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
