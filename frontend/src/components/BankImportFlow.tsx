import { useMemo, useRef, useState } from 'react'
import { bankImportApi } from '../api/endpoints'
import type {
  BankCategoryMappingDto,
  BankImportExclusionDto,
  BankImportOutcome,
  BankImportPreviewResponse,
  BankImportResult,
  BankImportRowPreview,
  BankSource,
  Category,
} from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

// Come si presenta ogni esito nell'anteprima. L'ordine di questa lista è
// l'ordine delle sezioni: prima cosa entra, poi cosa va deciso, in fondo cosa
// resta fuori.
const SECTIONS: {
  outcome: BankImportOutcome
  title: string
  hint: string
  tone: string
}[] = [
  {
    outcome: 'NUOVA',
    title: 'Da importare',
    hint: 'Movimenti che non trovano riscontro in quello che hai già.',
    tone: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    outcome: 'AGGIORNA_PROVVISORIA',
    title: 'Da aggiornare',
    hint: 'Erano stati importati quando la banca non li aveva ancora contabilizzati: si aggiornano invece di crearne altri.',
    tone: 'text-sky-700 dark:text-sky-400',
  },
  {
    outcome: 'SOSPETTO_MANUALE',
    title: 'Da controllare — forse già inserite a mano',
    hint: 'Coincidono per data e importo con qualcosa che hai già. Potrebbero essere due spese diverse davvero uguali: decidi tu.',
    tone: 'text-amber-700 dark:text-amber-400',
  },
  {
    outcome: 'SOSPETTO_RICORRENTE',
    title: 'Da controllare — forse già generate da una regola',
    hint: 'Importarle vorrebbe dire contarle due volte insieme alla transazione della regola ricorrente.',
    tone: 'text-amber-700 dark:text-amber-400',
  },
  {
    outcome: 'ESCLUSA',
    title: 'Escluse dalle tue regole',
    hint: 'Non sono spese: spostano soldi o li ritirano. Puoi comunque includerne una spuntandola.',
    tone: 'text-slate-500 dark:text-slate-400',
  },
]

interface BankImportFlowProps {
  categories: Category[]
  onCategoriesChanged: () => void
}

export default function BankImportFlow({ categories, onCategoriesChanged }: BankImportFlowProps) {
  const source: BankSource = 'INTESA_SANPAOLO'
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BankImportPreviewResponse | null>(null)
  const [mappings, setMappings] = useState<BankCategoryMappingDto[]>([])
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set())
  // Righe che l'utente ha spuntato o tolto *contro* la proposta. Tenere gli
  // scostamenti invece dell'elenco degli spuntati fa sì che accettare
  // un'esclusione o cambiare una mappatura aggiorni da sé cosa entra, senza
  // cancellare le scelte fatte a mano.
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [mappingDone, setMappingDone] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [creatingCategories, setCreatingCategories] = useState(false)
  const [result, setResult] = useState<BankImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAnalyze = async () => {
    if (!file) return
    setError(null)
    setAnalyzing(true)
    try {
      const response = await bankImportApi.analyze(source, file)
      setPreview(response)
      setMappings(response.unmappedCategories)
      setMappingDone(response.unmappedCategories.length === 0)
      // Le proposte di esclusione partono accettate: sono i movimenti che
      // gonfierebbero le spese, e chi non le vuole le toglie con un click.
      setAcceptedSuggestions(new Set(response.suggestedExclusions.map((e) => e.pattern)))
      setFlipped(new Set())
    } catch (e) {
      // Il backend spiega cosa non va nel file (formato sbagliato, tabella non
      // trovata): il suo messaggio è più utile di uno generico.
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(message || 'Analisi del file non riuscita. Verifica che sia un .xlsx esportato dalla banca.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Le esclusioni in vigore: quelle già salvate più le proposte accettate.
  const activeExclusions: BankImportExclusionDto[] = useMemo(() => {
    if (!preview) return []
    return [
      ...preview.exclusions,
      ...preview.suggestedExclusions.filter((e) => acceptedSuggestions.has(e.pattern)),
    ]
  }, [preview, acceptedSuggestions])

  // Le righe con mappature ed esclusioni applicate. Si fa qui invece di
  // rianalizzare: il file è già stato letto e il risultato non cambierebbe.
  const rows: BankImportRowPreview[] = useMemo(() => {
    if (!preview) return []
    return preview.rows.map((row) => {
      const mapping = mappings.find(
        (m) => m.bankCategory === row.bankCategory && m.transactionType === row.type,
      )
      const text = `${row.rawOperation ?? ''} ${row.rawDetails ?? ''}`.toUpperCase()
      const excludedByRule = activeExclusions.some((e) => text.includes(e.pattern.toUpperCase()))

      if (row.outcome === 'GIA_IMPORTATA') return row
      // La categoria si assegna anche alle righe escluse: se l'utente decide di
      // includerne una, deve poter entrare senza tornare alla mappatura.
      const withCategory = { ...row, categoryId: mapping?.categoryId ?? row.categoryId }
      return mapping?.doNotImport || excludedByRule
        ? { ...withCategory, outcome: 'ESCLUSA' as BankImportOutcome }
        : withCategory
    })
  }, [preview, mappings, activeExclusions])

  const alreadyImported = rows.filter((r) => r.outcome === 'GIA_IMPORTATA')

  // Entrano di default solo le righe nuove e quelle da aggiornare: quello che va
  // deciso o è stato escluso parte spento.
  const selectedByDefault = (row: BankImportRowPreview) =>
    row.outcome === 'NUOVA' || row.outcome === 'AGGIORNA_PROVVISORIA'
  const isSelected = (row: BankImportRowPreview) =>
    selectedByDefault(row) !== flipped.has(row.rowNumber)

  const toImport = rows.filter((r) => r.outcome !== 'GIA_IMPORTATA' && isSelected(r))
  const missingCategory = toImport.filter((r) => !r.categoryId)
  const mappingsResolved = mappings.every((m) => m.doNotImport || m.categoryId)

  const toggleRow = (rowNumber: number) => {
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  const toggleSection = (outcome: BankImportOutcome, on: boolean) => {
    const section = rows.filter((r) => r.outcome === outcome)
    setFlipped((prev) => {
      const next = new Set(prev)
      section.forEach((row) => {
        // Uno scostamento serve solo quando lo stato voluto differisce dalla
        // proposta: altrimenti si toglie e la riga torna a seguirla.
        if (selectedByDefault(row) === on) next.delete(row.rowNumber)
        else next.add(row.rowNumber)
      })
      return next
    })
  }

  const setMapping = (index: number, value: Partial<BankCategoryMappingDto>) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...value } : m)))
  }

  const handleCreateBankCategories = async () => {
    setError(null)
    setCreatingCategories(true)
    try {
      setMappings(await bankImportApi.createCategoriesFromBank(mappings))
      onCategoriesChanged()
    } catch {
      setError('Creazione delle categorie non riuscita.')
    } finally {
      setCreatingCategories(false)
    }
  }

  const handleCommit = async () => {
    if (!preview) return
    setError(null)
    setCommitting(true)
    try {
      setResult(
        await bankImportApi.commit({
          source,
          rows: toImport.map((r) => ({
            occurredOn: r.occurredOn,
            rawOperation: r.rawOperation,
            rawDetails: r.rawDetails,
            bankCategory: r.bankCategory,
            amount: r.amount,
            type: r.type,
            provisional: r.provisional,
            description: r.description,
            categoryId: r.categoryId,
            updateTransactionId: r.matchedTransactionId,
          })),
          mappings,
          exclusions: activeExclusions,
        }),
      )
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(message || 'Importazione non riuscita.')
    } finally {
      setCommitting(false)
    }
  }

  const resetAll = () => {
    setFile(null)
    setPreview(null)
    setMappings([])
    setFlipped(new Set())
    setAcceptedSuggestions(new Set())
    setMappingDone(false)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? '—') : '—'

  if (result) {
    return (
      <div className="max-w-lg space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
        <h2 className="text-lg font-semibold">Importazione completata</h2>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>Transazioni importate: {result.importate}</li>
          <li>Movimenti provvisori aggiornati: {result.aggiornate}</li>
          <li>Righe saltate perché già presenti: {result.saltate}</li>
          <li>Corrispondenze fra categorie salvate: {result.mappatureSalvate}</li>
          <li>Regole di esclusione salvate: {result.esclusioniSalvate}</li>
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          La prossima volta puoi ripassare l'estratto conto aggiornato: le righe già importate verranno riconosciute
          e non ti verranno riproposte.
        </p>
        <div className="flex gap-2">
          <a href="/transazioni" className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
            Vedi le transazioni
          </a>
          <button type="button" onClick={resetAll} className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
            Importa un altro file
          </button>
        </div>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="max-w-lg space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Carica la lista movimenti esportata dall'app della banca. Verrà analizzata senza salvare nulla: vedrai cosa
          è già in archivio e cosa manca prima di confermare.
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
    )
  }

  if (!mappingDone) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
          <h2 className="font-medium dark:text-white">A quali tue categorie corrispondono?</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            La banca usa categorie sue. Scegli una volta sola: dagli import successivi non te lo chiederò più.
          </p>
          <button
            type="button"
            onClick={handleCreateBankCategories}
            disabled={creatingCategories}
            className="mt-3 rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:opacity-50"
          >
            {creatingCategories ? 'Creazione...' : 'Crea le categorie con i nomi della banca'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="space-y-2">
          {mappings.map((m, i) => (
            <li
              key={`${m.bankCategory}-${m.transactionType}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium dark:text-white">{m.bankCategory}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {m.transactionType === 'INCOME' ? 'Entrata' : 'Uscita'} · {m.rowCount}{' '}
                  {m.rowCount === 1 ? 'movimento' : 'movimenti'}
                  {m.sampleDescription ? ` · es. ${m.sampleDescription}` : ''}
                </p>
              </div>
              <select
                value={m.doNotImport ? 'skip' : (m.categoryId ?? '')}
                onChange={(e) => {
                  const value = e.target.value
                  setMapping(i, {
                    doNotImport: value === 'skip',
                    categoryId: value === 'skip' || value === '' ? null : value,
                  })
                }}
                className="rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="">Scegli...</option>
                {categories
                  .filter((c) => (m.transactionType === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                <option value="skip">Non importare</option>
              </select>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!mappingsResolved}
            onClick={() => setMappingDone(true)}
            className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
          >
            Continua
          </button>
          <button type="button" onClick={resetAll} className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm">
            Annulla
          </button>
        </div>
        {!mappingsResolved && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manca ancora una scelta per {mappings.filter((m) => !m.doNotImport && !m.categoryId).length} categorie.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Movimenti nel file" value={preview.summary.rowsInFile} />
        <Stat label="Da importare" value={rows.filter((r) => r.outcome === 'NUOVA').length} />
        <Stat label="Da aggiornare" value={rows.filter((r) => r.outcome === 'AGGIORNA_PROVVISORIA').length} />
        <Stat
          label="Da controllare"
          value={rows.filter((r) => r.outcome === 'SOSPETTO_MANUALE' || r.outcome === 'SOSPETTO_RICORRENTE').length}
          highlight
        />
        <Stat label="Già in archivio" value={alreadyImported.length} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Periodo del file: dal {preview.summary.firstDate} al {preview.summary.lastDate}.
      </p>

      {preview.suggestedExclusions.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
          <p className="font-medium dark:text-white">Movimenti che non sembrano spese</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Li ho riconosciuti guardando il file. Se confermi diventano regole tue e valgono anche per i prossimi
            import.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {preview.suggestedExclusions.map((e) => (
              <li key={e.pattern} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptedSuggestions.has(e.pattern)}
                  onChange={(ev) =>
                    setAcceptedSuggestions((prev) => {
                      const next = new Set(prev)
                      if (ev.target.checked) next.add(e.pattern)
                      else next.delete(e.pattern)
                      return next
                    })
                  }
                />
                <span>
                  <span className="font-medium dark:text-white">{e.pattern}</span>
                  {e.note && <span className="block text-xs text-slate-500 dark:text-slate-400">{e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {SECTIONS.map((section) => {
        const sectionRows = rows.filter((r) => r.outcome === section.outcome)
        if (sectionRows.length === 0) return null
        const allOn = sectionRows.every(isSelected)
        return (
          <div key={section.outcome} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className={`font-medium ${section.tone}`}>
                {section.title} ({sectionRows.length})
              </p>
              <button
                type="button"
                onClick={() => toggleSection(section.outcome, !allOn)}
                className="text-xs text-brand-700 hover:underline"
              >
                {allOn ? 'Deseleziona tutte' : 'Seleziona tutte'}
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{section.hint}</p>
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {sectionRows.map((row) => (
                <li key={row.rowNumber} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={isSelected(row)}
                    onChange={() => toggleRow(row.rowNumber)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="truncate dark:text-white">{row.description}</span>
                      <span className={row.type === 'INCOME' ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                        {row.type === 'INCOME' ? '+' : '-'}
                        {currency.format(row.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {row.occurredOn} · {row.bankCategory} · {categoryName(row.categoryId)}
                      {row.provisional && ' · non ancora contabilizzato'}
                    </p>
                    {row.conflictDescription && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">{row.conflictDescription}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {alreadyImported.length > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {alreadyImported.length}{' '}
          {alreadyImported.length === 1 ? 'movimento era già in archivio' : 'movimenti erano già in archivio'} da un
          import precedente: non verranno duplicati.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={committing || toImport.length === 0 || missingCategory.length > 0}
          onClick={handleCommit}
          className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {committing ? 'Importazione in corso...' : `Importa ${toImport.length} movimenti`}
        </button>
        <button type="button" onClick={resetAll} className="rounded border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm">
          Annulla
        </button>
      </div>
      {missingCategory.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {missingCategory.length} movimenti selezionati non hanno una categoria.
        </p>
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
