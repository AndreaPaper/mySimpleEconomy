import { useEffect, useState } from 'react'
import { categoriesApi, debtsApi } from '../api/endpoints'
import type { Category, Debt } from '../api/types'
import Modal from '../components/Modal'
import DebtForm from '../components/DebtForm'
import { getCategoryIcon } from '../constants/icons'
import { ListPageSkeleton } from '../components/Skeleton'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const payoffDateFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

// Proiezione client-side, non serve al backend: mesi stimati per saldare il
// residuo alla rata mensile impostata, e la data (mese/anno) prevista.
function projectPayoff(remainingAmount: number, monthlyPaymentAmount: number): string {
  const monthsRemaining = Math.ceil(remainingAmount / monthlyPaymentAmount)
  const payoffDate = new Date()
  payoffDate.setDate(1)
  payoffDate.setMonth(payoffDate.getMonth() + monthsRemaining)
  return payoffDateFormatter.format(payoffDate)
}

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Debt | null>(null)

  const reload = () => debtsApi.list().then(setDebts)

  useEffect(() => {
    Promise.all([reload(), categoriesApi.list().then(setCategories)]).finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (debt: Debt) => {
    setEditing(debt)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: {
    categoryId: string
    name: string
    totalAmount: number
    alreadyPaidAmount: number | null
    monthlyPaymentAmount: number | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await debtsApi.update(editing.id, data)
    } else {
      await debtsApi.create(data)
    }
    await reload()
    closeModal()
  }

  const handleDelete = async (debt: Debt) => {
    if (!window.confirm(`Eliminare "${debt.name}"? Le transazioni della categoria collegata non vengono toccate.`)) return
    await debtsApi.delete(debt.id)
    await reload()
  }

  if (loading) return <ListPageSkeleton />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Debiti e finanziamenti</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Nuovo debito
        </button>
      </div>

      {debts.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessun debito registrato ancora.</p>
      ) : (
        <ul className="space-y-4">
          {debts.map((d) => {
            const Icon = getCategoryIcon(d.categoryIcon)
            const pct = d.totalAmount > 0 ? Math.min(100, (d.paidAmount / d.totalAmount) * 100) : 0
            const saldato = d.remainingAmount <= 0
            return (
              <li key={d.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: d.categoryColor ?? '#94a3b8' }}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{d.categoryName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button type="button" onClick={() => openEdit(d)} className="text-green-600 hover:underline">
                      Modifica
                    </button>
                    <button type="button" onClick={() => handleDelete(d)} className="text-slate-500 dark:text-slate-400 hover:underline">
                      Elimina
                    </button>
                  </div>
                </div>

                <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800">
                  <div
                    className="h-2 rounded-full bg-green-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    Pagato <span className="font-bold text-slate-900 dark:text-white">{currency.format(d.paidAmount)}</span> di {currency.format(d.totalAmount)}
                  </span>
                  {saldato ? (
                    <span className="font-medium text-emerald-600">Saldato ✓</span>
                  ) : (
                    <span className="font-bold text-red-600">Residuo {currency.format(d.remainingAmount)}</span>
                  )}
                </div>

                {!saldato && (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {d.monthlyPaymentAmount
                      ? `Con una rata di ${currency.format(d.monthlyPaymentAmount)}/mese, saldo previsto per ${projectPayoff(d.remainingAmount, d.monthlyPaymentAmount)}.`
                      : 'Imposta una rata mensile per stimare quando finirai di pagare.'}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica debito' : 'Nuovo debito'} onClose={closeModal}>
          <DebtForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
