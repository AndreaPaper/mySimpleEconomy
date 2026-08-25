import { useEffect, useState, type FormEvent } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { savingsApi, type SavingsGoalPayload } from '../api/endpoints'
import type { SavingsGoal, SavingsMovement } from '../api/types'
import Modal from '../components/Modal'
import { ListPageSkeleton } from '../components/Skeleton'
import { CATEGORY_COLORS } from '../constants/colors'
import { CATEGORY_ICONS, getCategoryIcon } from '../constants/icons'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const fullDateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

function fullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return fullDateFormatter.format(new Date(year, month - 1, day))
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return monthLabelFormatter.format(new Date(year, month - 1, 1))
}

// Ultimi 12 mesi di saldo cumulativo a fine mese (non giornaliero, che
// sarebbe solo rumore visivo). Il saldo parte dal totale accantonato prima
// della finestra, così la curva non riparte da zero ogni anno.
function buildBalanceSeries(movements: SavingsMovement[]): { label: string; balance: number }[] {
  const today = new Date()
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const firstMonth = months[0]
  const deltaByMonth = new Map<string, number>()
  let openingBalance = 0
  for (const m of movements) {
    const key = m.occurredOn.slice(0, 7)
    if (key < firstMonth) openingBalance += m.amount
    else deltaByMonth.set(key, (deltaByMonth.get(key) ?? 0) + m.amount)
  }

  let running = openingBalance
  return months.map((key) => {
    running += deltaByMonth.get(key) ?? 0
    return { label: monthLabel(key), balance: Math.round(running * 100) / 100 }
  })
}

const EMPTY_GOAL: SavingsGoalPayload = { name: '', targetAmount: null, deadline: null, icon: null, color: null }

export default function SavingsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [movements, setMovements] = useState<SavingsMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [goalFilter, setGoalFilter] = useState<string | null>(null)
  const [showAllMovements, setShowAllMovements] = useState(false)

  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [goalForm, setGoalForm] = useState<SavingsGoalPayload>(EMPTY_GOAL)
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)

  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [movementGoalId, setMovementGoalId] = useState('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDirection, setMovementDirection] = useState<'deposit' | 'withdrawal'>('deposit')
  const [movementDate, setMovementDate] = useState(today)
  const [movementNote, setMovementNote] = useState('')
  const [movementSaving, setMovementSaving] = useState(false)
  const [movementError, setMovementError] = useState<string | null>(null)

  const reload = () =>
    Promise.all([savingsApi.listGoals(), savingsApi.listMovements()]).then(([g, m]) => {
      setGoals(g)
      setMovements(m)
    })

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const visibleMovements = goalFilter ? movements.filter((m) => m.goalId === goalFilter) : movements
  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0)
  const filteredTotal = goalFilter
    ? goals.find((g) => g.id === goalFilter)?.currentAmount ?? 0
    : totalSaved

  const currentMonthKey = today.slice(0, 7)
  const savedThisMonth = visibleMovements
    .filter((m) => m.occurredOn.slice(0, 7) === currentMonthKey)
    .reduce((sum, m) => sum + m.amount, 0)

  // Media mensile calcolata sui mesi in cui c'è stato almeno un movimento:
  // dividere per 12 fissi darebbe una media falsata a chi ha iniziato da poco.
  const monthsWithMovements = new Set(visibleMovements.map((m) => m.occurredOn.slice(0, 7))).size
  const monthlyAverage = monthsWithMovements > 0 ? filteredTotal / monthsWithMovements : 0

  const series = buildBalanceSeries(visibleMovements)

  const openCreateGoal = () => {
    setEditingGoal(null)
    setGoalForm(EMPTY_GOAL)
    setGoalError(null)
    setGoalModalOpen(true)
  }

  const openEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal)
    setGoalForm({
      name: goal.name,
      targetAmount: goal.targetAmount,
      deadline: goal.deadline,
      icon: goal.icon,
      color: goal.color,
    })
    setGoalError(null)
    setGoalModalOpen(true)
  }

  const handleGoalSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGoalError(null)
    setGoalSaving(true)
    try {
      if (editingGoal) await savingsApi.updateGoal(editingGoal.id, goalForm)
      else await savingsApi.createGoal(goalForm)
      await reload()
      setGoalModalOpen(false)
    } catch {
      setGoalError('Salvataggio non riuscito. Controlla che il nome non sia già in uso.')
    } finally {
      setGoalSaving(false)
    }
  }

  const handleDeleteGoal = async (goal: SavingsGoal) => {
    if (
      !window.confirm(
        `Eliminare "${goal.name}"? Verranno eliminati anche tutti i suoi movimenti: l'operazione non si può annullare.`,
      )
    ) {
      return
    }
    await savingsApi.deleteGoal(goal.id)
    if (goalFilter === goal.id) setGoalFilter(null)
    await reload()
  }

  const openMovement = (direction: 'deposit' | 'withdrawal') => {
    setMovementDirection(direction)
    setMovementGoalId(goalFilter ?? goals[0]?.id ?? '')
    setMovementAmount('')
    setMovementDate(today)
    setMovementNote('')
    setMovementError(null)
    setMovementModalOpen(true)
  }

  const handleMovementSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMovementError(null)
    setMovementSaving(true)
    try {
      const magnitude = Math.abs(Number(movementAmount))
      await savingsApi.createMovement({
        goalId: movementGoalId,
        amount: movementDirection === 'withdrawal' ? -magnitude : magnitude,
        occurredOn: movementDate,
        note: movementNote.trim() || null,
      })
      await reload()
      setMovementModalOpen(false)
    } catch {
      setMovementError('Salvataggio non riuscito. Controlla i valori inseriti.')
    } finally {
      setMovementSaving(false)
    }
  }

  const handleDeleteMovement = async (movement: SavingsMovement) => {
    if (!window.confirm('Eliminare questo movimento?')) return
    await savingsApi.deleteMovement(movement.id)
    await reload()
  }

  if (loading) return <ListPageSkeleton />

  const shownMovements = showAllMovements ? visibleMovements : visibleMovements.slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Risparmio</h1>
          {goals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setGoalFilter(null)}
                className={`rounded-full px-3 py-1 text-xs ${
                  goalFilter === null
                    ? 'bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900'
                    : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                Tutti
              </button>
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoalFilter(g.id)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    goalFilter === g.id
                      ? 'bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900'
                      : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {goals.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => openMovement('deposit')}
                className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
              >
                Accantona
              </button>
              <button
                type="button"
                onClick={() => openMovement('withdrawal')}
                className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 hover:dark:bg-zinc-900"
              >
                Preleva
              </button>
            </>
          )}
          <button
            type="button"
            onClick={openCreateGoal}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 hover:dark:bg-zinc-900"
          >
            Nuovo obiettivo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">Totale risparmiato</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{currency.format(filteredTotal)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">Media mensile</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{currency.format(monthlyAverage)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">Accantonato questo mese</p>
          <p className={`text-2xl font-semibold ${savedThisMonth < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {currency.format(savedThisMonth)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          Andamento risparmio · saldo a fine mese, ultimi 12 mesi
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="savingsArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2FA36B" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#2FA36B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={70} />
            <Tooltip formatter={(value) => currency.format(Number(value))} />
            <Area
              type="monotone"
              dataKey="balance"
              name="Saldo"
              stroke="#2FA36B"
              strokeWidth={2.5}
              fill="url(#savingsArea)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
        <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">Obiettivi</p>
        {goals.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nessun obiettivo ancora. Creane uno per iniziare ad accantonare.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {goals.map((g) => {
              const Icon = getCategoryIcon(g.icon)
              const progress = g.targetAmount ? Math.min(g.currentAmount / g.targetAmount, 1) : null
              return (
                <li key={g.id} className="flex items-center gap-3 text-sm">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: g.color ?? '#94a3b8' }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{g.name}</span>
                    {progress !== null && (
                      <span className="mt-1 block h-1.5 w-full max-w-[220px] rounded-full bg-slate-200 dark:bg-zinc-800">
                        <span
                          className="block h-1.5 rounded-full"
                          style={{ width: `${progress * 100}%`, backgroundColor: g.color ?? '#2FA36B' }}
                        />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-slate-600 dark:text-slate-300">
                    {currency.format(g.currentAmount)}
                    {g.targetAmount != null && (
                      <span className="text-slate-400 dark:text-slate-500"> / {currency.format(g.targetAmount)}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => openEditGoal(g)} className="text-brand-700 hover:underline">
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGoal(g)}
                      className="text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Elimina
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Movimenti recenti</p>
          {visibleMovements.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllMovements((v) => !v)}
              className="text-sm text-brand-700 hover:underline"
            >
              {showAllMovements ? 'Mostra meno' : 'Vedi tutti'}
            </button>
          )}
        </div>
        {visibleMovements.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nessun movimento ancora.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {shownMovements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {m.amount >= 0 ? 'Accantonamento' : 'Prelievo'} · {m.goalName}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {fullDate(m.occurredOn)}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`font-semibold ${m.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.amount >= 0 ? '+' : ''}
                    {currency.format(m.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteMovement(m)}
                    className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                  >
                    Elimina
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {goalModalOpen && (
        <Modal title={editingGoal ? 'Modifica obiettivo' : 'Nuovo obiettivo'} onClose={() => setGoalModalOpen(false)}>
          <form onSubmit={handleGoalSubmit} className="space-y-4">
            {goalError && <p className="text-sm text-red-600">{goalError}</p>}
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="goal-name">
                Nome
              </label>
              <input
                id="goal-name"
                required
                value={goalForm.name}
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                placeholder="Es. Vacanza Giappone"
                className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Obiettivo (opzionale)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={goalForm.targetAmount ?? ''}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, targetAmount: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="Es. 2500.00"
                  className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
                />
              </label>
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Entro il (opzionale)</span>
                <input
                  type="date"
                  value={goalForm.deadline ?? ''}
                  onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value || null })}
                  className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
                />
              </label>
            </div>
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              Lascia vuoto l'obiettivo per un salvadanaio generico, senza traguardo da raggiungere.
            </span>
            <div>
              <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Colore</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setGoalForm({ ...goalForm, color: c })}
                    className={`h-7 w-7 rounded-full border-2 ${
                      goalForm.color === c ? 'border-slate-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Icona</span>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                {CATEGORY_ICONS.map(({ name: iconName, Icon }) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setGoalForm({ ...goalForm, icon: iconName })}
                    className={`flex h-8 w-8 items-center justify-center rounded border ${
                      goalForm.icon === iconName
                        ? 'border-slate-900 bg-slate-100 dark:bg-zinc-800'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                    aria-label={iconName}
                  >
                    <Icon className="h-4 w-4" style={{ color: goalForm.color ?? undefined }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={goalSaving}
                className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
              >
                {goalSaving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {movementModalOpen && (
        <Modal
          title={movementDirection === 'deposit' ? 'Nuovo accantonamento' : 'Nuovo prelievo'}
          onClose={() => setMovementModalOpen(false)}
        >
          <form onSubmit={handleMovementSubmit} className="space-y-4">
            {movementError && <p className="text-sm text-red-600">{movementError}</p>}
            {movementDirection === 'withdrawal' && (
              <p className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Stai togliendo denaro da un obiettivo: il movimento resta nello storico, così il quadro non risulta
                falsato.
              </p>
            )}
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="mov-goal">
                Obiettivo
              </label>
              <select
                id="mov-goal"
                value={movementGoalId}
                onChange={(e) => setMovementGoalId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Importo</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="Es. 150.00"
                  className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
                />
              </label>
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Data</span>
                <input
                  type="date"
                  required
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
                />
              </label>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="mov-note">
                Nota (opzionale)
              </label>
              <input
                id="mov-note"
                value={movementNote}
                onChange={(e) => setMovementNote(e.target.value)}
                maxLength={255}
                className="w-full rounded border border-slate-300 bg-brand-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={movementSaving || !movementGoalId}
                className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
              >
                {movementSaving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
