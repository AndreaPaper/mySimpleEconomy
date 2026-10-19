import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

// Quanto ci si può sbagliare di mira attorno alla modale: un click che cade
// entro questa distanza dal bordo viene letto come un errore, non come la
// volontà di chiudere. Serve perché queste modali contengono form, e chiuderle
// per sbaglio butta via quello che si stava scrivendo.
const SAFE_MARGIN_PX = 24

export default function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const pressedFarAway = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const isFarFromPanel = (x: number, y: number) => {
    const r = panelRef.current?.getBoundingClientRect()
    if (!r) return false
    return (
      x < r.left - SAFE_MARGIN_PX ||
      x > r.right + SAFE_MARGIN_PX ||
      y < r.top - SAFE_MARGIN_PX ||
      y > r.bottom + SAFE_MARGIN_PX
    )
  }

  const handleMouseDown = (e: ReactMouseEvent) => {
    pressedFarAway.current = isFarFromPanel(e.clientX, e.clientY)
  }

  // Si chiude solo se sia la pressione sia il rilascio sono avvenuti ben
  // fuori: trascinare una selezione da un campo di testo fino oltre il bordo
  // produce un click sul fondo, che altrimenti farebbe sparire il form.
  const handleClick = (e: ReactMouseEvent) => {
    if (pressedFarAway.current && isFarFromPanel(e.clientX, e.clientY)) onClose()
    pressedFarAway.current = false
  }

  return (
    // È il fondo a scorrere, non il pannello: su un telefono un form lungo (le
    // categorie, con colori e icone) supera l'altezza dello schermo, e con il
    // pannello solo centrato la parte in basso, pulsante Salva compreso,
    // resterebbe irraggiungibile. min-h-full tiene il centraggio quando c'è spazio.
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div ref={panelRef} className="w-full max-w-md rounded-lg bg-brand-300 dark:bg-black p-6 shadow-lg">
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
