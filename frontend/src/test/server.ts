import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { defaultHandlers } from './handlers'

export const server = setupServer(...defaultHandlers)

/**
 * Da chiamare una volta nel corpo di un file di test, prima dei `describe`.
 * Registra il ciclo di vita di MSW e, fra un test e l'altro, spegne il
 * fail-fast "backend irraggiungibile".
 *
 * Non sta in `setup.ts` di proposito: `client.test.ts`, `endpoints.test.ts` e i
 * test dei context avviano ognuno il proprio `setupServer()`, e due server vivi
 * insieme significano due serie di intercettori sovrapposti.
 */
export function setupApiMocks(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(async () => {
    await resetBackendUnreachable()
    server.resetHandlers()
  })
  afterAll(() => server.close())
}

/**
 * Il fail-fast è uno stato del *modulo* `src/api/client.ts`, condiviso da tutti
 * i test di un file: un test che simula la rete giù lo lascia acceso, e i
 * successivi vengono rifiutati prima ancora di arrivare a MSW — fallendo per un
 * motivo che non ha niente a che vedere con quello che dichiarano.
 *
 * Solo una risposta riuscita lo spegne, e `skipUnreachableCheck` è l'unico modo
 * di farne passare una mentre è acceso. L'endpoint di risveglio sta nei gestori
 * predefiniti, quindi questa chiamata non ha bisogno di `server.use()` e non
 * inciampa in `onUnhandledRequest: 'error'`.
 */
export async function resetBackendUnreachable(): Promise<void> {
  const client = (await import('../api/client')).default
  await client.get('/__risveglio__', { skipUnreachableCheck: true }).catch(() => {})
}
