import { useState, type FormEvent } from 'react'
import { CATEGORY_COLORS, categoryInk } from '../constants/colors'
import { CATEGORY_ICONS } from '../constants/icons'
import type { Category, Transaction, TransactionType } from '../api/types'
import CategoryCombobox from './CategoryCombobox'

const NEW_CATEGORY_VALUE = '__new__'

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
  onCreateCategory: (data: { name: string; type: TransactionType; color: string | null; icon: string | null }) => Promise<Category>
  onCancel: () => void
}

export default function TransactionForm({ categories, initial, onSubmit, onCreateCategory, onCancel }: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'EXPENSE')
  const categoriesForType = categories.filter((c) => c.type === type)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categoriesForType[0]?.id ?? '')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState<string | null>(CATEGORY_COLORS[0])
  const [newCategoryIcon, setNewCategoryIcon] = useState<string | null>(null)
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null)
  const [creatingCategorySaving, setCreatingCategorySaving] = useState(false)

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType)
    setCategoryId(categories.find((c) => c.type === newType)?.id ?? '')
    setCreatingCategory(false)
  }

  const handleCategorySelectChange = (value: string) => {
    if (value === NEW_CATEGORY_VALUE) {
      setNewCategoryName('')
      setNewCategoryColor(CATEGORY_COLORS[0])
      setNewCategoryIcon(null)
      setNewCategoryError(null)
      setCreatingCategory(true)
      return
    }
    setCategoryId(value)
  }

  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault()
    setNewCategoryError(null)
    setCreatingCategorySaving(true)
    try {
      const category = await onCreateCategory({ name: newCategoryName, type, color: newCategoryColor, icon: newCategoryIcon })
      setCategoryId(category.id)
      setCreatingCategory(false)
    } catch {
      setNewCategoryError('Creazione non riuscita. Controlla che il nome non sia già in uso.')
    } finally {
      setCreatingCategorySaving(false)
    }
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
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="category">
          Categoria
        </label>
        {creatingCategory ? (
          <div className="space-y-3 rounded border border-slate-300 dark:border-slate-700 p-3">
            {newCategoryError && <p className="text-sm text-red-600">{newCategoryError}</p>}
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400" htmlFor="newCategoryName">
                Nome nuova categoria
              </label>
              <input
                id="newCategoryName"
                required
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Colore</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCategoryColor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${newCategoryColor === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Icona (opzionale)</span>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {CATEGORY_ICONS.map(({ name: iconName, Icon }) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setNewCategoryIcon(iconName)}
                    className={`flex h-7 w-7 items-center justify-center rounded border ${
                      newCategoryIcon === iconName ? 'border-slate-900 bg-slate-100 dark:border-white dark:bg-zinc-800' : 'border-slate-300 dark:border-slate-700'
                    }`}
                    aria-label={iconName}
                  >
                    <Icon className="h-4 w-4" style={{ color: categoryInk(newCategoryColor) }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatingCategory(false)}
                className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={creatingCategorySaving || !newCategoryName.trim()}
                className="rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
              >
                {creatingCategorySaving ? 'Creazione...' : 'Crea categoria'}
              </button>
            </div>
          </div>
        ) : categoriesForType.length === 0 ? (
          <div className="flex items-center justify-between gap-2 rounded border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nessuna categoria {type === 'INCOME' ? 'di entrata' : 'di uscita'}.
            </p>
            <button
              type="button"
              onClick={() => handleCategorySelectChange(NEW_CATEGORY_VALUE)}
              className="shrink-0 text-sm font-medium text-brand-700 hover:underline"
            >
              + Nuova categoria
            </button>
          </div>
        ) : (
          <CategoryCombobox
            id="category"
            categories={categoriesForType}
            value={categoryId}
            onChange={setCategoryId}
            onCreateNew={() => handleCategorySelectChange(NEW_CATEGORY_VALUE)}
          />
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving || creatingCategory || !categoryId}
          className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
