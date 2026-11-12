import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { LocalBackend } from './backend'
import { ApiError } from './router'
import { platformStorage } from './storage'

let backend: Promise<LocalBackend> | null = null

/** Il backend locale, aperto alla prima richiesta e poi riusato. */
export function localBackend(): Promise<LocalBackend> {
  backend ??= LocalBackend.open(platformStorage())
  return backend
}

/** Per i test: un backend già aperto su uno storage scelto da loro. */
export function setLocalBackend(instance: Promise<LocalBackend> | null) {
  backend = instance
}

/**
 * L'adattatore axios della modalità locale: invece di mandare la richiesta in rete la
 * consegna al backend locale, e ne restituisce la risposta come se arrivasse dal
 * server. Gli errori hanno la forma di quelli di Spring ({status, error, message,
 * path}) dentro un AxiosError, perché è così che le pagine li leggono.
 */
export async function localAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method ?? 'get').toUpperCase()
  const path = (config.url ?? '').split('?')[0]
  const query = toQuery(config.url ?? '', config.params)
  const body = parseBody(config.data)

  try {
    const response = await (await localBackend()).handle(method, path, query, body)
    return {
      data: response.data,
      status: response.status,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
      request: undefined,
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    // Un errore inatteso del backend locale (un bug) resta visibile nella console:
    // sul server finirebbe nel log di Render.
    if (!(error instanceof ApiError)) console.error('Errore nel backend locale', error)
    const message = error instanceof Error ? error.message : String(error)
    const response: AxiosResponse = {
      data: { status, error: status >= 500 ? 'Internal Server Error' : 'Bad Request', message, path: `/api${path}` },
      status,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
      request: undefined,
    }
    throw new AxiosError(message, AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
  }
}

function toQuery(url: string, params: unknown): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {}
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  new URLSearchParams(search).forEach((value, key) => (query[key] = value))
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value !== undefined && value !== null) query[key] = String(value)
    }
  }
  return query
}

// axios ha già trasformato il corpo in stringa JSON (transformRequest): lo si
// riporta a oggetto. I FormData (upload) passano così come sono.
function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data
  if (data === '') return undefined
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}
