import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { navigazioniRichieste, setLocation } from '../test/location'

// Lo strato di rete. Sono quattro comportamenti, nessuno visibile a schermo, e
// tutti e quattro invisibili anche quando si rompono: l'app continua a
// funzionare *male* invece di dare errore.
//
// MSW intercetta a livello di rete e non sostituisce axios: gli interceptor
// restano quindi sotto test, che è tutto il punto — sono loro il codice da
// coprire, non le chiamate che li attraversano.
//
// Il flag `backendUnreachable` è privato del modulo e non si può azzerare
// dall'esterno. Ogni caso ricarica quindi il modulo con `vi.resetModules()` e
// un import dinamico: senza, lo stato di un test finirebbe in quello dopo, ed è
// esattamente lo stato di cui questi test parlano.

const server = setupServer()

/** Una copia fresca del client, con il flag interno azzerato. */
async function clientPulito(): Promise<AxiosInstance> {
  vi.resetModules()
  return (await import('./client')).default
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  // Il client usa `/api` come base: in jsdom diventa http://localhost:3000/api.
  server.use(http.get('*/api/ok', () => HttpResponse.json({ ok: true })))
})

describe('il token', () => {
  it('viene aggiunto alle richieste quando c è', async () => {
    localStorage.setItem('token', 'abc123')
    const client = await clientPulito()
    let ricevuto: string | null = null
    server.use(
      http.get('*/api/ok', ({ request }) => {
        ricevuto = request.headers.get('Authorization')
        return HttpResponse.json({ ok: true })
      }),
    )

    await client.get('/ok')

    expect(ricevuto).toBe('Bearer abc123')
  })

  // Non un'intestazione vuota: proprio nessuna intestazione. Un `Authorization:
  // Bearer null` verrebbe respinto dal backend come token malformato invece che
  // trattato come richiesta anonima.
  it('non viene aggiunto affatto quando manca', async () => {
    const client = await clientPulito()
    let presente = true
    server.use(
      http.get('*/api/ok', ({ request }) => {
        presente = request.headers.has('Authorization')
        return HttpResponse.json({ ok: true })
      }),
    )

    await client.get('/ok')

    expect(presente).toBe(false)
  })
})

describe('backend irraggiungibile', () => {
  it('la prima chiamata fallita accende il fail-fast e avvisa l app', async () => {
    const client = await clientPulito()
    const avvisi = vi.fn()
    window.addEventListener('backend:unreachable', avvisi)
    server.use(http.get('*/api/ok', () => HttpResponse.error()))

    await expect(client.get('/ok')).rejects.toThrow()

    expect(avvisi).toHaveBeenCalledTimes(1)
    window.removeEventListener('backend:unreachable', avvisi)
  })

  /**
   * Il motivo per cui il fail-fast esiste: una volta scoperto che il backend è
   * giù, le chiamate successive devono fallire *subito* invece di aspettare
   * ognuna i propri dieci secondi. Con sei richieste per pagina la differenza è
   * fra un'app che si apre offline all'istante e una che sembra bloccata.
   */
  it('le chiamate successive falliscono subito, senza toccare la rete', async () => {
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => HttpResponse.error()))
    await expect(client.get('/ok')).rejects.toThrow()

    let chiamate = 0
    server.use(
      http.get('*/api/ok', () => {
        chiamate++
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(client.get('/ok')).rejects.toThrow()

    expect(chiamate).toBe(0)
  })

  /**
   * La forma dell'errore conta quanto il fatto che ci sia: mezza app distingue
   * "il backend ha risposto male" da "non ha risposto" guardando
   * `error.response === undefined`. Un rifiuto con una forma diversa passerebbe
   * per un errore applicativo e mostrerebbe un messaggio sbagliato.
   */
  it('il rifiuto immediato ha la stessa forma di un errore di rete', async () => {
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => HttpResponse.error()))
    await expect(client.get('/ok')).rejects.toThrow()

    const errore = await client.get('/ok').catch((e) => e)

    expect(errore.response).toBeUndefined()
    expect(errore.code).toBe('ERR_BACKEND_UNREACHABLE')
  })

  it('una risposta riuscita rimette tutto a posto', async () => {
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => HttpResponse.error()))
    await expect(client.get('/ok')).rejects.toThrow()

    server.use(http.get('*/api/ok', () => HttpResponse.json({ ok: true })))
    // Solo una richiesta che salta il controllo può passare mentre il fail-fast
    // è acceso: è così che il polling riesce a riaprire la porta.
    await client.get('/ok', { skipUnreachableCheck: true })

    await expect(client.get('/ok')).resolves.toBeDefined()
  })

  /**
   * Il test più importante del file. `skipUnreachableCheck` è l'unica via
   * d'uscita dal fail-fast: se smette di funzionare, l'app non si riconnette
   * mai più — nemmeno quando il backend torna su — e chi la usa vede solo
   * un'applicazione che "non torna". Nessun errore, nessun log: resta offline
   * per sempre.
   */
  it('skipUnreachableCheck passa anche col fail-fast acceso', async () => {
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => HttpResponse.error()))
    await expect(client.get('/ok')).rejects.toThrow()

    let chiamate = 0
    server.use(
      http.get('*/api/ok', () => {
        chiamate++
        return HttpResponse.json({ ok: true })
      }),
    )
    await client.get('/ok', { skipUnreachableCheck: true })

    expect(chiamate).toBe(1)
  })

  // Un errore vero del backend (500) non è "irraggiungibile": ha risposto.
  // Accendere il fail-fast qui manderebbe l'app offline per un bug del server.
  it('una risposta di errore non accende il fail-fast', async () => {
    const client = await clientPulito()
    const avvisi = vi.fn()
    window.addEventListener('backend:unreachable', avvisi)
    server.use(http.get('*/api/ok', () => new HttpResponse(null, { status: 500 })))

    await expect(client.get('/ok')).rejects.toThrow()

    expect(avvisi).not.toHaveBeenCalled()
    window.removeEventListener('backend:unreachable', avvisi)
  })
})

describe('la sessione scaduta', () => {
  // La finta `window.location` è installata una volta per tutti i test in
  // src/test/setup.ts: qui basta portarla dove serve. (Prima ne viveva una copia
  // in questo file, e gli altri test che prendono un 401 restavano scoperti,
  // riempiendo il log di "Not implemented: navigation".)
  it('un 401 ripulisce le credenziali e porta al login', async () => {
    setLocation('/dashboard')
    localStorage.setItem('token', 'scaduto')
    localStorage.setItem('email', 'andrea@example.com')
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => new HttpResponse(null, { status: 401 })))

    await expect(client.get('/ok')).rejects.toThrow()

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('email')).toBeNull()
    expect(navigazioniRichieste()).toEqual(['http://localhost:3000/login'])
  })

  /**
   * Se si è già sulla pagina di accesso il reindirizzamento non va fatto:
   * un 401 lì è la risposta normale a una password sbagliata, e ricaricare la
   * pagina cancellerebbe il messaggio di errore prima che si riesca a leggerlo.
   */
  it('un 401 sulla pagina di accesso non ricarica la pagina', async () => {
    setLocation('/login')
    const client = await clientPulito()
    server.use(http.get('*/api/ok', () => new HttpResponse(null, { status: 401 })))

    await expect(client.get('/ok')).rejects.toThrow()

    // Nessuna navigazione richiesta: la guardia sul pathname ha tenuto, quindi
    // il messaggio d'errore della pagina di accesso resta a schermo.
    expect(navigazioniRichieste()).toEqual([])
  })
})
