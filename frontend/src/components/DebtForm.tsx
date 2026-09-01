import { useState, type FormEvent } from 'react'
import type { Category, Debt } from '../api/types'
import CategoryCombobox from './CategoryCombobox'

interface DebtFormProps {
  categories: Category[]
  initial?: Debt
  onSubmit: (data: {
    categoryId: string
    name: string
    totalAmount: number
    alreadyPaidAmount: number | null
    alreadyPaidAsOf: string | null
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
  const [alreadyPaidAsOf, setAlreadyPaidAsOf] = useState(initial?.alreadyPaidAsOf ?? '')
  const [monthlyPaymentAmount, setMonthlyPaymentAmount] = useState(initial?.monthlyPaymentAmount?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAlreadyPaidAmountChange = (value: string) => {
    setAlreadyPaidAmount(value)
    // La prima volta che si valorizza l'importo, propone oggi come data di
    // riferimento (modificabile): così le spese storiche già presenti nella
    // categoria non vengono ricontate sopra al totale inserito a mano.
    if (value && !alreadyPaidAsOf) {
      setAlreadyPaidAsOf(new Date().toISOString().slice(0, 10))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (alreadyPaidAmount && !alreadyPaidAsOf) {
      setError('Indica da quale data in poi le spese vanno conteggiate separatamente dal già pagato.')
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        categoryId,
        name,
        totalAmount: Number(totalAmount),
        alreadyPaidAmount: alreadyPaidAmount ? Number(alreadyPaidAmount) : null,
        alreadyPaidAsOf: alreadyPaidAmount ? alreadyPaidAsOf : null,
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-category">
          Categoria
        </label>
        <CategoryCombobox
          id="debt-category"
          categories={expenseCategories}
          value={categoryId}
          onChange={setCategoryId}
        />
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
          onChange={(e) => handleAlreadyPaidAmountChange(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Utile solo per un debito che stai già pagando da tempo: lascia vuoto per un debito nuovo.
        </span>
      </div>
      {alreadyPaidAmount && (
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="debt-already-paid-as-of">
            Già pagato fino al
          </label>
          <input
            id="debt-already-paid-as-of"
            type="date"
            required
            value={alreadyPaidAsOf}
            onChange={(e) => setAlreadyPaidAsOf(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
          <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
            Le spese di questa categoria da questa data in poi si sommano al già pagato; quelle precedenti si considerano già incluse.
          </span>
        </div>
      )}
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
