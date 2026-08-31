import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react'
import { categoriesApi, debtsApi } from '../api/endpoints'
import type { Category, Debt } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import DebtForm from '../components/DebtForm'
import { getCategoryIcon } from '../constants/icons'
import { ListPageSkeleton } from '../components/Skeleton'
import { useIsMobile } from '../hooks/useIsMobile'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const payoffDateFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

// L'anello da 72px di 5A: percentuale pagata, colorato di blu finché il
// debito è aperto e di verde una volta saldato.
const RING_SIZE = 72
const RING_RADIUS = 30
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function DebtRing({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke={trackColor} strokeWidth="7" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-slate-900 dark:text-white">
        {Math.round(pct * 100)}%
      </div>
    </div>
  )
}

// Le due icone Modifica/Elimina della card desktop, impilate a destra come
// in 5A invece che in riga.
function DebtIconButton({ icon: Icon, label, tone, onClick }: { icon: LucideIcon; label: string; tone: 'brand' | 'danger'; onClick: () => void }) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand-700 hover:bg-black/5 dark:hover:bg-white/10'
      : 'text-red-600 hover:bg-red-500/10'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full ${toneClass}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

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
  const isMobile = useIsMobile()
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

  const [pendingDelete, setPendingDelete] = useState<Debt | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const askDelete = (debt: Debt) => {
    setDeleteError(null)
    setPendingDelete(debt)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await debtsApi.delete(pendingDelete.id)
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
        <h1 className="text-lg font-semibold">Debiti e finanziamenti</h1>
        <button
          type="button"
          onClick={openCreate}
          className={
            isMobile
              ? 'rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900'
              : 'flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-900'
          }
        >
          {!isMobile && <Plus className="h-4 w-4" />}
          Nuovo debito
        </button>
      </div>

      {debts.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessun debito registrato ancora.</p>
      ) : isMobile ? (
        <ul className="space-y-4">
          {debts.map((d) => {
            const Icon = getCategoryIcon(d.categoryIcon)
            const pct = d.totalAmount > 0 ? Math.min(100, (d.paidAmount / d.totalAmount) * 100) : 0
            const saldato = d.remainingAmount <= 0
            return (
              <li key={d.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
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
                    <button type="button" onClick={() => openEdit(d)} className="text-brand-700 hover:underline">
                      Modifica
                    </button>
                    <button type="button" onClick={() => askDelete(d)} className="text-slate-500 dark:text-slate-400 hover:underline">
                      Elimina
                    </button>
                  </div>
                </div>

                <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800">
                  <div
                    className="h-2 rounded-full bg-brand-700"
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
      ) : (
        // Niente più card contenitore: titolo e righe stanno direttamente sullo
        // sfondo pagina, come nelle altre sezioni. Ogni riga resta una card a
        // sé — ma bianca/neutra come le altre liste dell'app, non colorata per
        // stato: il colore dell'anello basta a dirlo, senza tingere anche lo sfondo.
        <div className="flex flex-col gap-3">
          {debts.map((d) => {
            const pct = d.totalAmount > 0 ? Math.min(1, d.paidAmount / d.totalAmount) : 0
            const saldato = d.remainingAmount <= 0
            return (
              <div
                key={d.id}
                className="flex items-center gap-4 rounded-2xl bg-brand-300 p-4 shadow-sm dark:bg-black"
              >
                <DebtRing
                  pct={pct}
                  color={saldato ? '#1F8A46' : '#30AFFF'}
                  trackColor={saldato ? '#D3EEDC' : '#E3EDF5'}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{d.name}</p>
                  {saldato ? (
                    <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400">Saldato ✓</p>
                  ) : (
                    <p className="mt-1 text-xl font-bold text-red-600">{currency.format(d.remainingAmount)}</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {saldato
                      ? `${currency.format(d.paidAmount)} pagati su ${currency.format(d.totalAmount)}`
                      : `residuo su ${currency.format(d.totalAmount)} · ${currency.format(d.paidAmount)} già pagati`}
                  </p>
                  {!saldato && (
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {d.monthlyPaymentAmount
                        ? `Con una rata di ${currency.format(d.monthlyPaymentAmount)}/mese, saldo previsto per ${projectPayoff(d.remainingAmount, d.monthlyPaymentAmount)}.`
                        : 'Imposta una rata mensile per stimare quando finirai di pagare.'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <DebtIconButton icon={Pencil} label="Modifica" tone="brand" onClick={() => openEdit(d)} />
                  <DebtIconButton icon={Trash2} label="Elimina" tone="danger" onClick={() => askDelete(d)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica debito' : 'Nuovo debito'} onClose={closeModal}>
          <DebtForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Elimina debito"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        >
          <p>
            Il debito verrà eliminato definitivamente. Le transazioni della categoria collegata non vengono toccate.
          </p>
          {/* Quanto è già stato pagato e quanto resta: sono i numeri che fanno
              capire se si sta buttando via il tracciamento di un debito quasi
              saldato o di uno appena aperto. */}
          <p className="mt-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
            <span className="font-medium text-slate-900 dark:text-white">{pendingDelete.name}</span>
            <br />
            {pendingDelete.categoryName} · {currency.format(pendingDelete.paidAmount)} pagati su{' '}
            {currency.format(pendingDelete.totalAmount)} · restano {currency.format(pendingDelete.remainingAmount)}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
