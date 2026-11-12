import type { LocalDatabase } from '../db/database'
import {
  atEndOfMonth,
  plusMonthsYm,
  today as todayDate,
  yearMonthOf,
  type IsoDate,
  type YearMonth,
} from '../dates'
import { newId, nowIso } from '../ids'
import { toCents, toEurosOrNull, type Cents } from '../money'
import { badRequest, notFound } from '../router'
import { bodyOf, optionalDate, optionalNumber, requiredDate, requiredString } from '../validate'
import { findCategory } from './categories'
import { readInterval } from './recurring'
import { nextOccurrence, type IntervalUnit } from './schedule'

// Porting di ExpenseReminderService, ExpenseReminderGenerationService e
// ExpenseReminderAdvancementService.

export interface ReminderRow {
  id: string
  category_id: string | null
  name: string
  amount: number | null // centesimi
  interval_unit: IntervalUnit
  interval_value: number
  start_date: IsoDate
  next_due_date: IsoDate
  end_date: IsoDate | null
  active: number
  notify_days_before: number | null
  last_notified_due_date: IsoDate | null
  created_at: string
}

interface ReminderWithCategory extends ReminderRow {
  category_name: string | null
  category_icon: string | null
  category_color: string | null
}

const SELECT = `
  SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM expense_reminders r LEFT JOIN categories c ON c.id = r.category_id`

/** Attivo e non oltre la data di fine, rispetto a quel giorno (ExpenseReminder.isCurrentlyActive). */
export function reminderActiveOn(r: ReminderRow, date: IsoDate): boolean {
  return r.active === 1 && (r.end_date === null || r.end_date >= date)
}

export const advance = (r: ReminderRow, date: IsoDate) =>
  nextOccurrence(date, r.start_date, r.interval_unit, r.interval_value)

function response(r: ReminderWithCategory) {
  return {
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    categoryColor: r.category_color,
    name: r.name,
    amount: toEurosOrNull(r.amount),
    intervalUnit: r.interval_unit,
    intervalValue: r.interval_value,
    startDate: r.start_date,
    nextDueDate: r.next_due_date,
    endDate: r.end_date,
    active: r.active === 1,
    notifyDaysBefore: r.notify_days_before,
  }
}

function findReminder(db: LocalDatabase, id: string): ReminderRow {
  const row = db.get<ReminderRow>('SELECT * FROM expense_reminders WHERE id = :id', { id })
  if (!row) throw notFound('Promemoria non trovato')
  return row
}

const responseById = (db: LocalDatabase, id: string) =>
  response(db.get<ReminderWithCategory>(`${SELECT} WHERE r.id = :id`, { id })!)

function readRequest(db: LocalDatabase, raw: unknown) {
  const body = bodyOf(raw)
  const categoryId = requiredString(body, 'categoryId')
  if (findCategory(db, categoryId).type !== 'EXPENSE') {
    throw badRequest('La categoria di un promemoria deve essere di tipo uscita')
  }
  const amount = optionalNumber(body, 'amount')
  if (amount !== null && amount < 0.01) throw badRequest("L'importo deve essere maggiore di zero")
  const notifyDaysBefore = optionalNumber(body, 'notifyDaysBefore')
  if (notifyDaysBefore !== null && (!Number.isInteger(notifyDaysBefore) || notifyDaysBefore < 0)) {
    throw badRequest('I giorni di preavviso non possono essere negativi')
  }
  return {
    categoryId,
    name: requiredString(body, 'name'),
    amount: amount === null ? null : toCents(amount),
    ...readInterval(body),
    startDate: requiredDate(body, 'startDate'),
    nextDueDate: requiredDate(body, 'nextDueDate'),
    endDate: optionalDate(body, 'endDate'),
    notifyDaysBefore,
  }
}

export function listReminders(db: LocalDatabase) {
  return db.all<ReminderWithCategory>(`${SELECT} ORDER BY r.next_due_date, r.created_at`).map(response)
}

export function createReminder(db: LocalDatabase, raw: unknown) {
  const r = readRequest(db, raw)
  const id = newId()
  db.run(
    `INSERT INTO expense_reminders (id, category_id, name, amount, interval_unit, interval_value, start_date,
       next_due_date, end_date, active, notify_days_before, created_at)
     VALUES (:id, :categoryId, :name, :amount, :intervalUnit, :intervalValue, :startDate, :nextDueDate, :endDate, 1,
       :notifyDaysBefore, :now)`,
    { id, ...r, now: nowIso() },
  )
  return responseById(db, id)
}

export function updateReminder(db: LocalDatabase, id: string, raw: unknown) {
  findReminder(db, id)
  const r = readRequest(db, raw)
  db.run(
    `UPDATE expense_reminders SET category_id = :categoryId, name = :name, amount = :amount,
       interval_unit = :intervalUnit, interval_value = :intervalValue, start_date = :startDate,
       next_due_date = :nextDueDate, end_date = :endDate, notify_days_before = :notifyDaysBefore WHERE id = :id`,
    { id, ...r },
  )
  return responseById(db, id)
}

export function setReminderActive(db: LocalDatabase, id: string, active: boolean): void {
  findReminder(db, id)
  db.run('UPDATE expense_reminders SET active = :active WHERE id = :id', { id, active })
}

/** L'ultima spesa registrata nella categoria (findFirst…OrderByOccurredOnDesc), o null. */
export function lastExpenseInCategory(db: LocalDatabase, categoryId: string): Cents | null {
  return (
    db.get<{ amount: number }>(
      `SELECT amount FROM transactions WHERE category_id = :categoryId AND type = 'EXPENSE'
       ORDER BY occurred_on DESC, created_at DESC LIMIT 1`,
      { categoryId },
    )?.amount ?? null
  )
}

/**
 * Le scadenze dei prossimi mesi, mese per mese, con l'importo: quello del promemoria,
 * o l'ultima spesa della sua categoria marcata come stima.
 */
export function upcomingReminders(db: LocalDatabase, query: Record<string, string | undefined>, today = todayDate()) {
  const months = query.months === undefined ? 3 : Number(query.months)
  if (!Number.isInteger(months) || months < 1 || months > 24) throw badRequest('Il parametro months non è valido')
  const currentMonth = yearMonthOf(today)
  const horizonEnd = atEndOfMonth(plusMonthsYm(currentMonth, months - 1))

  const byMonth = new Map<YearMonth, { reminderId: string; name: string; date: IsoDate; amount: number | null; estimated: boolean }[]>()
  for (const r of db.all<ReminderRow>('SELECT * FROM expense_reminders WHERE active = 1')) {
    let amount: Cents | null = r.amount
    let estimated = false
    if (amount === null && r.category_id !== null) {
      amount = lastExpenseInCategory(db, r.category_id)
      estimated = amount !== null
    }
    for (let cursor = r.next_due_date; cursor <= horizonEnd && reminderActiveOn(r, cursor); cursor = advance(r, cursor)) {
      const list = byMonth.get(yearMonthOf(cursor)) ?? []
      list.push({ reminderId: r.id, name: r.name, date: cursor, amount: toEurosOrNull(amount), estimated })
      byMonth.set(yearMonthOf(cursor), list)
    }
  }

  const result = []
  for (let i = 0; i < months; i++) {
    const ym = plusMonthsYm(currentMonth, i)
    // L'ordinamento è stabile: a parità di data resta l'ordine di lettura.
    result.push({ yearMonth: ym, occurrences: (byMonth.get(ym) ?? []).sort((a, b) => a.date.localeCompare(b.date)) })
  }
  return { months: result }
}

/**
 * La spesa fissa del mese per un promemoria: un segnaposto datato al primo del mese,
 * creato una volta sola (ExpenseReminderGenerationService.generateForMonth).
 */
export function generateReminderForMonth(db: LocalDatabase, reminderId: string, month: YearMonth): boolean {
  const r = db.get<ReminderRow>('SELECT * FROM expense_reminders WHERE id = :id', { id: reminderId })
  if (!r || r.active !== 1 || r.category_id === null) return false
  const monthStart = `${month}-01`
  if (
    db.get('SELECT 1 AS x FROM transactions WHERE expense_reminder_id = :id AND occurred_on BETWEEN :from AND :to', {
      id: r.id,
      from: monthStart,
      to: atEndOfMonth(month),
    })
  ) {
    return false
  }
  const amount = r.amount ?? lastExpenseInCategory(db, r.category_id)
  if (amount === null) return false // nessun prezzo e nessuno storico da cui stimarlo
  db.run(
    `INSERT INTO transactions (id, category_id, expense_reminder_id, amount, type, occurred_on, description,
       import_provisional, created_at)
     VALUES (:id, :category, :reminder, :amount, 'EXPENSE', :date, :name, 0, :now)`,
    { id: newId(), category: r.category_id, reminder: r.id, amount, date: monthStart, name: r.name, now: nowIso() },
  )
  return true
}

/** Porta avanti la scadenza dei promemoria già passati (ExpenseReminderAdvancementService). */
export function advanceDueReminder(db: LocalDatabase, reminderId: string, today: IsoDate): boolean {
  const r = db.get<ReminderRow>('SELECT * FROM expense_reminders WHERE id = :id', { id: reminderId })
  if (!r) return false
  let due = r.next_due_date
  while (reminderActiveOn(r, today) && due <= today) due = advance(r, due)
  let changed = false
  if (due !== r.next_due_date) {
    db.run('UPDATE expense_reminders SET next_due_date = :due WHERE id = :id', { id: r.id, due })
    changed = true
  }
  if (r.active === 1 && !reminderActiveOn(r, today)) {
    db.run('UPDATE expense_reminders SET active = 0 WHERE id = :id', { id: r.id })
    changed = true
  }
  return changed
}

/** Vero se il promemoria ha una scadenza in quel mese, a partire dalla sua prossima. */
export function reminderDueInMonth(r: ReminderRow, month: YearMonth): boolean {
  const end = atEndOfMonth(month)
  for (let cursor = r.next_due_date; cursor <= end && reminderActiveOn(r, cursor); cursor = advance(r, cursor)) {
    if (cursor >= `${month}-01`) return true
  }
  return false
}

