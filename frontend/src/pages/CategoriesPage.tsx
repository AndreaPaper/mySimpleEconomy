import { useEffect, useState } from 'react'
import { categoriesApi } from '../api/endpoints'
import type { Category, CategoryType } from '../api/types'
import Modal from '../components/Modal'
import CategoryForm from '../components/CategoryForm'
import { getCategoryIcon } from '../constants/icons'
import { ListPageSkeleton } from '../components/Skeleton'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateFeedback, setGenerateFeedback] = useState<string | null>(null)

  const reload = () => categoriesApi.list().then(setCategories)

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: { name: string; type: CategoryType; color: string | null; icon: string | null }) => {
    if (modalMode === 'edit' && editing) {
      await categoriesApi.update(editing.id, { name: data.name, color: data.color, icon: data.icon })
    } else {
      await categoriesApi.create(data)
    }
    await reload()
    closeModal()
  }

  const handleArchive = async (category: Category) => {
    if (!window.confirm(`Archiviare "${category.name}"? Non comparirà più nei menu, ma resterà nello storico.`)) {
      return
    }
    await categoriesApi.archive(category.id)
    await reload()
  }

  const handleDelete = async (category: Category) => {
    if (!window.confirm(`Eliminare definitivamente "${category.name}"? A differenza dell'archiviazione, non si può annullare.`)) {
      return
    }
    try {
      await categoriesApi.delete(category.id)
      await reload()
    } catch {
      window.alert(
        'Impossibile eliminare: la categoria è collegata a transazioni, spese ricorrenti, debiti o promemoria. Prova ad archiviarla invece.',
      )
    }
  }

  const handleGenerateDefaults = async () => {
    setGenerating(true)
    setGenerateFeedback(null)
    try {
      const createdCategories = await categoriesApi.generateDefaults()
      await reload()
      setGenerateFeedback(
        createdCategories.length > 0 ? `${createdCategories.length} categorie aggiunte.` : 'Le avevi già tutte.',
      )
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <ListPageSkeleton />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Categorie</h1>
        <div className="flex items-center gap-2">
          {generateFeedback && <span className="text-sm text-slate-500 dark:text-slate-400">{generateFeedback}</span>}
          <button
            type="button"
            onClick={handleGenerateDefaults}
            disabled={generating}
            className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 hover:dark:bg-zinc-900 disabled:opacity-50"
          >
            {generating ? 'Generazione...' : 'Genera categorie predefinite'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
          >
            Nuova categoria
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessuna categoria ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
          {categories.map((c) => {
            const Icon = getCategoryIcon(c.icon)
            return (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: c.color ?? '#94a3b8' }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <span>{c.name}</span>
                <span className="text-sm text-slate-400 dark:text-slate-500">{c.type === 'INCOME' ? 'Entrata' : 'Uscita'}</span>
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => openEdit(c)} className="text-brand-700 hover:underline">
                  Modifica
                </button>
                <button type="button" onClick={() => handleArchive(c)} className="text-slate-500 dark:text-slate-400 hover:underline">
                  Archivia
                </button>
                <button type="button" onClick={() => handleDelete(c)} className="text-slate-500 dark:text-slate-400 hover:underline">
                  Elimina
                </button>
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica categoria' : 'Nuova categoria'} onClose={closeModal}>
          <CategoryForm initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
