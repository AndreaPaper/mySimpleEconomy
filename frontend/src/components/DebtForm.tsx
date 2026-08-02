import { useState, type FormEvent } from 'react'
import type { Category, Debt } from '../api/types'

interface DebtFormProps {
  categories: Category[]
  initial?: Debt
  onSubmit: (data: {
    categoryId: string
    name: string
    totalAmount: number
    alreadyPaidAmount: number | null
    monthlyPaymentAmount: number | null
  }) => Promise<void>
  onCancel: () => void
}

export default function DebtForm({ categories, initial, onSubmit, onCancel }: DebtFormProps) {
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? expenseCategories[0]?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount?.toString() ?? '')
  const [alreadyPaidAmount, setAlreadyPaidAmount] = useState(initial?.alreadyPaidAmount?.toString() ?? '')
  const [monthlyPaymentAmount, setMonthlyPaymentAmount] = useState(initial?.monthlyPaymentAmount?.toString() ?? '')
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
        totalAmount: Number(totalAmount),
        alreadyPaidAmount: alreadyPaidAmount ? Number(alreadyPaidAmount) : null,
        monthlyPaymentAmount: monthlyPaymentAmount ? Number(monthlyPaymentAmount) : null,
      })
    } catch {
      setError('Salvataggio non riuscito. Controlla che la categoria non sia già collegata a un altro debito attivo.')
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-name">
          Nome
        </label>
        <input
          id="debt-name"
          required
          placeholder="Es. Debito Papà"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-category">
          Categoria
        </label>
        <select
          id="debt-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        >
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Ogni spesa registrata con questa categoria verrà conteggiata come pagamento di questo debito.
        </span>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-total">
          Importo totale
        </label>
        <input
          id="debt-total"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-already-paid">
          Già pagato prima di iniziare a tracciarlo qui (opzionale)
        </label>
        <input
          id="debt-already-paid"
          type="number"
          step="0.01"
          min="0"
          value={alreadyPaidAmount}
          onChange={(e) => setAlreadyPaidAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Utile solo per un debito che stai già pagando da tempo: lascia vuoto per un debito nuovo.
        </span>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-monthly">
          Rata mensile target (opzionale)
        </label>
        <input
          id="debt-monthly"
          type="number"
          step="0.01"
          min="0.01"
          value={monthlyPaymentAmount}
          onChange={(e) => setMonthlyPaymentAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Serve solo a stimare quando finirai di pagare, non genera transazioni automatiche.
        </span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
