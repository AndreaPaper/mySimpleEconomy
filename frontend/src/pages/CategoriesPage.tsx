import { useEffect, useState } from 'react'
import { ChevronRight, Pencil, Plus, Archive, Trash2, Sparkles } from 'lucide-react'
import { categoriesApi } from '../api/endpoints'
import type { Category, CategoryType } from '../api/types'
import BottomSheet from '../components/BottomSheet'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import CategoryForm from '../components/CategoryForm'
import { getCategoryIcon } from '../constants/icons'
import { ListPageSkeleton } from '../components/Skeleton'
import { useIsMobile } from '../hooks/useIsMobile'
import { buildCategoryTree, flattenCategoryTree } from '../utils/categoryTree'

// Le tre pillole Modifica/Archivia/Elimina, condivise fra la riga principale
// e quella della sottocategoria: cambia solo la taglia, non lo schema colori.
function ActionPill({
  icon: Icon,
  label,
  tone,
  small,
  onClick,
}: {
  icon: typeof Pencil
  label: string
  tone: 'brand' | 'neutral' | 'danger'
  small?: boolean
  onClick: () => void
}) {
  const toneClass =
    tone === 'brand'
      ? 'bg-brand-200/30 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
      : tone === 'danger'
        ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
        : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full font-bold ${toneClass} ${
        small ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]'
      }`}
    >
      <Icon className={small ? 'h-[11px] w-[11px]' : 'h-3 w-3'} />
      {label}
    </button>
  )
}

export default function CategoriesPage() {
  const isMobile = useIsMobile()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateFeedback, setGenerateFeedback] = useState<string | null>(null)
  // Su mobile Modifica/Archivia/Elimina stanno dietro il tocco sulla riga.
  const [actionSheetCat, setActionSheetCat] = useState<Category | null>(null)
  // Su desktop le sottocategorie sono chiuse finché non si apre il genitore:
  // l'insieme tiene gli id aperti in questo momento.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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

  // Su mobile i due gruppi Entrate/Uscite passano dalla stessa funzione di
  // ordinamento della lista unica, applicata separatamente a ciascun tipo:
  // le sottocategorie restano rientrate sotto la propria principale.
  const mobileGroups = [
    { key: 'INCOME' as CategoryType, label: 'Entrate', entries: flattenCategoryTree(categories.filter((c) => c.type === 'INCOME')) },
    { key: 'EXPENSE' as CategoryType, label: 'Uscite', entries: flattenCategoryTree(categories.filter((c) => c.type === 'EXPENSE')) },
  ].filter((g) => g.entries.length > 0)

  // Su desktop le sottocategorie si aprono e chiudono: la struttura resta ad
  // albero invece di venire appiattita subito.
  const desktopGroups = [
    {
      key: 'INCOME' as CategoryType,
      label: 'Entrate',
      headerClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
      nodes: buildCategoryTree(categories.filter((c) => c.type === 'INCOME')),
    },
    {
      key: 'EXPENSE' as CategoryType,
      label: 'Uscite',
      headerClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
      nodes: buildCategoryTree(categories.filter((c) => c.type === 'EXPENSE')),
    },
  ].filter((g) => g.nodes.length > 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className={isMobile ? 'text-2xl font-bold' : 'text-lg font-semibold'}>Categorie</h1>
          {!isMobile && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {categories.length} {categories.length === 1 ? 'categoria' : 'categorie'}
            </p>
          )}
        </div>
        {isMobile ? (
          // Su mobile "Genera categorie predefinite" si riduce a un'icona:
          // il testo per esteso non ci starebbe accanto al titolo grande.
          <button
            type="button"
            onClick={handleGenerateDefaults}
            disabled={generating}
            aria-label="Genera categorie predefinite"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-brand-300 text-slate-500 disabled:opacity-50 dark:border-slate-800 dark:bg-black dark:text-slate-400"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </button>
        ) : (
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
        )}
      </div>

      {isMobile && generateFeedback && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{generateFeedback}</p>
      )}

      {categories.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Nessuna categoria ancora.</p>
      ) : isMobile ? (
        <div className="space-y-4">
          {mobileGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 ml-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-brand-300 dark:divide-slate-800 dark:border-slate-800 dark:bg-black">
                {group.entries.map(({ category: c, depth }) => {
                  const Icon = getCategoryIcon(c.icon)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActionSheetCat(c)}
                        className={`flex w-full items-center gap-2.5 py-3 pr-3.5 text-left ${depth === 1 ? 'pl-11' : 'pl-3.5'}`}
                      >
                        {depth === 1 && <span className="shrink-0 text-slate-300 dark:text-slate-600">└</span>}
                        <span
                          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: c.color ?? '#94a3b8' }}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.name}</span>
                        <span className="shrink-0 text-slate-300 dark:text-slate-600">›</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {desktopGroups.map((group) => (
            <div
              key={group.key}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-brand-300 dark:border-slate-800 dark:bg-black"
            >
              <div className={`px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-wide ${group.headerClass}`}>
                {group.label}
              </div>
              {group.nodes.map(({ category: c, children }) => {
                const Icon = getCategoryIcon(c.icon)
                const hasChildren = children.length > 0
                const expanded = expandedIds.has(c.id)
                return (
                  <div key={c.id}>
                    <div className="flex items-center gap-3.5 border-b border-slate-100 px-5 py-3.5 last:border-b-0 dark:border-slate-800">
                      {/* Un segnaposto della stessa larghezza quando non ci sono
                          sottocategorie: senza, le righe senza freccetta
                          sarebbero storte rispetto a quelle che ce l'hanno. */}
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(c.id)}
                          aria-label={expanded ? 'Comprimi sottocategorie' : 'Espandi sottocategorie'}
                          aria-expanded={expanded}
                          className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: c.color ?? '#94a3b8' }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        {hasChildren && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {children.length} {children.length === 1 ? 'sottocategoria' : 'sottocategorie'}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <ActionPill icon={Pencil} label="Modifica" tone="brand" onClick={() => openEdit(c)} />
                        <ActionPill icon={Archive} label="Archivia" tone="neutral" onClick={() => ask(c, 'archive')} />
                        <ActionPill icon={Trash2} label="Elimina" tone="danger" onClick={() => ask(c, 'delete')} />
                      </div>
                    </div>
                    {expanded &&
                      children.map((child) => {
                        const ChildIcon = getCategoryIcon(child.icon)
                        return (
                          <div
                            key={child.id}
                            className="flex items-center gap-3 border-b border-slate-50 py-2.5 pl-[52px] pr-5 last:border-b-0 dark:border-slate-900"
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                              style={{ backgroundColor: child.color ?? '#94a3b8' }}
                            >
                              <ChildIcon className="h-3.5 w-3.5 text-white" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600 dark:text-slate-300">
                              {child.name}
                            </span>
                            <div className="flex shrink-0 gap-1.5">
                              <ActionPill icon={Pencil} label="Modifica" tone="brand" small onClick={() => openEdit(child)} />
                              <ActionPill icon={Archive} label="Archivia" tone="neutral" small onClick={() => ask(child, 'archive')} />
                              <ActionPill icon={Trash2} label="Elimina" tone="danger" small onClick={() => ask(child, 'delete')} />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {isMobile && (
        <button
          type="button"
          onClick={openCreate}
          aria-label="Nuova categoria"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-900"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {isMobile && actionSheetCat && (
        <BottomSheet title={actionSheetCat.name} onClose={() => setActionSheetCat(null)}>
          <div className="space-y-1 pb-1">
            <button
              type="button"
              onClick={() => {
                const cat = actionSheetCat
                setActionSheetCat(null)
                openEdit(cat)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px]"
            >
              <Pencil className="h-[18px] w-[18px] text-brand-700" />
              Modifica
            </button>
            <button
              type="button"
              onClick={() => {
                const cat = actionSheetCat
                setActionSheetCat(null)
                ask(cat, 'archive')
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px]"
            >
              <Archive className="h-[18px] w-[18px] text-brand-700" />
              Archivia
            </button>
            <button
              type="button"
              onClick={() => {
                const cat = actionSheetCat
                setActionSheetCat(null)
                ask(cat, 'delete')
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px] text-red-600"
            >
              <Trash2 className="h-[18px] w-[18px]" />
              Elimina
            </button>
          </div>
        </BottomSheet>
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
