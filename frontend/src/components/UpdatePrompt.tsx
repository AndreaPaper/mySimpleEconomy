import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Ogni quanto l'app aperta chiede se c'è una versione nuova. Il browser lo
// controlla da sé solo quando si naviga verso una pagina, e una PWA installata
// sul telefono resta aperta per giorni senza mai farlo: senza questo, la
// versione nuova arriverebbe solo dopo averla chiusa del tutto.
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * L'avviso che c'è una versione nuova dell'app, con il pulsante per passarci.
 *
 * Prima la versione nuova si installava da sola e la pagina si ricaricava sotto
 * le mani, senza dire niente e magari a metà di un import. Ora il service worker
 * nuovo resta in attesa finché non si sceglie "Aggiorna": è lì che prende il
 * controllo e la pagina si ricarica, quando si è deciso. "Più tardi" chiude
 * l'avviso: la versione nuova resta in attesa e l'avviso torna alla prossima
 * apertura dell'app.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS)
      // Anche al ritorno nell'app: sul telefono è il momento in cui la si
      // riprende in mano, spesso dopo ore.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center px-4">
      <div
        role="status"
        className="flex w-full max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-brand-300 p-3 shadow-lg dark:border-slate-800 dark:bg-black"
      >
        <RefreshCw className="h-5 w-5 flex-none text-brand-700" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
          È disponibile una nuova versione dell'app.
        </p>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="flex-none rounded px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Più tardi
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="flex-none rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900"
        >
          Aggiorna
        </button>
      </div>
    </div>
  )
}
