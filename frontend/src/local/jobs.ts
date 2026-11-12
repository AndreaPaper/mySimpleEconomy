import type { LocalDatabase } from './db/database'

/**
 * I job che sul server sono @Scheduled, eseguiti qui all'apertura dell'app e al
 * ritorno: generazione delle ricorrenti, dei promemoria, avanzamento delle scadenze.
 *
 * Restituisce vero se ha modificato qualcosa, così chi chiama sa se salvare.
 * Riempito nella fase 2, insieme alle ricorrenti e ai promemoria.
 */
export function runDueJobs(db: LocalDatabase, today?: string): boolean {
  void db
  void today
  return false
}
