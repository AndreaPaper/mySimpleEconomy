import type { LocalDatabase } from '../db/database'
import { newId, nowIso } from '../ids'
import { toCents, toEuros } from '../money'
import { badRequest, notFound } from '../router'
import {
  bodyOf,
  optionalString,
  requiredDate,
  requiredEnum,
  requiredNumber,
  requiredString,
} from '../validate'
import { findCategory } from './categories'

// Porting di TransactionService.

export type TransactionType = 'INCOME' | 'EXPENSE'

export interface TransactionRow {
  id: string
  category_id: string
  recurring_transaction_id: string | null
  expense_reminder_id: string | null
  amount: number // centesimi
  type: TransactionType
  occurred_on: string
  description: string | null
  import_source: string | null
  import_fingerprint: string | null
  import_provisional: number
  created_at: string
}

interface TransactionWithCategory extends TransactionRow {
  category_name: string
  category_icon: string | null
  category_color: string | null
}

const SELECT = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t JOIN categories c ON c.id = t.category_id`

// Il più recente per primo: la pagina Transazioni raggruppa per mese scorrendo
// l'elenco, e assume quest'ordine.
const MOST_RECENT_FIRST = 'ORDER BY t.occurred_on DESC, t.created_at DESC, t.rowid DESC'

function response(row: TransactionWithCategory) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    amount: toEuros(row.amount),
    type: row.type,
    occurredOn: row.occurred_on,
    description: row.description,
    recurringTransactionId: row.recurring_transaction_id,
  }
}

export function findTransactionRow(db: LocalDatabase, id: string): TransactionRow {
  const row = db.get<TransactionRow>('SELECT * FROM transactions WHERE id = :id', { id })
  if (!row) throw notFound('Transazione non trovata')
  return row
}

function responseById(db: LocalDatabase, id: string) {
  return response(db.get<TransactionWithCategory>(`${SELECT} WHERE t.id = :id`, { id })!)
}

/**
 * Con un intervallo di date l'elenco è completo, non paginato: Dashboard ed export si
 * aspettano tutto il periodo. Senza date, l'archivio a pagine.
 */
export function listTransactions(db: LocalDatabase, query: Record<string, string | undefined>) {
  let from = query.from ? requiredDate({ from: query.from }, 'from') : null
  let to = query.to ? requiredDate({ to: query.to }, 'to') : null
  const categoryId = query.categoryId ?? null
  const page = query.page === undefined ? 0 : Number(query.page)
  const size = query.size === undefined ? 30 : Number(query.size)
  if (!Number.isInteger(page) || page < 0) throw badRequest('Il parametro page non è valido')
  if (!Number.isInteger(size) || size < 1 || size > 100) throw badRequest('Il parametro size non è valido')

  const byCategory = categoryId ? 'AND t.category_id = :categoryId' : ''

  if (from !== null || to !== null) {
    from ??= '1900-01-01'
    to ??= '2999-12-31'
    const rows = db.all<TransactionWithCategory>(
      `${SELECT} WHERE t.occurred_on BETWEEN :from AND :to ${byCategory} ${MOST_RECENT_FIRST}`,
      { from, to, categoryId },
    )
    return { content: rows.map(response), hasNext: false }
  }

  // Una riga in più per sapere se c'è una pagina dopo, come fa Slice.
  const rows = db.all<TransactionWithCategory>(
    `${SELECT} WHERE 1 = 1 ${byCategory} ${MOST_RECENT_FIRST} LIMIT :limit OFFSET :offset`,
    { categoryId, limit: size + 1, offset: page * size },
  )
  return { content: rows.slice(0, size).map(response), hasNext: rows.length > size }
}

function readRequest(db: LocalDatabase, raw: unknown) {
  const body = bodyOf(raw)
  const categoryId = requiredString(body, 'categoryId')
  const amount = requiredNumber(body, 'amount')
  if (amount < 0.01) throw badRequest("L'importo deve essere maggiore di zero")
  const request = {
    categoryId,
    amount: toCents(amount),
    type: requiredEnum(body, 'type', ['INCOME', 'EXPENSE'] as const),
    occurredOn: requiredDate(body, 'occurredOn'),
    description: optionalString(body, 'description', 255),
  }
  findCategory(db, categoryId)
  return request
}

export function createTransaction(db: LocalDatabase, raw: unknown) {
  const r = readRequest(db, raw)
  const id = newId()
  db.run(
    `INSERT INTO transactions (id, category_id, amount, type, occurred_on, description, import_provisional, created_at)
     VALUES (:id, :categoryId, :amount, :type, :occurredOn, :description, 0, :now)`,
    { id, ...r, now: nowIso() },
  )
  return responseById(db, id)
}

export function updateTransaction(db: LocalDatabase, id: string, raw: unknown) {
  findTransactionRow(db, id)
  const r = readRequest(db, raw)
  db.run(
    `UPDATE transactions SET category_id = :categoryId, amount = :amount, type = :type,
       occurred_on = :occurredOn, description = :description WHERE id = :id`,
    { id, ...r },
  )
  return responseById(db, id)
}

export function deleteTransaction(db: LocalDatabase, id: string): void {
  findTransactionRow(db, id)
  db.run('DELETE FROM transactions WHERE id = :id', { id })
}
