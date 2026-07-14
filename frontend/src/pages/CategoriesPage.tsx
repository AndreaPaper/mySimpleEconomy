import { useEffect, useState } from 'react'
import { categoriesApi } from '../api/endpoints'
import type { Category } from '../api/types'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    categoriesApi.list().then(setCategories).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500">Caricamento...</p>

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Categorie</h1>
      {categories.length === 0 ? (
        <p className="text-slate-500">Nessuna categoria. Creane una durante l'inserimento di una transazione.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: c.color ?? '#94a3b8' }}
                />
                <span>{c.name}</span>
              </div>
              <span className="text-sm text-slate-500">{c.type === 'INCOME' ? 'Entrata' : 'Uscita'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
