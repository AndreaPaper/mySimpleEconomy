import type { LocalDatabase } from './db/database'

/**
 * Un errore con lo status HTTP che il backend Java avrebbe restituito. Le pagine
 * leggono `response.data.message` e a volte lo status (404, 409): restituirli uguali
 * è ciò che permette di non toccare l'interfaccia.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const notFound = (message: string) => new ApiError(404, message)
export const badRequest = (message: string) => new ApiError(400, message)
export const conflict = (message: string) => new ApiError(409, message)

export interface LocalRequest {
  db: LocalDatabase
  params: Record<string, string>
  query: Record<string, string | undefined>
  // Il corpo così come arriva da endpoints.ts: un oggetto JSON, o un FormData per
  // gli upload (l'import Excel).
  body: unknown
}

export type Handler = (request: LocalRequest) => unknown | Promise<unknown>

interface Route {
  method: string
  pattern: RegExp
  names: string[]
  handler: Handler
}

/**
 * L'equivalente dei controller Spring: "METODO /percorso/{param}" → funzione.
 *
 * I percorsi si scrivono come nei controller, con i parametri fra graffe, e senza
 * il prefisso /api (che sta nella baseURL del client axios).
 */
export class Router {
  private readonly routes: Route[] = []

  add(method: string, path: string, handler: Handler): this {
    const names: string[] = []
    const pattern = new RegExp(
      '^' +
        path.replace(/\{(\w+)\}/g, (_, name: string) => {
          names.push(name)
          return '([^/]+)'
        }) +
        '/?$',
    )
    this.routes.push({ method: method.toUpperCase(), pattern, names, handler })
    return this
  }

  get = (path: string, handler: Handler) => this.add('GET', path, handler)
  post = (path: string, handler: Handler) => this.add('POST', path, handler)
  put = (path: string, handler: Handler) => this.add('PUT', path, handler)
  delete = (path: string, handler: Handler) => this.add('DELETE', path, handler)

  /** La rotta per metodo e percorso, con i parametri estratti; null se non c'è. */
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue
      const found = route.pattern.exec(path)
      if (!found) continue
      const params: Record<string, string> = {}
      route.names.forEach((name, i) => (params[name] = decodeURIComponent(found[i + 1])))
      return { handler: route.handler, params }
    }
    return null
  }
}
