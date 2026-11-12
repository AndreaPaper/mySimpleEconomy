import type { AxiosAdapter } from 'axios'
import { afterEach, beforeEach } from 'vitest'
import client from '../api/client'
import { localAdapter, setLocalBackend } from './adapter'
import { LocalBackend } from './backend'
import { memoryStorage } from './db/database'

/**
 * Per i test di parità: un backend locale nuovo, su un database vuoto, collegato al
 * client delle API vero. I test chiamano le stesse funzioni di endpoints.ts che usano
 * le pagine, quindi provano tutto il percorso — client, adattatore, router, service,
 * SQL — e non solo i service.
 *
 * Restituisce una funzione che dà il backend del test in corso (per guardare nel
 * database quello che le API non espongono).
 */
export function withFreshLocalBackend(today?: string): () => LocalBackend {
  let current: LocalBackend
  let originalAdapter: AxiosAdapter | undefined

  beforeEach(async () => {
    const opening = LocalBackend.open(memoryStorage, today)
    setLocalBackend(opening)
    current = await opening
    originalAdapter = client.defaults.adapter as AxiosAdapter | undefined
    client.defaults.adapter = localAdapter
  })

  afterEach(() => {
    client.defaults.adapter = originalAdapter
    setLocalBackend(null)
  })

  return () => current
}

/** Lo status e il messaggio di un errore del backend, per asserirli insieme. */
export async function apiError(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await promise
  } catch (error) {
    const response = (error as { response?: { status: number; data: { message: string } } }).response
    if (!response) throw error
    return { status: response.status, message: response.data.message }
  }
  throw new Error('La chiamata doveva fallire, ed è riuscita')
}
