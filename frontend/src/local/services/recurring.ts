import type { LocalDatabase } from '../db/database'
import { today as todayDate, type IsoDate } from '../dates'
import { newId, nowIso } from '../ids'
import { toCents, toEuros } from '../money'
import { badRequest, conflict, notFound } from '../router'
import {
  bodyOf,
  optionalDate,
  optionalString,
  requiredDate,
  requiredEnum,
  requiredNumber,
  requiredString,
  type Body,
} from '../validate'
import { findCategory } from './categories'
import { processDueRule, type RecurringRow } from './recurringGeneration'
import type { IntervalUnit } from './schedule'

// Porting di RecurringTransactionService.

export const INTERVAL_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const

interface RecurringWithCategory extends RecurringRow {
  category_name: string
  category_type: string
  category_icon: string | null
  category_color: string | null
}

const SELECT = `
  SELECT r.*, c.name AS category_name, c.type AS category_type, c.icon AS category_icon, c.color AS category_color
  FROM recurring_transactions r JOIN categories c ON c.id = r.category_id`

function response(row: RecurringWithCategory) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryType: row.category_type,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    name: row.name,
    defaultAmount: toEuros(row.default_amount),
    intervalUnit: row.interval_unit,
    intervalValue: row.interval_value,
    startDate: row.start_date,
    nextDueDate: row.next_due_date,
    endDate: row.end_date,
    active: row.active === 1,
  }
}

function findRule(db: LocalDatabase, id: string): RecurringRow {
  const row = db.get<RecurringRow>('SELECT * FROM recurring_transactions WHERE id = :id', { id })
  if (!row) throw notFound('Transazione ricorrente non trovata')
  return row
}

function responseById(db: LocalDatabase, id: string) {
  return response(db.get<RecurringWithCategory>(`${SELECT} WHERE r.id = :id`, { id })!)
}

/** Unità e numero dell'intervallo, comuni a regole e promemoria. */
export function readInterval(body: Body): { intervalUnit: IntervalUnit; intervalValue: number } {
  const intervalUnit = requiredEnum(body, 'intervalUnit', INTERVAL_UNITS)
  const intervalValue = requiredNumber(body, 'intervalValue')
  if (!Number.isInteger(intervalValue) || intervalValue <= 0) throw badRequest("L'intervallo deve essere positivo")
  return { intervalUnit, intervalValue }
}

function readRequest(db: LocalDatabase, raw: unknown) {
  const body = bodyOf(raw)
  const categoryId = requiredString(body, 'categoryId')
  const amount = requiredNumber(body, 'defaultAmount')
  if (amount < 0.01) throw badRequest("L'importo deve essere maggiore di zero")
  const request = {
    categoryId,
    name: requiredString(body, 'name'),
    defaultAmount: toCents(amount),
    ...readInterval(body),
    startDate: requiredDate(body, 'startDate'),
    nextDueDate: requiredDate(body, 'nextDueDate'),
    endDate: optionalDate(body, 'endDate'),
  }
  findCategory(db, categoryId)
  return request
}

export function listRecurring(db: LocalDatabase) {
  return db.all<RecurringWithCategory>(`${SELECT} ORDER BY r.next_due_date, r.created_at`).map(response)
}

export function createRecurring(db: LocalDatabase, raw: unknown, today: IsoDate = todayDate()) {
  const r = readRequest(db, raw)
  return db.transaction(() => {
    const id = newId()
    db.run(
      `INSERT INTO recurring_transactions (id, category_id, name, default_amount, interval_unit, interval_value,
         start_date, next_due_date, end_date, active, created_at)
       VALUES (:id, :categoryId, :name, :defaultAmount, :intervalUnit, :intervalValue, :startDate, :nextDueDate,
         :endDate, 1, :now)`,
      { id, ...r, now: nowIso() },
    )
    // Le occorrenze già dovute (inizio nel passato) si generano subito, invece di
    // aspettare il prossimo giro dei job.
    processDueRule(db, id, today)
    return responseById(db, id)
  })
}

export function updateRecurring(db: LocalDatabase, id: string, raw: unknown, today: IsoDate = todayDate()) {
  findRule(db, id)
  const r = readRequest(db, raw)
  return db.transaction(() => {
    db.run(
      `UPDATE recurring_transactions SET category_id = :categoryId, name = :name, default_amount = :defaultAmount,
         interval_unit = :intervalUnit, interval_value = :intervalValue, start_date = :startDate,
         next_due_date = :nextDueDate, end_date = :endDate WHERE id = :id`,
      { id, ...r },
    )
    processDueRule(db, id, today)
    return responseById(db, id)
  })
}

export function setRecurringActive(db: LocalDatabase, id: string, active: boolean): void {
  findRule(db, id)
  db.run('UPDATE recurring_transactions SET active = :active WHERE id = :id', { id, active })
}

// Le transazioni già generate restano, scollegate: si cancella la regola con le sue
// eccezioni, non lo storico.
export function deleteRecurring(db: LocalDatabase, id: string): void {
  findRule(db, id)
  db.run('DELETE FROM recurring_transactions WHERE id = :id', { id })
}

interface OverrideRow {
  id: string
  recurring_transaction_id: string
  occurrence_date: string
  override_amount: number
  note: string | null
}

const overrideResponse = (o: OverrideRow) => ({
  id: o.id,
  occurrenceDate: o.occurrence_date,
  overrideAmount: toEuros(o.override_amount),
  note: o.note,
})

export function listOverrides(db: LocalDatabase, ruleId: string) {
  findRule(db, ruleId)
  return db
    .all<OverrideRow>('SELECT * FROM recurring_overrides WHERE recurring_transaction_id = :ruleId ORDER BY occurrence_date', {
      ruleId,
    })
    .map(overrideResponse)
}

export function createOverride(db: LocalDatabase, ruleId: string, raw: unknown) {
  findRule(db, ruleId)
  const body = bodyOf(raw)
  const occurrenceDate = requiredDate(body, 'occurrenceDate')
  const overrideAmount = toCents(requiredNumber(body, 'overrideAmount'))
  const note = optionalString(body, 'note', 255)
  if (
    db.get('SELECT 1 AS x FROM recurring_overrides WHERE recurring_transaction_id = :ruleId AND occurrence_date = :d', {
      ruleId,
      d: occurrenceDate,
    })
  ) {
    throw conflict("Esiste già un'eccezione per questa data")
  }
  const id = newId()
  db.run(
    `INSERT INTO recurring_overrides (id, recurring_transaction_id, occurrence_date, override_amount, note)
     VALUES (:id, :ruleId, :occurrenceDate, :overrideAmount, :note)`,
    { id, ruleId, occurrenceDate, overrideAmount, note },
  )
  return overrideResponse(db.get<OverrideRow>('SELECT * FROM recurring_overrides WHERE id = :id', { id })!)
}

export function deleteOverride(db: LocalDatabase, ruleId: string, overrideId: string): void {
  findRule(db, ruleId)
  const override = db.get<OverrideRow>('SELECT * FROM recurring_overrides WHERE id = :id', { id: overrideId })
  if (!override || override.recurring_transaction_id !== ruleId) throw notFound('Eccezione non trovata')
  db.run('DELETE FROM recurring_overrides WHERE id = :id', { id: overrideId })
}
