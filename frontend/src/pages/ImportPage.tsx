import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoriesApi, excelImportApi } from '../api/endpoints'
import type {
  Category,
  CategorySuggestion,
  ExcelImportPreviewResponse,
  ExcelImportResult,
} from '../api/types'
import Modal from '../components/Modal'
import CategoryForm from '../components/CategoryForm'
import CategoryPicker from '../components/CategoryPicker'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function categoryLabel(
  existingCategoryId: string | null,
  newCategoryTempId: string | null,
  existingCategories: Category[],
  newCategorySuggestions: CategorySuggestion[],
): string {
  if (existingCategoryId) {
    return existingCategories.find((c) => c.id === existingCategoryId)?.name ?? '—'
  }
  if (newCategoryTempId) {
    return newCategorySuggestions.find((c) => c.tempId === newCategoryTempId)?.name ?? '—'
  }
  return '—'
}

export default function ImportPage() {
  const [existingCategories, setExistingCategories] = useState<Category[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ExcelImportPreviewResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newCategoryTarget, setNewCategoryTarget] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    categoriesApi.list().then(setExistingCategories)
  }, [])

  const handleAnalyze = async () => {
    if (!file) return
    setError(null)
    setAnalyzing(true)
    try {
      const response = await excelImportApi.analyze(file)
      setPreview(response)
    } catch {
      setError('Analisi del file non riuscita. Verifica che sia un file .xlsx valido.')
    } finally {
      setAnalyzing(false)
    }
  }

  const updateOneOff = (index: number, value: { existingCategoryId: string | null; newCategoryTempId: string | null }) => {
    if (!preview) return
    const oneOffTransactions = [...preview.oneOffTransactions]
    oneOffTransactions[index] = { ...oneOffTransactions[index], ...value }
    setPreview({ ...preview, oneOffTransactions })
  }

  const handleNewCategoryCreated = (suggestion: {
    name: string
    type: 'INCOME' | 'EXPENSE'
    color: string | null
    icon: string | null
  }) => {
    if (!preview || newCategoryTarget === null) return Promise.resolve()
    const tempId = `new-manual-${Date.now()}`
    const newSuggestion: CategorySuggestion = { tempId, name: suggestion.name, type: suggestion.type, color: suggestion.color }
    const oneOffTransactions = [...preview.oneOffTransactions]
    oneOffTransactions[newCategoryTarget] = {
      ...oneOffTransactions[newCategoryTarget],
      existingCategoryId: null,
      newCategoryTempId: tempId,
    }
    setPreview({
      ...preview,
      newCategorySuggestions: [...preview.newCategorySuggestions, newSuggestion],
      oneOffTransactions,
    })
    setNewCategoryTarget(null)
    return Promise.resolve()
  }

  const allResolved =
    preview?.oneOffTransactions.every((t) => t.existingCategoryId || t.newCategoryTempId) ?? false

  const handleCommit = async () => {
    if (!preview) return
    setError(null)
    setCommitting(true)
    try {
      const commitResult = await excelImportApi.commit(preview)
      setResult(commitResult)
    } catch {
      setError('Importazione non riuscita.')
    } finally {
      setCommitting(false)
    }
  }

  const resetAll = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (result) {
    return (
      <div className="max-w-lg space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6">
        <h1 className="text-lg font-semibold">Importazione completata</h1>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>Categorie create: {result.categoriesCreated}</li>
          <li>Regole ricorrenti create: {result.recurringTransactionsCreated}</li>
          <li>Transazioni create (incl. storico ricorrenze): {result.transactionsCreated}</li>
          <li>Saldi di partenza registrati: {result.checkpointsCreated}</li>
        </ul>
        <div className="flex gap-2">
          <a href="/" className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
            Vai alla Dashboard
          </a>
          <button type="button" onClick={resetAll} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
            Importa un altro file
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/impostazioni" className="text-sm text-brand-700 hover:underline">
          ← Impostazioni
        </Link>
        <h1 className="text-lg font-semibold">Importa da Excel</h1>
      </div>

      {!preview && (
        <div className="max-w-lg space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Carica il tuo diario spese in formato .xlsx. Verrà analizzato senza salvare nulla: potrai controllare e
            correggere le categorie prima di confermare.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <button
            type="button"
            disabled={!file || analyzing}
            onClick={handleAnalyze}
            className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
          >
            {analyzing ? 'Analisi in corso...' : 'Analizza'}
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Fogli analizzati" value={preview.summary.sheetsProcessed} />
            <Stat label="Regole ricorrenti" value={preview.summary.recurringDetected} />
            <Stat label="Transazioni singole" value={preview.summary.oneOffDetected} />
            <Stat label="Nuove categorie" value={preview.summary.categoriesToCreate} />
            <Stat label="Da categorizzare" value={preview.summary.itemsNeedingCategory} highlight />
            <Stat label="Saldi rilevati" value={preview.summary.checkpointsDetected} />
          </div>

          {preview.balanceCheckpoints.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
              <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Saldi di partenza rilevati</p>
              <ul className="space-y-1 text-sm">
                {preview.balanceCheckpoints.map((c) => (
                  <li key={c.checkpointDate}>
                    <span className="font-medium">{currency.format(c.balance)}</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">al {c.checkpointDate}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Regole ricorrenti rilevate</p>
            {preview.recurringTransactions.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {preview.recurringTransactions.map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      {r.name} <span className="text-slate-400 dark:text-slate-500">· {r.occurrenceCount} fogli</span>
                    </span>
                    <span>
                      {currency.format(r.amount)} ·{' '}
                      {categoryLabel(r.existingCategoryId, r.newCategoryTempId, existingCategories, preview.newCategorySuggestions)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Transazioni singole</p>
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {preview.oneOffTransactions.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {t.occurredOn} · {t.name} · {currency.format(t.amount)}
                  </span>
                  {t.existingCategoryId || t.newCategoryTempId ? (
                    <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {categoryLabel(t.existingCategoryId, t.newCategoryTempId, existingCategories, preview.newCategorySuggestions)}
                    </span>
                  ) : (
                    <CategoryPicker
                      existingCategories={existingCategories}
                      newCategorySuggestions={preview.newCategorySuggestions}
                      existingCategoryId={t.existingCategoryId}
                      newCategoryTempId={t.newCategoryTempId}
                      onChange={(value) => updateOneOff(i, value)}
                      onRequestNewCategory={() => setNewCategoryTarget(i)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!allResolved || committing}
              onClick={handleCommit}
              className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
            >
              {committing ? 'Importazione in corso...' : 'Conferma importazione'}
            </button>
            <button type="button" onClick={resetAll} className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm">
              Annulla
            </button>
          </div>
          {!allResolved && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assegna una categoria a tutte le transazioni evidenziate prima di confermare.
            </p>
          )}
        </div>
      )}

      {newCategoryTarget !== null && (
        <Modal title="Nuova categoria" onClose={() => setNewCategoryTarget(null)}>
          <CategoryForm onSubmit={handleNewCategoryCreated} onCancel={() => setNewCategoryTarget(null)} />
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${highlight && value > 0 ? 'text-amber-600' : ''}`}>{value}</p>
    </div>
  )
}
