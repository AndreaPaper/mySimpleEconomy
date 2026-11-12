import type { LocalDatabase } from './db/database'
import { plusMonthsYm, today as todayDate, yearMonthOf, type IsoDate, type YearMonth } from './dates'
import { processDueRule } from './services/recurringGeneration'
import {
  advanceDueReminder,
  generateReminderForMonth,
  reminderDueInMonth,
  type ReminderRow,
} from './services/reminders'

const LAST_RUN = 'jobs.lastRun'

/**
 * I job che sul server sono @Scheduled, eseguiti qui all'apertura dell'app e al
 * ritorno. Sul server girano ogni notte; qui l'app può restare chiusa per settimane, e
 * all'apertura recupera quello che è successo nel frattempo, nello stesso ordine:
 *
 * 1. il primo di ogni mese passato da allora, la spesa fissa dei promemoria che
 *    scadono in quel mese (ExpenseReminderGenerationScheduler, il 1° alle 5:05);
 * 2. l'avanzamento delle scadenze dei promemoria già passate
 *    (ExpenseReminderScheduler, ogni giorno alle 5:10);
 * 3. le transazioni delle regole ricorrenti arrivate a scadenza
 *    (RecurringTransactionScheduler, ogni giorno alle 5).
 *
 * Il primo passo va prima del secondo: avanzando, un promemoria rimasto indietro
 * salterebbe i mesi di cui deve ancora registrare la spesa.
 *
 * Lo stesso ordine del server: lì la generazione del 1° gira alle 5:05, prima
 * dell'avanzamento delle 5:10.
 *
 * Il quarto job del server, le email di preavviso, qui sono le notifiche Android:
 * vedi notifications.ts.
 *
 * Restituisce vero se ha modificato qualcosa, così chi chiama sa se salvare.
 */
export function runDueJobs(db: LocalDatabase, today: IsoDate = todayDate()): boolean {
  return db.transaction(() => {
    const lastRun = db.get<{ value: string }>('SELECT value FROM meta WHERE key = :key', { key: LAST_RUN })?.value
    let changed = false

    // Alla prima apertura non c'è niente da recuperare: i mesi da considerare sono
    // quelli il cui primo giorno è passato dopo l'ultima esecuzione.
    if (lastRun !== undefined) {
      for (const month of monthsStartedBetween(lastRun, today)) {
        const reminders = db.all<ReminderRow>(
          'SELECT * FROM expense_reminders WHERE active = 1 AND category_id IS NOT NULL',
        )
        for (const r of reminders) {
          if (reminderDueInMonth(r, month)) changed = generateReminderForMonth(db, r.id, month) || changed
        }
      }
    }

    for (const { id } of db.all<{ id: string }>(
      'SELECT id FROM expense_reminders WHERE active = 1 AND next_due_date <= :today',
      { today },
    )) {
      changed = advanceDueReminder(db, id, today) || changed
    }

    for (const { id } of db.all<{ id: string }>(
      'SELECT id FROM recurring_transactions WHERE active = 1 AND next_due_date <= :today',
      { today },
    )) {
      changed = processDueRule(db, id, today) || changed
    }

    if (lastRun !== today) {
      db.run('INSERT INTO meta (key, value) VALUES (:key, :today) ON CONFLICT (key) DO UPDATE SET value = :today', {
        key: LAST_RUN,
        today,
      })
      changed = true
    }
    return changed
  })
}

/** I mesi il cui primo giorno cade dopo `after` e non dopo `until`. */
function monthsStartedBetween(after: IsoDate, until: IsoDate): YearMonth[] {
  const months: YearMonth[] = []
  for (let m = plusMonthsYm(yearMonthOf(after), 1); `${m}-01` <= until; m = plusMonthsYm(m, 1)) months.push(m)
  return months
}
