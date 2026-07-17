import { useState, type FormEvent } from 'react'
import type { Category, Transaction, TransactionType } from '../api/types'

interface TransactionFormProps {
  categories: Category[]
  initial?: Transaction
  onSubmit: (data: {
    categoryId: string
    amount: number
    type: string
    occurredOn: string
    description: string | null
  }) => Promise<void>
  onCancel: () => void
}

export default function TransactionForm({ categories, initial, onSubmit, onCancel }: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'EXPENSE')
  const categoriesForType = categories.filter((c) => c.type === type)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categoriesForType[0]?.id ?? '')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    setCategoryId(categories.find((c) => c.type === newType)?.id ?? '')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!categoryId) {
      setError('Seleziona una categoria')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        categoryId,
        amount: Number(amount),
        type,
        occurredOn,
        description: description.trim() || null,
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Tipo</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('EXPENSE')}
            className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
              type === 'EXPENSE'
                ? 'border-green-600 bg-green-600 text-white'
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
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Entrata
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="category">
          Categoria
        </label>
        {categoriesForType.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nessuna categoria {type === 'INCOME' ? 'di entrata' : 'di uscita'}. Creane una prima.
          </p>
        ) : (
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="amount">
          Importo
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="occurredOn">
          Data
        </label>
        <input
          id="occurredOn"
          type="date"
          required
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="description">
          Descrizione (opzionale)
        </label>
        <input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving || categoriesForType.length === 0}
          className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
