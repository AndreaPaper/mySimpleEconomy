import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { authApi, bankImportApi, excelExportApi, transactionsApi } from './endpoints'

// Non l'elenco degli endpoint — quello si vede leggendo il file — ma le tre
// configurazioni che sono silenziosamente portanti. Nessuna delle tre produce
// un errore se sparisce: producono un'app che si comporta peggio, in modi che
// nessun test di componente noterebbe.

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** Registra un gestore e restituisce la richiesta che lo ha raggiunto. */
function cattura(metodo: 'get' | 'post', percorso: string, risposta: unknown = {}) {
  const catturata: { request?: Request } = {}
  server.use(
    http[metodo](`*/api${percorso}`, ({ request }) => {
      catturata.request = request
      return HttpResponse.json(risposta)
    }),
  )
  return catturata
}

describe('accesso e registrazione', () => {
  /**
   * Accesso e registrazione sono le uniche chiamate che devono aspettare
   * davvero: senza accesso non esiste modalità offline che tenga. Con il timeout
   * predefinito di dieci secondi il login morirebbe ogni volta che Render si
   * sveglia da fermo — che può prendere un minuto — e chi usa l'app vedrebbe
   * "credenziali errate" al posto di "sto aspettando il server".
   *
   * Qui si verifica il lato osservabile: entrambe passano anche quando il
   * fail-fast è acceso. Il timeout a zero si legge nella stessa riga.
   */
  it('passano anche con il backend dichiarato irraggiungibile', async () => {
    const client = (await import('./client')).default
    server.use(http.get('*/api/sveglia', () => HttpResponse.error()))
    await client.get('/sveglia').catch(() => {})

    const accesso = cattura('post', '/auth/login', { token: 't', email: 'a@b.it' })
    await expect(authApi.login('a@b.it', 'password')).resolves.toEqual({ token: 't', email: 'a@b.it' })
    expect(accesso.request).toBeDefined()

    const registrazione = cattura('post', '/auth/register', { token: 't', email: 'a@b.it' })
    await expect(authApi.register('a@b.it', 'password')).resolves.toBeDefined()
    expect(registrazione.request).toBeDefined()
  })
})

describe('import bancario', () => {
  /**
   * La sorgente va in stringa di query e non nel corpo, perché il corpo è già
   * il file caricato. Spostarla dentro il {@code FormData} sembrerebbe più
   * ordinato e il backend la leggerebbe come assente: l'import fallirebbe con
   * un messaggio che non parla della sorgente.
   */
  it('la sorgente viaggia in stringa di query, non nel corpo', async () => {
    const catturata = cattura('post', '/import/bank/analyze', { rows: [] })

    await bankImportApi.analyze('INTESA_SANPAOLO', new File(['x'], 'estratto.xlsx'))

    expect(new URL(catturata.request!.url).searchParams.get('source')).toBe('INTESA_SANPAOLO')
  })
})

describe('export', () => {
  /**
   * {@code responseType: 'blob'} non cambia la richiesta ma la risposta: senza,
   * axios interpreta i byte del file come testo e il .xlsx scaricato si apre
   * corrotto. È il tipo di guasto che nessuna prova automatica di rete rileva,
   * perché la chiamata riesce.
   */
  it('scarica il file come dati binari e non come testo', async () => {
    server.use(
      http.get('*/api/export/excel', () =>
        HttpResponse.arrayBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        }),
      ),
    )

    const scaricato = await excelExportApi.download()

    // Un Blob, non una stringa: è la differenza fra un file che si apre e uno no.
    expect(scaricato).toBeInstanceOf(Blob)
  })

  it('passa i filtri come parametri', async () => {
    const catturata = cattura('get', '/export/excel')

    await excelExportApi.download({ from: '2026-03-01', to: '2026-03-31', categoryId: 'cat-1' })

    const params = new URL(catturata.request!.url).searchParams
    expect(params.get('from')).toBe('2026-03-01')
    expect(params.get('to')).toBe('2026-03-31')
    expect(params.get('categoryId')).toBe('cat-1')
  })
})

describe('elenco transazioni', () => {
  // I parametri non valorizzati non devono comparire: un `categoryId=undefined`
  // filtrerebbe su una categoria inesistente e l'elenco tornerebbe vuoto.
  it('non manda parametri vuoti', async () => {
    const catturata = cattura('get', '/transactions', { content: [], hasNext: false })

    await transactionsApi.list({ from: '2026-03-01' })

    const params = new URL(catturata.request!.url).searchParams
    expect(params.get('from')).toBe('2026-03-01')
    expect(params.has('categoryId')).toBe(false)
  })
})
