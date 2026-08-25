import { useEffect, useState, type FormEvent } from 'react'
import { recurringApi } from '../api/endpoints'
import type { RecurringOverride } from '../api/types'
import ConfirmDialog from './ConfirmDialog'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

interface OverridesPanelProps {
  recurringTransactionId: string
}

export default function OverridesPanel({ recurringTransactionId }: OverridesPanelProps) {
  const [overrides, setOverrides] = useState<RecurringOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [occurrenceDate, setOccurrenceDate] = useState(new Date().toISOString().slice(0, 10))
  const [overrideAmount, setOverrideAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RecurringOverride | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const reload = () => recurringApi.listOverrides(recurringTransactionId).then(setOverrides)

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [recurringTransactionId])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await recurringApi.createOverride(recurringTransactionId, {
        occurrenceDate,
        overrideAmount: Number(overrideAmount),
        note: note.trim() || null,
      })
      setOverrideAmount('')
      setNote('')
      await reload()
    } catch {
      setError('Esiste già un\'eccezione per questa data, o i dati non sono validi')
    }
  }

  const askDelete = (override: RecurringOverride) => {
    setDeleteError(null)
    setPendingDelete(override)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await recurringApi.deleteOverride(recurringTransactionId, pendingDelete.id)
      setPendingDelete(null)
      await reload()
    } catch {
      setDeleteError('Eliminazione non riuscita. Riprova.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400 dark:text-slate-500">Caricamento eccezioni...</p>

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      {overrides.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna eccezione per questa regola.</p>
      ) : (
        <ul className="space-y-1">
          {overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between text-sm">
              <span>
                {o.occurrenceDate} {o.note && <span className="text-slate-400 dark:text-slate-500">· {o.note}</span>}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currency.format(o.overrideAmount)}</span>
                <button type="button" onClick={() => askDelete(o)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400" htmlFor={`occ-${recurringTransactionId}`}>
            Data
          </label>
          <input
            id={`occ-${recurringTransactionId}`}
            type="date"
            required
            value={occurrenceDate}
            onChange={(e) => setOccurrenceDate(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400" htmlFor={`amt-${recurringTransactionId}`}>
            Importo eccezione
          </label>
          <input
            id={`amt-${recurringTransactionId}`}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={overrideAmount}
            onChange={(e) => setOverrideAmount(e.target.value)}
            className="w-28 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400" htmlFor={`note-${recurringTransactionId}`}>
            Nota (opzionale)
          </label>
          <input
            id={`note-${recurringTransactionId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
          />
        </div>
        <button type="submit" className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900">
          Aggiungi
        </button>
      </form>

      {pendingDelete && (
        <ConfirmDialog
          title="Elimina eccezione"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        >
          <p>
            Per quella data la regola tornerà a usare il suo importo abituale.
          </p>
          <p className="mt-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
            <span className="font-medium text-slate-900 dark:text-white">{pendingDelete.occurrenceDate}</span>
            <br />
            {currency.format(pendingDelete.overrideAmount)}
            {pendingDelete.note ? ` · ${pendingDelete.note}` : ''}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
