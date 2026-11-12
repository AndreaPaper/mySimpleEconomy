import type { Router } from './router'

/**
 * Le rotte del backend locale, una per ogni metodo dei controller Spring portato fin
 * qui. Quelle che mancano rispondono 501 (vedi LocalBackend.handle), così la loro
 * assenza si vede subito invece di passare per un errore qualunque.
 */
export function registerRoutes(router: Router): Router {
  // Lo usa OfflineSyncContext per capire se il server risponde: in locale risponde
  // sempre.
  router.get('/ping', () => 'ok')
  return router
}
