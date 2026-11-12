import axios, { AxiosError } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { localAdapter, useLocalBackend } from './adapter'
import { LocalBackend } from './backend'
import { memoryStorage } from './db/database'

// Il collegamento fra il client delle API e il backend locale. È il punto da cui
// passa tutta la modalità locale: se qui una risposta o un errore cambiano forma,
// ogni pagina se ne accorge.

const client = axios.create({ baseURL: '/api', adapter: localAdapter })

afterEach(() => useLocalBackend(null))

describe("l'adattatore della modalità locale", () => {
  it('consegna la richiesta al backend locale e ne restituisce la risposta', async () => {
    useLocalBackend(LocalBackend.open(memoryStorage))

    const response = await client.get('/ping')

    expect(response.status).toBe(200)
    expect(response.data).toBe('ok')
  })

  /**
   * Una funzione del server non ancora portata: un errore con un messaggio che si può
   * mostrare, nella forma degli errori di Spring. Le pagine leggono
   * response.data.message.
   */
  it('una rotta che non esiste ancora risponde 501 con un messaggio leggibile', async () => {
    useLocalBackend(LocalBackend.open(memoryStorage))

    const error = await client.get('/qualcosa-che-non-ce').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AxiosError)
    const response = (error as AxiosError<{ message: string; status: number; path: string }>).response!
    expect(response.status).toBe(501)
    expect(response.data).toMatchObject({
      status: 501,
      message: 'Questa funzione non è ancora disponibile nella versione per il telefono.',
      path: '/api/qualcosa-che-non-ce',
    })
  })
})
