import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { dataCleanupApi } from '../api/endpoints'
import type { DataCleanupResult } from '../api/types'
import Modal from '../components/Modal'
import { useTheme } from '../context/ThemeContext'
import { useCaseStyle } from '../context/CaseStyleContext'
import { usePalette } from '../context/PaletteContext'
import { UI_PALETTES } from '../constants/uiPalettes'

const CONFIRM_WORD = 'ELIMINA'

// Le impostazioni erano un elenco unico, dove l'interruttore del tema scuro e
// l'eliminazione di tutti i dati stavano a poche righe di distanza. Divise per
// area si vede una cosa alla volta, e le due azioni distruttive stanno insieme
// dove uno va apposta.
type SettingsTab = 'aspetto' | 'importa' | 'transazioni'

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: 'aspetto', label: 'Aspetto' },
  { key: 'importa', label: 'Importa' },
  { key: 'transazioni', label: 'Transazioni' },
]

function ResultSummary({ result }: { result: DataCleanupResult }) {
  return (
    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
      <li>Transazioni eliminate: {result.transactionsDeleted}</li>
      <li>Regole ricorrenti eliminate: {result.recurringTransactionsDeleted}</li>
      <li>Saldi eliminati: {result.balanceCheckpointsDeleted}</li>
      <li>Promemoria eliminati: {result.expenseRemindersDeleted}</li>
    </ul>
  )
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const { caseStyle, toggleCaseStyle } = useCaseStyle()
  const { paletteKey, setPaletteKey } = usePalette()
  const [fullWipeOpen, setFullWipeOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullWipeResult, setFullWipeResult] = useState<DataCleanupResult | null>(null)
  const [rangeResult, setRangeResult] = useState<DataCleanupResult | null>(null)
  const [tab, setTab] = useState<SettingsTab>('aspetto')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Con role="tablist" la tastiera si aspetta le frecce e un solo bottone
  // raggiungibile con Tab: implementarlo a metà sarebbe peggio che non
  // dichiarare affatto le tab, perché il lettore di schermo annuncerebbe un
  // comportamento che poi non c'è.
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length
    setTab(SETTINGS_TABS[next].key)
    tabRefs.current[next]?.focus()
  }

  const closeFullWipe = () => {
    setFullWipeOpen(false)
    setConfirmText('')
    setError(null)
  }

  const handleFullWipe = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await dataCleanupApi.cleanup()
      setFullWipeResult(result)
      setRangeResult(null)
      setFullWipeOpen(false)
      setConfirmText('')
    } catch {
      setError('Cancellazione non riuscita. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  const handleRangeDelete = async () => {
    if (!from && !to) return
    setError(null)
    setBusy(true)
    try {
      const result = await dataCleanupApi.cleanup({ from: from || undefined, to: to || undefined })
      setRangeResult(result)
      setFullWipeResult(null)
    } catch {
      setError('Cancellazione non riuscita. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold dark:text-white">Impostazioni</h1>

      {/* overflow-x-auto perché su schermi stretti le tab scorrono invece di
          andare a capo, che spezzerebbe la riga di sottolineatura. */}
      <div
        role="tablist"
        aria-label="Aree delle impostazioni"
        className="flex gap-6 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
      >
        {SETTINGS_TABS.map((item, index) => {
          const active = tab === item.key
          return (
            <button
              key={item.key}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-selected={active}
              aria-controls={`panel-${item.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(item.key)}
              onKeyDown={(event) => moveTab(event, index)}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-3 text-sm ${
                active
                  ? 'border-brand-700 font-bold text-brand-700'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:dark:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-aspetto"
        aria-labelledby="tab-aspetto"
        hidden={tab !== 'aspetto'}
        className="space-y-6"
      >
        {/* I due interruttori semplici stanno affiancati: da soli occupavano
            una riga intera ciascuno pur contenendo poco. La palette resta a
            piena larghezza perché le sue anteprime hanno bisogno di spazio. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
            <div>
              <h2 className="font-medium dark:text-white">Aspetto</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Modalità scura per l'interfaccia.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                theme === 'dark' ? 'bg-brand-700' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
            <div>
              <h2 className="font-medium dark:text-white">Testo maiuscolo</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Disattiva per vedere le scritte (incluse le categorie che crei) come le scrivi, non tutte in maiuscolo.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={caseStyle === 'uppercase'}
              onClick={toggleCaseStyle}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                caseStyle === 'uppercase' ? 'bg-brand-700' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  caseStyle === 'uppercase' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
          <h2 className="mb-1 font-medium dark:text-white">Palette colori</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Scegli i colori dell'interfaccia.</p>
          <div className="flex flex-wrap gap-3">
            {UI_PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPaletteKey(p.key)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-2 ${
                  paletteKey === p.key
                    ? 'border-brand-700 bg-brand-100 dark:bg-brand-900'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="flex overflow-hidden rounded">
                  {[p.colors.brand900, p.colors.brand700, p.colors.brand500, p.colors.brand100].map((c) => (
                    <span key={c} className="h-6 w-6" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="text-xs text-slate-600 dark:text-slate-300">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-importa"
        aria-labelledby="tab-importa"
        hidden={tab !== 'importa'}
        className="space-y-6"
      >
        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
          <div>
            <h2 className="font-medium dark:text-white">Importa da Excel</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Il tuo diario spese, oppure la lista movimenti scaricata da Intesa Sanpaolo. L'estratto conto puoi
              ripassarlo ogni volta che vuoi: le transazioni già registrate vengono riconosciute e non raddoppiate.
            </p>
          </div>
          <Link
            to="/importa"
            className="shrink-0 rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
          >
            Importa
          </Link>
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-transazioni"
        aria-labelledby="tab-transazioni"
        hidden={tab !== 'transazioni'}
        className="space-y-6"
      >
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
          <h2 className="font-medium dark:text-white">Elimina transazioni per periodo</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Elimina transazioni e saldi di partenza nell'intervallo scelto. Categorie, regole ricorrenti e promemoria
            non vengono toccati.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">Da</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">A</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
              />
            </label>
            <button
              type="button"
              disabled={(!from && !to) || busy}
              onClick={handleRangeDelete}
              className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Elimina nel periodo
            </button>
          </div>
          {rangeResult && (
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-zinc-900 p-3">
              <ResultSummary result={rangeResult} />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-red-200 bg-brand-300 dark:bg-black p-6">
          <h2 className="font-medium text-red-700">Elimina tutti i dati</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Elimina tutte le transazioni, le regole ricorrenti, i saldi di partenza e i promemoria del tuo account. Le
            categorie restano, così un reimport da Excel le riconosce senza doverle ricreare. Questa azione non è
            reversibile.
          </p>
          <button
            type="button"
            onClick={() => setFullWipeOpen(true)}
            className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Elimina tutto
          </button>
          {fullWipeResult && (
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-zinc-900 p-3">
              <ResultSummary result={fullWipeResult} />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {fullWipeOpen && (
        <Modal title="Conferma eliminazione totale" onClose={closeFullWipe}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Stai per eliminare <strong>tutte</strong> le transazioni, le regole ricorrenti, i saldi di partenza e i
              promemoria. Le categorie non verranno toccate. Per confermare scrivi <strong>{CONFIRM_WORD}</strong> nel
              campo sottostante.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-brand-300 dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={confirmText !== CONFIRM_WORD || busy}
                onClick={handleFullWipe}
                className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Eliminazione in corso...' : 'Elimina definitivamente'}
              </button>
              <button
                type="button"
                onClick={closeFullWipe}
                className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
              >
                Annulla
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
