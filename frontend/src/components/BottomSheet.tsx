import { useEffect, type ReactNode } from 'react'

interface BottomSheetProps {
  title?: string
  onClose: () => void
  children: ReactNode
}

// Foglio ancorato al fondo dello schermo: per i menu brevi su mobile — un
// filtro, la scelta fra due azioni — invece della modale centrata di Modal,
// che per un contenuto così corto lascerebbe vuoto tutto lo schermo attorno.
export default function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-brand-300 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lg dark:bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="px-5 pt-3">
          {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  )
}
