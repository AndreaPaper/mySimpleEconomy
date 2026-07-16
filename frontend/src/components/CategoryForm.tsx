import { useState, type FormEvent } from 'react'
import { CATEGORY_COLORS } from '../constants/colors'
import { CATEGORY_ICONS } from '../constants/icons'
import type { Category, CategoryType } from '../api/types'

interface CategoryFormProps {
  initial?: Category
  onSubmit: (data: { name: string; type: CategoryType; color: string | null; icon: string | null }) => Promise<void>
  onCancel: () => void
}

export default function CategoryForm({ initial, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<CategoryType>(initial?.type ?? 'EXPENSE')
  const [color, setColor] = useState<string | null>(initial?.color ?? CATEGORY_COLORS[0])
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ name, type, color, icon })
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
        <label className="mb-1 block text-sm text-slate-600" htmlFor="name">
          Nome
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <span className="mb-1 block text-sm text-slate-600">Tipo</span>
        {initial ? (
          <p className="text-sm text-slate-500">
            {initial.type === 'INCOME' ? 'Entrata' : 'Uscita'} (non modificabile)
          </p>
        ) : (
          <div className="flex gap-2">
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  type === t ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-300 text-slate-600'
                }`}
              >
                {t === 'EXPENSE' ? 'Uscita' : 'Entrata'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <span className="mb-1 block text-sm text-slate-600">Colore</span>
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
        <span className="mb-1 block text-sm text-slate-600">Icona (opzionale)</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIcon(null)}
            className={`flex h-8 w-8 items-center justify-center rounded border text-xs text-slate-400 ${
              icon === null ? 'border-slate-900' : 'border-slate-300'
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
                icon === iconName ? 'border-slate-900 bg-slate-100' : 'border-slate-300'
              }`}
              aria-label={iconName}
            >
              <Icon className="h-4 w-4" style={{ color: color ?? undefined }} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-2 text-sm">
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
