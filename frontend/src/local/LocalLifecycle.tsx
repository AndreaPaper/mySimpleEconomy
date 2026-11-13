import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { App } from '@capacitor/app'
import { localBackend } from './adapter'
import AppUpdatePrompt from './AppUpdatePrompt'
import { requestNotificationPermission } from './notifications'

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
    // Il permesso delle notifiche si chiede qui, senza che nulla lo aspetti: l'app è già
    // aperta e usabile. Quando arriva, i preavvisi dei promemoria si programmano.
    void requestNotificationPermission()
      .then(async (granted) => {
        if (granted) await (await localBackend()).runJobs()
      })
      .catch((error) => console.error('Permesso notifiche non chiesto', error))
    return () => {
      void listener.then((l) => l.remove())
    }
  }, [queryClient])

  // L'avviso degli aggiornamenti dell'app vive qui: come il resto di questo file,
  // esiste solo nella build per il telefono.
  return <AppUpdatePrompt />
}
