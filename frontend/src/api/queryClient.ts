import { QueryClient } from '@tanstack/react-query'

// La cache dei dati letti dal backend.
//
// Prima ogni pagina, montando, rifaceva tutte le sue richieste e aspettava con
// lo scheletro, anche per dati visti un attimo prima. Con il backend su Render
// e il database su Neon una richiesta costa ~0,5 s a regime e ~2 s dopo una
// pausa: ogni navigazione pagava quel prezzo.

// L'app è monoutente: i dati cambiano solo quando si scrive (e ogni scrittura
// invalida tutto, vedi useInvalidateAll), quando girano i job notturni o quando
// arriva la sincronizzazione offline. Entro questo tempo una pagina già vista si
// apre senza nessuna richiesta; dopo, si apre coi dati in cache e si aggiorna in
// sottofondo.
export const STALE_TIME_MS = 5 * 60 * 1000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        // Le pagine viste all'inizio della sessione restano in cache.
        gcTime: 30 * 60 * 1000,
        // Il client ha già il suo fail-fast quando il backend non risponde
        // (api/client.ts). I tre tentativi predefiniti, con la loro attesa
        // crescente, ritarderebbero di ~7 s la comparsa dello stato offline.
        retry: false,
        // refetchOnWindowFocus resta attivo (predefinito): tornando sulla
        // scheda si aggiornano in sottofondo solo le query già scadute.
      },
    },
  })
}
