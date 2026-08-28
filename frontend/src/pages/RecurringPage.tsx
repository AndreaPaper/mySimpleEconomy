import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, CalendarCog, type LucideIcon } from 'lucide-react'
import { categoriesApi, recurringApi } from '../api/endpoints'
import type { Category, IntervalUnit, RecurringTransaction } from '../api/types'
import BottomSheet from '../components/BottomSheet'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RecurringTransactionForm from '../components/RecurringTransactionForm'
import OverridesPanel from '../components/OverridesPanel'
import { ListPageSkeleton } from '../components/Skeleton'
import { getCategoryIcon } from '../constants/icons'
import { useIsMobile } from '../hooks/useIsMobile'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

// Le tre icone Eccezioni/Modifica/Elimina della riga desktop: prima erano
// parole affiancate all'importo, adesso tondi che compaiono al passaggio del
// mouse, come nel mockup.
function RowIconButton({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: LucideIcon
  label: string
  tone: 'brand' | 'neutral' | 'danger'
  onClick: () => void
}) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand-700 hover:bg-brand-200/30 dark:hover:bg-brand-900/40'
      : tone === 'danger'
        ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toneClass}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export default function RecurringPage() {
  const isMobile = useIsMobile()
  const [items, setItems] = useState<RecurringTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Su mobile "Eccezioni" non si espande sotto la riga: apre una modale a
  // parte, perché il foglio azioni è già chiuso quando la si sceglie.
  const [overridesFor, setOverridesFor] = useState<RecurringTransaction | null>(null)
  const [actionSheetItem, setActionSheetItem] = useState<RecurringTransaction | null>(null)

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

  // Stessa resa della riga desktop: "ogni 2 month", non tradotta — non è
  // qualcosa che introduco qui, la card larga fa lo stesso.
  const cadenceLabel = (r: RecurringTransaction) => `ogni ${r.intervalValue} ${r.intervalUnit.toLowerCase()}`

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className={isMobile ? 'text-2xl font-bold' : 'text-lg font-semibold'}>
          {isMobile ? 'Ricorrenti' : 'Transazioni ricorrenti'}
        </h1>
        {/* Su mobile "Nuova regola" diventa il tondo flottante sopra la
            lista, come già per le Transazioni: qui l'intestazione resta con
            il solo titolo. */}
        {!isMobile && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-900"
          >
            <Plus className="h-4 w-4" />
            Nuova regola
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessuna regola ricorrente ancora.</p>
      ) : isMobile ? (
        <div className="flex flex-col gap-2.5">
          {items.map((r) => {
            const Icon = getCategoryIcon(r.categoryIcon)
            return (
              <div
                key={r.id}
                // L'opacità segna le disattivate senza una scritta a parte:
                // restano leggibili ma si distinguono a colpo d'occhio dalle
                // attive, proprio come nel mockup.
                style={{ opacity: r.active ? 1 : 0.5 }}
                className="rounded-2xl border border-slate-200 bg-brand-300 p-3.5 dark:border-slate-800 dark:bg-black"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: r.categoryColor }}
                  >
                    <Icon className="h-[18px] w-[18px] text-white" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setActionSheetItem(r)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[14.5px] font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {cadenceLabel(r)} · prossima {r.nextDueDate}
                    </p>
                  </button>
                  {/* Interruttore invece del pulsante "Disattiva"/"Riattiva":
                      è l'unica azione abbastanza frequente da meritare un
                      gesto diretto sulla riga, le altre tre stanno nel foglio. */}
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
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <span
                    className={`text-sm font-bold ${r.categoryType === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {currency.format(r.defaultAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActionSheetItem(r)}
                    className="-m-1 p-1 text-xs text-slate-500 dark:text-slate-400"
                  >
                    Dettagli ⋯
                  </button>
                </div>
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
                    {/* L'interruttore resta sempre in vista invece che dietro
                        la parola "Disattiva"/"Riattiva": è l'unica delle
                        quattro azioni abbastanza frequente da meritare un
                        gesto diretto sulla riga. */}
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
                      style={{ backgroundColor: r.categoryColor }}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {r.categoryName} · {cadenceLabel(r)} · prossima: {r.nextDueDate}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${r.categoryType === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      {currency.format(r.defaultAmount)}
                    </span>
                    <div className="flex shrink-0 gap-0.5">
                      <RowIconButton
                        icon={CalendarCog}
                        label="Eccezioni"
                        tone="neutral"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      />
                      <RowIconButton icon={Pencil} label="Modifica" tone="brand" onClick={() => openEdit(r)} />
                      <RowIconButton icon={Trash2} label="Elimina" tone="danger" onClick={() => askDelete(r)} />
                    </div>
                  </div>
                  {expandedId === r.id && (
                    <div className="px-5 pb-4">
                      <OverridesPanel recurringTransactionId={r.id} />
                    </div>
                  )}
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
          aria-label="Nuova regola"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-900"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {isMobile && actionSheetItem && (
        <BottomSheet
          title={actionSheetItem.name}
          onClose={() => setActionSheetItem(null)}
        >
          <div className="space-y-1 pb-1">
            <button
              type="button"
              onClick={() => {
                const item = actionSheetItem
                setActionSheetItem(null)
                setOverridesFor(item)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px]"
            >
              <CalendarCog className="h-[18px] w-[18px] text-brand-700" />
              Eccezioni
            </button>
            <button
              type="button"
              onClick={() => {
                const item = actionSheetItem
                setActionSheetItem(null)
                openEdit(item)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px]"
            >
              <Pencil className="h-[18px] w-[18px] text-brand-700" />
              Modifica
            </button>
            <button
              type="button"
              onClick={() => {
                const item = actionSheetItem
                setActionSheetItem(null)
                askDelete(item)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px] text-red-600"
            >
              <Trash2 className="h-[18px] w-[18px]" />
              Elimina
            </button>
          </div>
        </BottomSheet>
      )}

      {overridesFor && (
        <Modal title={`Eccezioni · ${overridesFor.name}`} onClose={() => setOverridesFor(null)}>
          <OverridesPanel recurringTransactionId={overridesFor.id} />
        </Modal>
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
