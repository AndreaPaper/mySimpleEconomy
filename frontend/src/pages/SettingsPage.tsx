import { useState } from 'react'
import { dataCleanupApi } from '../api/endpoints'
import type { DataCleanupResult } from '../api/types'
import Modal from '../components/Modal'
import { useTheme } from '../context/ThemeContext'

const CONFIRM_WORD = 'ELIMINA'

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
  const [fullWipeOpen, setFullWipeOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullWipeResult, setFullWipeResult] = useState<DataCleanupResult | null>(null)
  const [rangeResult, setRangeResult] = useState<DataCleanupResult | null>(null)

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
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold dark:text-white">Impostazioni</h1>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6">
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
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            theme === 'dark' ? 'bg-green-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6">
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

      <div className="space-y-3 rounded-lg border border-red-200 bg-white dark:bg-black p-6">
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
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
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
