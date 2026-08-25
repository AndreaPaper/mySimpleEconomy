import { useEffect, useState } from 'react'
import { categoriesApi } from '../api/endpoints'
import type { Category, CategoryType } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import CategoryForm from '../components/CategoryForm'
import { getCategoryIcon } from '../constants/icons'
import { ListPageSkeleton } from '../components/Skeleton'
import { flattenCategoryTree } from '../utils/categoryTree'

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

  const handleSubmit = async (data: {
    name: string
    type: CategoryType
    color: string | null
    icon: string | null
    parentId: string | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await categoriesApi.update(editing.id, {
        name: data.name,
        color: data.color,
        icon: data.icon,
        parentId: data.parentId,
      })
    } else {
      await categoriesApi.create(data)
    }
    await reload()
    closeModal()
  }

  // Archiviazione ed eliminazione condividono lo stesso dialogo: cambiano solo
  // l'avvertenza e il colore del pulsante, non la sostanza della domanda.
  const [pending, setPending] = useState<{ category: Category; action: 'archive' | 'delete' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)

  const ask = (category: Category, action: 'archive' | 'delete') => {
    setPendingError(null)
    setPending({ category, action })
  }

  const confirmPending = async () => {
    if (!pending) return
    setBusy(true)
    setPendingError(null)
    try {
      if (pending.action === 'archive') await categoriesApi.archive(pending.category.id)
      else await categoriesApi.delete(pending.category.id)
      setPending(null)
      await reload()
    } catch {
      // Il caso tipico è l'eliminazione di una categoria ancora collegata a
      // qualcosa: prima finiva in un window.alert dopo la chiusura del confirm,
      // adesso resta sotto gli occhi insieme al suggerimento di archiviarla.
      setPendingError(
        pending.action === 'delete'
          ? 'Impossibile eliminare: la categoria è collegata a transazioni, spese ricorrenti, debiti o promemoria. Prova ad archiviarla invece.'
          : 'Archiviazione non riuscita. Riprova.',
      )
    } finally {
      setBusy(false)
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
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
          {flattenCategoryTree(categories).map(({ category: c, depth }) => {
            const Icon = getCategoryIcon(c.icon)
            return (
            <li key={c.id} className={`flex items-center justify-between py-3 pr-4 ${depth === 1 ? 'pl-12' : 'pl-4'}`}>
              <div className="flex items-center gap-2">
                {depth === 1 && <span className="text-slate-300 dark:text-slate-600">└</span>}
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: c.color ?? '#94a3b8' }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <span>{c.name}</span>
                {depth === 0 && (
                  <span className="text-sm text-slate-400 dark:text-slate-500">{c.type === 'INCOME' ? 'Entrata' : 'Uscita'}</span>
                )}
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => openEdit(c)} className="text-brand-700 hover:underline">
                  Modifica
                </button>
                <button type="button" onClick={() => ask(c, 'archive')} className="text-slate-500 dark:text-slate-400 hover:underline">
                  Archivia
                </button>
                <button type="button" onClick={() => ask(c, 'delete')} className="text-slate-500 dark:text-slate-400 hover:underline">
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
          <CategoryForm
            initial={editing ?? undefined}
            categories={categories}
            onSubmit={handleSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.action === 'archive' ? 'Archivia categoria' : 'Elimina categoria'}
          confirmLabel={pending.action === 'archive' ? 'Archivia' : 'Elimina'}
          destructive={pending.action === 'delete'}
          busy={busy}
          error={pendingError}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        >
          <p>
            {pending.action === 'archive'
              ? 'Non comparirà più nei menu, ma resterà nello storico e potrai riattivarla.'
              : 'A differenza dell\u2019archiviazione, questa operazione non si può annullare.'}
          </p>
          {/* Quante sottocategorie ha se ne ha: eliminando una principale si
              porta dietro un ramo intero, e il confirm del browser non poteva
              dirlo. */}
          <p className="mt-2 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
            <span className="font-medium text-slate-900 dark:text-white">{pending.category.name}</span>
            <br />
            {pending.category.type === 'INCOME' ? 'Entrata' : 'Uscita'}
            {(() => {
              const parent = categories.find((c) => c.id === pending.category.parentId)
              if (parent) return ` · sottocategoria di ${parent.name}`
              const children = categories.filter((c) => c.parentId === pending.category.id)
              return children.length > 0
                ? ` · ${children.length} ${children.length === 1 ? 'sottocategoria' : 'sottocategorie'}`
                : ''
            })()}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
