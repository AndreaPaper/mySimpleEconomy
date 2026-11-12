import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { App } from '@capacitor/app'
import { localBackend } from './adapter'

/**
 * Il ritorno nell'app, nella modalità locale. Sul telefono l'app resta aperta in
 * sottofondo per giorni: al ritorno girano i job (stipendio arrivato, scadenze dei
 * promemoria passate) e i dati a schermo si aggiornano, invece di mostrare quelli
 * dell'ultima volta finché non scadono in cache.
 */
export default function LocalLifecycle() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const refresh = async () => {
      await (await localBackend()).runJobs()
      await queryClient.invalidateQueries()
    }
    const listener = App.addListener('resume', () => void refresh())
    return () => {
      void listener.then((l) => l.remove())
    }
  }, [queryClient])

  return null
}
