import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

// Si chiude solo dalla X, dai pulsanti del contenuto (Annulla, Salva) o con
// Escape, mai toccando il fondo: queste modali contengono form, e su un
// telefono basta sfiorare il bordo per buttare via quello che si stava
// scrivendo. Prima c'era un margine di tolleranza attorno al pannello, ma un
// tocco sbagliato appena più in là chiudeva comunque.
export default function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    // È il fondo a scorrere, non il pannello: su un telefono un form lungo (le
    // categorie, con colori e icone) supera l'altezza dello schermo, e con il
    // pannello solo centrato la parte in basso, pulsante Salva compreso,
    // resterebbe irraggiungibile. min-h-full tiene il centraggio quando c'è spazio.
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div className="w-full max-w-md rounded-lg bg-brand-300 dark:bg-black p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-300"
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
