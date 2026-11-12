import { useRef, useState } from 'react'
import { useInvalidateAll } from '../api/queries'
import Modal from '../components/Modal'
import { saveBlob } from '../utils/saveBlob'
import { localBackend } from './adapter'
import {
  BackupError,
  createBackup,
  currentSummary,
  readBackup,
  restoreBackup,
  type BackupSummary,
  type CheckedBackup,
} from './backup'

const cardClass = 'space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6'
const buttonClass =
  'rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50'

const formatDay = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function SummaryList({ summary }: { summary: BackupSummary }) {
  return (
    <ul className="space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
      <li>
        {count(summary.transactions, 'transazione', 'transazioni')}
        {summary.firstTransactionDate &&
          ` (dal ${formatDay(summary.firstTransactionDate)} al ${formatDay(summary.lastTransactionDate)})`}
      </li>
      <li>{count(summary.categories, 'categoria', 'categorie')}</li>
      <li>{count(summary.recurringTransactions, 'regola ricorrente', 'regole ricorrenti')}</li>
      <li>{count(summary.reminders, 'promemoria', 'promemoria')}</li>
      <li>{count(summary.debts, 'debito', 'debiti')}</li>
    </ul>
  )
}

/**
 * Il backup, nell'app per il telefono: i dati stanno solo lì, e questo file è l'unica
 * copia se il telefono si perde o l'app si disinstalla.
 */
export default function BackupPanel() {
  const invalidateAll = useInvalidateAll()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<{ backup: CheckedBackup; current: BackupSummary } | null>(null)

  const handleExport = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const { blob, filename } = await createBackup(await localBackend())
      await saveBlob(blob, filename)
      setMessage({ kind: 'ok', text: 'Backup creato. Tienilo fuori dal telefono: su Drive, in una email, su un computer.' })
    } catch {
      setMessage({ kind: 'error', text: 'Backup non riuscito. Riprova.' })
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = await readBackup(file)
      setPending({ backup, current: await currentSummary(await localBackend()) })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof BackupError ? error.message : 'Il file non si può leggere. Riprova.',
      })
    } finally {
      setBusy(false)
      // Lo stesso file si può scegliere di nuovo, dopo un annullamento.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleRestore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await restoreBackup(await localBackend(), pending.backup)
      await invalidateAll()
      setPending(null)
      setMessage({ kind: 'ok', text: 'Backup ripristinato.' })
    } catch {
      setPending(null)
      setMessage({ kind: 'error', text: 'Ripristino non riuscito: i tuoi dati non sono stati toccati.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={cardClass}>
        <h2 className="font-medium dark:text-white">Fai un backup</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          I tuoi dati sono solo su questo telefono. Il backup li mette in un file che puoi salvare dove vuoi: se perdi il
          telefono o disinstalli l'app, è l'unico modo per recuperarli. Fanne uno ogni tanto.
        </p>
        <button type="button" disabled={busy} onClick={handleExport} className={buttonClass}>
          Esporta backup
        </button>
      </div>

      <div className={cardClass}>
        <h2 className="font-medium dark:text-white">Ripristina un backup</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sostituisce tutti i dati di questo telefono con quelli del backup. Prima di confermare vedrai cosa contiene.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="File di backup"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium dark:text-white disabled:opacity-50"
        >
          Scegli il file di backup
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`} role="status">
          {message.text}
        </p>
      )}

      {pending && (
        <Modal title="Ripristinare questo backup?" onClose={() => setPending(null)}>
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium dark:text-white">
                Nel backup{pending.backup.createdAt && ` del ${formatDay(pending.backup.createdAt.slice(0, 10))}`}:
              </p>
              <SummaryList summary={pending.backup.summary} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium dark:text-white">Sul telefono adesso, e verrà sostituito:</p>
              <SummaryList summary={pending.current} />
            </div>
            <p className="text-sm text-red-700">
              I dati attuali del telefono verranno cancellati e non si potranno recuperare, a meno di averne un backup.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleRestore}
                className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Ripristino in corso…' : 'Sostituisci i dati'}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:text-white"
              >
                Annulla
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
