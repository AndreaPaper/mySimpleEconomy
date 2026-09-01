import { useEffect, useState } from 'react'
import { Landmark, NotebookText, type LucideIcon } from 'lucide-react'
import { categoriesApi, excelImportApi } from '../api/endpoints'
import type {
  Category,
  CategorySuggestion,
  ExcelImportPreviewResponse,
  ExcelImportResult,
} from '../api/types'
import Modal from './Modal'
import CategoryForm from './CategoryForm'
import CategoryPicker from './CategoryPicker'
import BankImportFlow from './BankImportFlow'
import FilePicker from './FilePicker'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

// I due formati non hanno niente in comune se non l'essere .xlsx: il diario
// spese è un foglio per mese scritto a mano, l'estratto conto una tabella di
// movimenti. Sceglierlo qui evita di doverli riconoscere a naso, che con un
// file sbagliato porterebbe a un import muto e vuoto.
type ImportFormat = 'diary' | 'intesa'

// Icone di lucide invece delle emoji del disegno: il badge le vuole bianche su
// fondo colorato, e un'emoji porta i suoi colori e non si lascia tingere.
const FORMATS: { key: ImportFormat; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: 'diary', label: 'Diario spese', hint: 'Una scheda per mese', Icon: NotebookText },
  { key: 'intesa', label: 'Intesa Sanpaolo', hint: 'Estratto conto', Icon: Landmark },
]

export default function ImportPanel() {
  const [format, setFormat] = useState<ImportFormat>('diary')
  const [existingCategories, setExistingCategories] = useState<Category[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ExcelImportPreviewResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Sia le regole ricorrenti che le transazioni singole arrivano dall'analisi
  // già con una categoria assegnata (esistente per nome o una nuova suggerita
  // in automatico): "list" dice quale dei due elenchi del preview aggiornare
  // quando l'utente sceglie di sostituirla con un'altra, invece di tenersi
  // per forza quella indovinata.
  const [newCategoryTarget, setNewCategoryTarget] = useState<{ list: 'oneOff' | 'recurring'; index: number } | null>(
    null,
  )

  const reloadCategories = () => {
    categoriesApi.list().then(setExistingCategories)
  }

  useEffect(reloadCategories, [])

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

  const updateRecurring = (index: number, value: { existingCategoryId: string | null; newCategoryTempId: string | null }) => {
    if (!preview) return
    const recurringTransactions = [...preview.recurringTransactions]
    recurringTransactions[index] = { ...recurringTransactions[index], ...value }
    setPreview({ ...preview, recurringTransactions })
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
    const newCategorySuggestions = [...preview.newCategorySuggestions, newSuggestion]
    const value = { existingCategoryId: null, newCategoryTempId: tempId }
    if (newCategoryTarget.list === 'oneOff') {
      const oneOffTransactions = [...preview.oneOffTransactions]
      oneOffTransactions[newCategoryTarget.index] = { ...oneOffTransactions[newCategoryTarget.index], ...value }
      setPreview({ ...preview, newCategorySuggestions, oneOffTransactions })
    } else {
      const recurringTransactions = [...preview.recurringTransactions]
      recurringTransactions[newCategoryTarget.index] = { ...recurringTransactions[newCategoryTarget.index], ...value }
      setPreview({ ...preview, newCategorySuggestions, recurringTransactions })
    }
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
  }

  if (result) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
        <h2 className="text-lg font-semibold">Importazione completata</h2>
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
      {/* Nel ramo diario il selettore sparisce dopo l'analisi, perché lì
          cambiare formato butterebbe via il lavoro fatto senza dirlo. */}
      {!preview && (
        <fieldset>
          <legend className="mb-2 text-sm text-slate-600 dark:text-slate-300">Che file stai importando?</legend>
          {/* radio e non bottoni: è una scelta fra alternative che si escludono,
              e così le frecce ci si muovono dentro e un lettore di schermo
              annuncia "1 di 2" invece di due comandi slegati. */}
          <div className="grid grid-cols-2 gap-2.5">
            {FORMATS.map(({ key, label, hint, Icon }) => {
              const active = format === key
              return (
                <label
                  key={key}
                  // In chiaro il riquadro scelto si tinge appena; al buio resta
                  // nero come l'altro e la scelta la portano bordo e pastiglia.
                  // Non dark:bg-brand-900: in questa palette vale lo stesso blu
                  // pieno della pastiglia, che ci sparirebbe dentro.
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-[1.5px] p-4 text-center ${
                    active
                      ? 'border-brand-700 bg-brand-100 dark:bg-black'
                      : 'border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-format"
                    value={key}
                    checked={active}
                    onChange={() => setFormat(key)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      active ? 'bg-brand-700 text-white' : 'bg-brand-100 dark:bg-zinc-900 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold dark:text-white">{label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {format === 'intesa' && (
        <BankImportFlow categories={existingCategories} onCategoriesChanged={reloadCategories} />
      )}

      {format === 'diary' && !preview && (
        <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Carica il tuo diario spese in formato .xlsx. Verrà analizzato senza salvare nulla: potrai controllare e
            correggere le categorie prima di confermare.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <FilePicker file={file} onChange={setFile} />
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

      {format === 'diary' && preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Fogli analizzati" value={preview.summary.sheetsProcessed} />
            <Stat label="Regole ricorrenti" value={preview.summary.recurringDetected} />
            <Stat label="Transazioni singole" value={preview.summary.oneOffDetected} />
            <Stat label="Nuove categorie" value={preview.summary.categoriesToCreate} />
            <Stat label="Da categorizzare" value={preview.summary.itemsNeedingCategory} highlight />
            <Stat label="Saldi rilevati" value={preview.summary.checkpointsDetected} />
          </div>

          {preview.balanceCheckpoints.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
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

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Regole ricorrenti rilevate</p>
            {preview.recurringTransactions.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {preview.recurringTransactions.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {r.name} <span className="text-slate-400 dark:text-slate-500">· {r.occurrenceCount} fogli</span> ·{' '}
                      {currency.format(r.amount)}
                    </span>
                    <CategoryPicker
                      existingCategories={existingCategories}
                      newCategorySuggestions={preview.newCategorySuggestions}
                      existingCategoryId={r.existingCategoryId}
                      newCategoryTempId={r.newCategoryTempId}
                      onChange={(value) => updateRecurring(i, value)}
                      onRequestNewCategory={() => setNewCategoryTarget({ list: 'recurring', index: i })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Transazioni singole</p>
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {preview.oneOffTransactions.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {t.occurredOn} · {t.name} · {currency.format(t.amount)}
                  </span>
                  <CategoryPicker
                    existingCategories={existingCategories}
                    newCategorySuggestions={preview.newCategorySuggestions}
                    existingCategoryId={t.existingCategoryId}
                    newCategoryTempId={t.newCategoryTempId}
                    onChange={(value) => updateOneOff(i, value)}
                    onRequestNewCategory={() => setNewCategoryTarget({ list: 'oneOff', index: i })}
                  />
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
          <CategoryForm
            categories={existingCategories}
            onSubmit={handleNewCategoryCreated}
            onCancel={() => setNewCategoryTarget(null)}
          />
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
