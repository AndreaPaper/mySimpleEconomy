import { Capacitor } from '@capacitor/core'
import type { LocalDatabase } from './db/database'
import { daysBetween, plusDays, today as todayDate, type IsoDate } from './dates'
import type { ReminderRow } from './services/reminders'

// Il preavviso dei promemoria. Sul server è un'email delle 8 di mattina
// (ExpenseReminderNotificationScheduler); sul telefono è una notifica Android,
// programmata in anticipo: arriva anche se l'app è chiusa.

/** L'ora del preavviso, come l'email del server. */
const NOTIFY_HOUR = 8

/** Le notifiche programmate al giro precedente, per promemoria: scadenza e ora. */
export type ScheduledMap = Record<string, { due: IsoDate; at: string }>

const SCHEDULED = 'notifications.scheduled'

export interface PlannedNotification {
  id: number
  reminderId: string
  dueDate: IsoDate
  // null = subito: il preavviso era già da dare (promemoria creato o spostato dentro
  // la finestra di preavviso).
  at: Date | null
  title: string
  body: string
}

/**
 * Le notifiche da programmare: una per promemoria, per la sua prossima scadenza.
 *
 * Il preavviso si dà il giorno (scadenza − giorni di preavviso) alle 8. Se quel momento
 * è già passato ma la scadenza no, e per questa scadenza non c'è ancora stata notifica,
 * si dà subito. Già data, o scadenza passata: niente.
 *
 * "Già data" vuol dire due cose: segnata in last_notified_due_date (come shouldNotify del
 * server), oppure programmata al giro precedente per un'ora ormai passata — in quel caso
 * Android l'ha mostrata anche ad app chiusa, e ridarla alla riapertura sarebbe un doppione.
 *
 * Solo la prossima scadenza: quando passa, i job spostano il promemoria alla successiva
 * e la notifica successiva si programma al giro dopo.
 */
export function planNotifications(
  db: LocalDatabase,
  now: Date = new Date(),
  scheduled: ScheduledMap = {},
): PlannedNotification[] {
  const today = todayDate(now)
  const planned: PlannedNotification[] = []
  for (const r of db.all<ReminderRow>(
    'SELECT * FROM expense_reminders WHERE active = 1 AND notify_days_before IS NOT NULL',
  )) {
    const due = r.next_due_date
    if (due < today || (r.end_date !== null && r.end_date < due)) continue
    const notifyOn = plusDays(due, -r.notify_days_before!)
    const at = atHour(notifyOn, NOTIFY_HOUR)
    if (at > now) {
      planned.push({ id: notificationId(r.id), reminderId: r.id, dueDate: due, at, ...text(r.name, due, notifyOn) })
    } else if (r.last_notified_due_date !== due && !firedWhileClosed(scheduled[r.id], due, now)) {
      planned.push({ id: notificationId(r.id), reminderId: r.id, dueDate: due, at: null, ...text(r.name, due, today) })
    }
  }
  return planned
}

/**
 * Riallinea le notifiche del telefono ai promemoria: cancella quelle in attesa e
 * programma quelle di planNotifications. Le notifiche "subito" segnano la scadenza
 * come notificata, così non si ripetono a ogni apertura.
 *
 * Fuori da Android non fa niente: nel browser e nei test non ci sono notifiche.
 */
export async function syncNotifications(db: LocalDatabase): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    const asked = await LocalNotifications.requestPermissions()
    if (asked.display !== 'granted') return false
  }

  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length > 0) await LocalNotifications.cancel({ notifications: pending.notifications })

  const scheduled = readScheduled(db)
  // Quelle già scattate ad app chiusa diventano "date", come se l'app le avesse viste:
  // al giro dopo la mappa non le avrà più, e senza questo ripartirebbero.
  const now = new Date()
  for (const [reminderId, previous] of Object.entries(scheduled)) {
    if (new Date(previous.at) <= now) {
      db.run('UPDATE expense_reminders SET last_notified_due_date = :due WHERE id = :id', { id: reminderId, due: previous.due })
    }
  }
  const planned = planNotifications(db, now, scheduled)
  const next: ScheduledMap = {}
  for (const n of planned) if (n.at) next[n.reminderId] = { due: n.dueDate, at: n.at.toISOString() }
  db.run('INSERT INTO meta (key, value) VALUES (:key, :value) ON CONFLICT (key) DO UPDATE SET value = :value', {
    key: SCHEDULED,
    value: JSON.stringify(next),
  })
  if (planned.length === 0) return true
  await LocalNotifications.schedule({
    notifications: planned.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      // "Subito" vuol dire fra qualche secondo: un orario nel passato Android lo
      // scarterebbe.
      schedule: { at: n.at ?? new Date(Date.now() + 3000), allowWhileIdle: true },
    })),
  })

  for (const n of planned.filter((p) => p.at === null)) {
    db.run('UPDATE expense_reminders SET last_notified_due_date = :due WHERE id = :id', { id: n.reminderId, due: n.dueDate })
  }
  return true
}

function readScheduled(db: LocalDatabase): ScheduledMap {
  const value = db.get<{ value: string }>('SELECT value FROM meta WHERE key = :key', { key: SCHEDULED })?.value
  return value ? (JSON.parse(value) as ScheduledMap) : {}
}

function firedWhileClosed(previous: ScheduledMap[string] | undefined, due: IsoDate, now: Date): boolean {
  return previous !== undefined && previous.due === due && new Date(previous.at) <= now
}

/** Il testo dell'email del server (EmailNotificationService), visto dal giorno `from`. */
function text(name: string, due: IsoDate, from: IsoDate): { title: string; body: string } {
  const daysAway = daysBetween(from, due)
  const when = daysAway <= 0 ? 'oggi' : daysAway === 1 ? 'tra 1 giorno' : `tra ${daysAway} giorni`
  const [y, m, d] = due.split('-')
  return {
    title: `Promemoria: ${name} ${when}`,
    body: `Il promemoria "${name}" scade il ${d}/${m}/${y} (${when}).`,
  }
}

function atHour(date: IsoDate, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour, 0, 0)
}

/** Android vuole id interi: uno stabile per promemoria, ricavato dal suo UUID. */
function notificationId(reminderId: string): number {
  let hash = 0
  for (const ch of reminderId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 2_000_000_000
}
