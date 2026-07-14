import { useState, type FormEvent } from 'react'
import type { ExpenseReminder, IntervalUnit } from '../api/types'

interface ExpenseReminderFormProps {
  initial?: ExpenseReminder
  onSubmit: (data: {
    name: string
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

export default function ExpenseReminderForm({ initial, onSubmit, onCancel }: ExpenseReminderFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState(initial?.name ?? '')
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.intervalUnit ?? 'MONTH')
  const [intervalValue, setIntervalValue] = useState(initial?.intervalValue?.toString() ?? '1')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate ?? today)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        name,
        intervalUnit,
        intervalValue: Number(intervalValue),
        startDate,
        nextDueDate,
        endDate: endDate || null,
      })
    } catch {
      setError('Salvataggio non riuscito')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm text-slate-600" htmlFor="er-name">
          Nome
        </label>
        <input
          id="er-name"
          required
          placeholder="es. Assicurazione scooter, IMU, Bollo auto..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600" htmlFor="er-interval-value">
            Ogni
          </label>
          <input
            id="er-interval-value"
            type="number"
            min="1"
            required
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-600" htmlFor="er-interval-unit">
            Unità
          </label>
          <select
            id="er-interval-unit"
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
        <label className="mb-1 block text-sm text-slate-600" htmlFor="er-start">
          Data di inizio
        </label>
        <input
          id="er-start"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600" htmlFor="er-next">
          Prossima scadenza
        </label>
        <input
          id="er-next"
          type="date"
          required
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600" htmlFor="er-end">
          Data di fine (opzionale)
        </label>
        <input
          id="er-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
