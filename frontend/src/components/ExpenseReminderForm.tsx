import { useState, type FormEvent } from 'react'
import type { Category, ExpenseReminder, IntervalUnit } from '../api/types'
import { categoryOptionLabel, flattenCategoryTree } from '../utils/categoryTree'

interface ExpenseReminderFormProps {
  categories: Category[]
  initial?: ExpenseReminder
  onSubmit: (data: {
    categoryId: string
    name: string
    amount: number | null
    intervalUnit: IntervalUnit
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate: string | null
    notifyDaysBefore: number | null
  }) => Promise<void>
  onCancel: () => void
}

const INTERVAL_LABELS: Record<IntervalUnit, string> = {
  DAY: 'giorno/i',
  WEEK: 'settimana/e',
  MONTH: 'mese/i',
  YEAR: 'anno/i',
}

export default function ExpenseReminderForm({ categories, initial, onSubmit, onCancel }: ExpenseReminderFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? expenseCategories[0]?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.intervalUnit ?? 'MONTH')
  const [intervalValue, setIntervalValue] = useState(initial?.intervalValue?.toString() ?? '1')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(initial?.notifyDaysBefore?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        categoryId,
        name,
        amount: amount === '' ? null : Number(amount),
        intervalUnit,
        intervalValue: Number(intervalValue),
        startDate,
        nextDueDate,
        endDate: endDate || null,
        notifyDaysBefore: notifyDaysBefore === '' ? null : Number(notifyDaysBefore),
      })
    } catch {
      setError('Salvataggio non riuscito')
    } finally {
      setSaving(false)
    }
  }

  if (expenseCategories.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Crea prima almeno una categoria di uscita.</p>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
            Chiudi
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-category">
          Categoria
        </label>
        <select
          id="er-category"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          {flattenCategoryTree(expenseCategories).map((entry) => (
            <option key={entry.category.id} value={entry.category.id}>
              {categoryOptionLabel(entry)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-name">
          Nome
        </label>
        <input
          id="er-name"
          required
          placeholder="es. Assicurazione scooter, IMU, Bollo auto..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-amount">
          Prezzo stimato (opzionale)
        </label>
        <input
          id="er-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="es. 120.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Se vuoto, a inizio mese verrà usato l'importo dell'ultima spesa registrata in questa categoria (se esiste).
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-interval-value">
            Ogni
          </label>
          <input
            id="er-interval-value"
            type="number"
            min="1"
            required
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-interval-unit">
            Unità
          </label>
          <select
            id="er-interval-unit"
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          >
            {(Object.keys(INTERVAL_LABELS) as IntervalUnit[]).map((unit) => (
              <option key={unit} value={unit}>
                {INTERVAL_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-start">
          Data di inizio
        </label>
        <input
          id="er-start"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-next">
          Prossima scadenza
        </label>
        <input
          id="er-next"
          type="date"
          required
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-end">
          Data di fine (opzionale)
        </label>
        <input
          id="er-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="er-notify">
          Avvisami quanti giorni prima (opzionale)
        </label>
        <input
          id="er-notify"
          type="number"
          min="0"
          placeholder="es. 3"
          value={notifyDaysBefore}
          onChange={(e) => setNotifyDaysBefore(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Se vuoto, non riceverai email per questo promemoria.
        </span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
