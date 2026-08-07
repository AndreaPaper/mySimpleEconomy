import { useState, type FormEvent } from 'react'
import type { Category, IntervalUnit, RecurringTransaction, TransactionType } from '../api/types'

interface RecurringTransactionFormProps {
  categories: Category[]
  initial?: RecurringTransaction
  onSubmit: (data: {
    categoryId: string
    name: string
    defaultAmount: number
    intervalUnit: IntervalUnit
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate: string | null
  }) => Promise<void>
  onCancel: () => void
}

const INTERVAL_LABELS: Record<IntervalUnit, string> = {
  DAY: 'giorno/i',
  WEEK: 'settimana/e',
  MONTH: 'mese/i',
  YEAR: 'anno/i',
}

export default function RecurringTransactionForm({
  categories,
  initial,
  onSubmit,
  onCancel,
}: RecurringTransactionFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType] = useState<TransactionType>(initial?.categoryType ?? 'EXPENSE')
  const categoriesForType = categories.filter((c) => c.type === type)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categoriesForType[0]?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [defaultAmount, setDefaultAmount] = useState(initial?.defaultAmount?.toString() ?? '')
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.intervalUnit ?? 'MONTH')
  const [intervalValue, setIntervalValue] = useState(initial?.intervalValue?.toString() ?? '1')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    setCategoryId(categories.find((c) => c.type === newType)?.id ?? '')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        categoryId,
        name,
        defaultAmount: Number(defaultAmount),
        intervalUnit,
        intervalValue: Number(intervalValue),
        startDate,
        nextDueDate: initial ? nextDueDate : startDate,
        endDate: endDate || null,
      })
    } catch {
      setError('Salvataggio non riuscito')
    } finally {
      setSaving(false)
    }
  }

  if (categories.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Crea prima almeno una categoria.</p>
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-name">
          Nome
        </label>
        <input
          id="rt-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Tipo</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('EXPENSE')}
            className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
              type === 'EXPENSE'
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Uscita
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('INCOME')}
            className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
              type === 'INCOME'
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Entrata
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-category">
          Categoria
        </label>
        {categoriesForType.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nessuna categoria {type === 'INCOME' ? 'di entrata' : 'di uscita'}. Creane una prima.
          </p>
        ) : (
          <select
            id="rt-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          >
            {categoriesForType.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-amount">
          Importo
        </label>
        <input
          id="rt-amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={defaultAmount}
          onChange={(e) => setDefaultAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-interval-value">
            Ogni
          </label>
          <input
            id="rt-interval-value"
            type="number"
            min="1"
            required
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-interval-unit">
            Unità
          </label>
          <select
            id="rt-interval-unit"
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-start">
          Data di inizio
        </label>
        <input
          id="rt-start"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      {initial && (
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-next">
            Prossima scadenza
          </label>
          <input
            id="rt-next"
            type="date"
            required
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="rt-end">
          Data di fine (opzionale)
        </label>
        <input
          id="rt-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving || categoriesForType.length === 0}
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
