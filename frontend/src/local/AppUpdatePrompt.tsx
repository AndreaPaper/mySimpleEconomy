import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { App } from '@capacitor/app'
import { checkForUpdate, downloadAndInstall, UpdatePermissionNeeded, type AppUpdate } from './appUpdate'

// Al massimo un controllo ogni ora, anche se l'app si riapre spesso: GitHub accetta 60
// richieste l'ora senza login, e una versione nuova non scappa.
const CHECK_INTERVAL_MS = 60 * 60 * 1000

type Phase = { kind: 'idle' } | { kind: 'downloading' } | { kind: 'error'; message: string }

/**
 * L'avviso che c'è una versione nuova dell'app per il telefono, con il pulsante che la
 * scarica e apre l'installazione di Android. Come l'avviso della web app: "Più tardi" lo
 * chiude, e torna alla prossima apertura.
 */
export default function AppUpdatePrompt() {
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  useEffect(() => {
    let lastCheck = 0
    const check = async () => {
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      const found = await checkForUpdate()
      if (found) setUpdate(found)
    }
    void check()
    const listener = App.addListener('resume', () => void check())
    return () => {
      void listener.then((l) => l.remove())
    }
  }, [])

  if (!update || dismissed) return null

  const install = async () => {
    setPhase({ kind: 'downloading' })
    try {
      await downloadAndInstall(update)
      setPhase({ kind: 'idle' })
    } catch (error) {
      setPhase({
        kind: 'error',
        message:
          error instanceof UpdatePermissionNeeded
            ? 'Nella pagina che si è aperta consenti a MyEconomy di installare app, poi torna qui e tocca di nuovo Aggiorna.'
            : 'Scaricamento non riuscito. Controlla la connessione e riprova.',
      })
    }
  }

  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center px-4">
      <div
        role="status"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-brand-300 p-3 shadow-lg dark:border-slate-800 dark:bg-black"
      >
        <div className="flex items-center gap-3">
          <Download className="h-5 w-5 flex-none text-brand-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
            È disponibile la versione {update.versionName} dell'app.
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={phase.kind === 'downloading'}
            className="flex-none rounded px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Più tardi
          </button>
          <button
            type="button"
            onClick={() => void install()}
            disabled={phase.kind === 'downloading'}
            className="flex-none rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-60"
          >
            {phase.kind === 'downloading' ? 'Scarico…' : 'Aggiorna'}
          </button>
        </div>
        {phase.kind === 'error' && <p className="mt-2 text-sm text-red-600">{phase.message}</p>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          I tuoi dati restano dove sono: l'aggiornamento cambia solo l'app.
        </p>
      </div>
    </div>
  )
}
