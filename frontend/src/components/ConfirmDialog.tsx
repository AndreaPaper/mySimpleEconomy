import { useEffect, useRef, type ReactNode } from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  title: string
  /** Cosa sta per succedere, con i dati dell'elemento: il dialogo del browser
   *  non poteva mostrarli e chiedeva conferma alla cieca. */
  children: ReactNode
  confirmLabel?: string
  /** Colora di rosso il pulsante di conferma. Da usare per le azioni che non si
   *  possono annullare, non per ogni conferma. */
  destructive?: boolean
  /** Mostrato al posto dell'etichetta mentre l'operazione è in corso; blocca
   *  anche il secondo click, che altrimenti manderebbe due richieste. */
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Elimina',
  destructive = true,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Il fuoco parte da "Annulla", non dalla conferma: chi tira via un Invio per
  // abitudine non deve trovarsi con qualcosa di cancellato.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-900'
            }`}
          >
            {busy ? 'Attendere...' : confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:opacity-50"
          >
            Annulla
          </button>
        </div>
      </div>
    </Modal>
  )
}
