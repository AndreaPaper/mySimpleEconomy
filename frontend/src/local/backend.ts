import { LocalDatabase, type DatabaseStorage } from './db/database'
import { runDueJobs } from './jobs'
import { syncNotifications } from './notifications'
import { registerRoutes } from './routes'
import { ApiError, Router } from './router'

export interface LocalResponse {
  status: number
  data: unknown
}

/**
 * Il backend che gira dentro l'app: il database e le rotte. Riceve le stesse
 * richieste che il client axios manderebbe al server Spring, e risponde nella stessa
 * forma.
 */
export class LocalBackend {
  readonly db: LocalDatabase
  private readonly router: Router

  private constructor(db: LocalDatabase, router: Router) {
    this.db = db
    this.router = router
  }

  /**
   * @param today il "giorno di oggi" per i job degli arretrati. I test lo fissano; l'app
   *              lascia quello vero.
   */
  static async open(storage: DatabaseStorage, today?: string): Promise<LocalBackend> {
    const db = await LocalDatabase.open(storage)
    const backend = new LocalBackend(db, registerRoutes(new Router()))
    await backend.runJobs(today)
    return backend
  }

  /**
   * I job che sul server partono di notte (ricorrenti, promemoria): qui all'apertura e
   * al ritorno nell'app. Recuperano tutte le scadenze arretrate, quindi non importa da
   * quanti giorni l'app non veniva aperta.
   */
  async runJobs(today?: string): Promise<void> {
    const changed = runDueJobs(this.db, today)
    // Dopo i job: le scadenze dei promemoria possono essere avanzate. Un problema con le
    // notifiche non deve impedire di aprire l'app: i dati contano di più del preavviso.
    let notified = false
    try {
      notified = await syncNotifications(this.db)
    } catch (error) {
      console.error('Notifiche non riallineate', error)
    }
    if (changed || notified) await this.db.save()
  }

  /**
   * Ripristina un backup: il database diventa quello del backup, e i job recuperano
   * quello che è scaduto da quando è stato fatto (stipendi, promemoria, preavvisi).
   */
  async restore(bytes: Uint8Array, today?: string): Promise<void> {
    await this.db.replaceWith(bytes)
    await this.runJobs(today)
  }

  async handle(
    method: string,
    path: string,
    query: Record<string, string | undefined>,
    body: unknown,
  ): Promise<LocalResponse> {
    const route = this.router.match(method, path)
    if (!route) {
      // Una funzione del server non ancora portata in locale: la pagina mostra il
      // messaggio invece di restare vuota senza dire perché.
      throw new ApiError(501, 'Questa funzione non è ancora disponibile nella versione per il telefono.')
    }
    const data = await route.handler({ db: this.db, params: route.params, query, body })
    // Ogni modifica va subito su disco: il telefono può chiudere l'app in qualunque
    // momento, e un salvataggio rimandato andrebbe perso.
    if (method.toUpperCase() !== 'GET') {
      // Un promemoria nuovo o modificato cambia il suo preavviso.
      if (path.startsWith('/expense-reminders') || path.startsWith('/data-cleanup')) {
        await syncNotifications(this.db)
      }
      await this.db.save()
    }
    return { status: data === undefined ? 204 : 200, data: data ?? '' }
  }
}
