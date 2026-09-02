import { useState, type FormEvent } from 'react'
import { CATEGORY_COLORS, categoryInk } from '../constants/colors'
import { CATEGORY_ICONS } from '../constants/icons'
import type { Category, CategoryType } from '../api/types'
import CategoryCombobox from './CategoryCombobox'

interface CategoryFormProps {
  initial?: Category
  // Serve solo a popolare il menu "Categoria padre": l'elenco completo di
  // quelle non archiviate, da cui si filtrano i padri ammessi.
  categories: Category[]
  onSubmit: (data: {
    name: string
    type: CategoryType
    color: string | null
    icon: string | null
    parentId: string | null
  }) => Promise<void>
  onCancel: () => void
}

export default function CategoryForm({ initial, categories, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<CategoryType>(initial?.type ?? 'EXPENSE')
  const [color, setColor] = useState<string | null>(initial?.color ?? CATEGORY_COLORS[0])
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null)
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Padri ammessi, con le stesse regole applicate dal backend: stesso tipo,
  // non già sottocategorie, e diversi dalla categoria in modifica. In più si
  // escludono quelle che hanno già figli, perché agganciarle creerebbe un
  // terzo livello (non supportato).
  const hasChildren = (categoryId: string) => categories.some((c) => c.parentId === categoryId)
  const parentOptions = categories
    .filter((c) => c.type === type && !c.parentId && c.id !== initial?.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ name, type, color, icon, parentId })
    } catch {
      setError('Salvataggio non riuscito. Controlla che il nome non sia già in uso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="name">
          Nome
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
        />
      </div>
      <div>
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Tipo</span>
        {initial ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {initial.type === 'INCOME' ? 'Entrata' : 'Uscita'} (non modificabile)
          </p>
        ) : (
          <div className="flex gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t)
                  // Il padre deve avere lo stesso tipo: cambiandolo, una
                  // scelta fatta prima non sarebbe più valida.
                  setParentId(null)
                }}
                className={`rounded border px-3 py-1.5 text-sm ${
                  type === t ? 'border-brand-700 bg-brand-100 text-brand-700' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t === 'EXPENSE' ? 'Uscita' : 'Entrata'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="parent">
          Categoria padre (opzionale)
        </label>
        {initial && hasChildren(initial.id) ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ha già delle sottocategorie, quindi non può diventare a sua volta una sottocategoria.
          </p>
        ) : (
          <>
            <CategoryCombobox
              id="parent"
              categories={parentOptions}
              value={parentId ?? ''}
              onChange={(v) => setParentId(v || null)}
              extraOptions={[{ value: '', label: '— Nessuna (categoria principale) —' }]}
            />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              Scegliendo un padre, questa diventa una sua sottocategoria (es. "Supermercato" sotto "Alimentari") e le
              sue spese confluiscono nel totale del padre in Dashboard.
            </span>
          </>
        )}
      </div>
      <div>
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Colore</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Icona (opzionale)</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIcon(null)}
            className={`flex h-8 w-8 items-center justify-center rounded border text-xs text-slate-400 dark:text-slate-500 ${
              icon === null ? 'border-slate-900' : 'border-slate-300 dark:border-slate-700'
            }`}
            aria-label="Nessuna icona"
          >
            —
          </button>
          {CATEGORY_ICONS.map(({ name: iconName, Icon }) => (
            <button
              key={iconName}
              type="button"
              onClick={() => setIcon(iconName)}
              className={`flex h-8 w-8 items-center justify-center rounded border ${
                icon === iconName ? 'border-slate-900 bg-slate-100 dark:bg-zinc-800' : 'border-slate-300 dark:border-slate-700'
              }`}
              aria-label={iconName}
            >
              <Icon className="h-4 w-4" style={{ color: categoryInk(color) }} />
            </button>
          ))}
        </div>
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
