import type { LocalDatabase } from '../db/database'
import { newId, nowIso } from '../ids'
import { toCents, toEuros, toEurosOrNull, type Cents } from '../money'
import { badRequest, conflict, notFound } from '../router'
import { bodyOf, optionalDate, optionalNumber, requiredNumber, requiredString } from '../validate'
import { findCategory } from './categories'

// Porting di DebtService e di DebtResponse.from. Il pagato non si salva: si somma
// dalle spese della categoria del debito (dopo alreadyPaidAsOf), più il già pagato
// prima di cominciare a tracciarlo.

export interface DebtRow {
  id: string
  category_id: string
  name: string
  total_amount: Cents
  already_paid_amount: Cents
  already_paid_as_of: string | null
  monthly_payment_amount: Cents | null
  active: number
  created_at: string
}

/**
 * Quanto è stato pagato con le spese della categoria, dopo alreadyPaidAsOf
 * (DebtService.countsAsPayment). Quelle del giorno stesso contano se registrate dopo il
 * debito: il form mette come data oggi, e la rata di oggi registrata dopo non è dentro
 * il "già pagato".
 */
export function paidFromTransactions(db: LocalDatabase, debt: DebtRow): Cents {
  return (
    db.get<{ total: number | null }>(
      `SELECT SUM(amount) AS total FROM transactions
       WHERE category_id = :category AND type = 'EXPENSE'
         AND (:asOf IS NULL OR occurred_on > :asOf OR (occurred_on = :asOf AND created_at > :debtCreatedAt))`,
      { category: debt.category_id, asOf: debt.already_paid_as_of, debtCreatedAt: debt.created_at },
    )?.total ?? 0
  )
}

/** Il residuo come lo calcola DebtResponse.from: totale meno pagato, mai sotto zero. */
export function remainingOf(debt: DebtRow, paid: Cents): Cents {
  return Math.max(debt.total_amount - (debt.already_paid_amount + paid), 0)
}

function responseAndSyncActive(db: LocalDatabase, debt: DebtRow) {
  const paid = paidFromTransactions(db, debt)
  const remaining = remainingOf(debt, paid)
  // Un debito saldato libera la categoria per uno nuovo; se il residuo torna positivo
  // (una spesa cancellata) torna attivo.
  const active = remaining > 0
  if (active !== (debt.active === 1)) db.run('UPDATE debts SET active = :active WHERE id = :id', { id: debt.id, active })
  const category = findCategory(db, debt.category_id)
  return {
    id: debt.id,
    categoryId: category.id,
    categoryName: category.name,
    categoryIcon: category.icon,
    categoryColor: category.color,
    name: debt.name,
    totalAmount: toEuros(debt.total_amount),
    alreadyPaidAmount: toEuros(debt.already_paid_amount),
    alreadyPaidAsOf: debt.already_paid_as_of,
    paidAmount: toEuros(debt.already_paid_amount + paid),
    remainingAmount: toEuros(remaining),
    monthlyPaymentAmount: toEurosOrNull(debt.monthly_payment_amount),
    active,
    createdAt: debt.created_at,
  }
}

function findDebt(db: LocalDatabase, id: string): DebtRow {
  const row = db.get<DebtRow>('SELECT * FROM debts WHERE id = :id', { id })
  if (!row) throw notFound('Debito non trovato')
  return row
}

function readRequest(db: LocalDatabase, raw: unknown, currentDebtId: string | null) {
  const body = bodyOf(raw)
  const categoryId = requiredString(body, 'categoryId')
  if (findCategory(db, categoryId).type !== 'EXPENSE') {
    throw badRequest('La categoria di un debito deve essere di tipo uscita')
  }
  // Un debito attivo per categoria.
  const other = db.get<{ id: string }>('SELECT id FROM debts WHERE category_id = :categoryId AND active = 1', { categoryId })
  if (other && other.id !== currentDebtId) throw conflict('Questa categoria è già collegata a un altro debito attivo')

  const total = requiredNumber(body, 'totalAmount')
  if (total < 0.01) throw badRequest("L'importo totale deve essere maggiore di zero")
  const alreadyPaid = optionalNumber(body, 'alreadyPaidAmount') ?? 0
  if (alreadyPaid < 0) throw badRequest("L'importo già pagato non può essere negativo")
  const monthly = optionalNumber(body, 'monthlyPaymentAmount')
  if (monthly !== null && monthly < 0.01) throw badRequest('La rata mensile deve essere maggiore di zero')
  const asOf = optionalDate(body, 'alreadyPaidAsOf')
  // Con un già pagato serve la data da cui le spese contano a parte: altrimenti le
  // spese storiche della categoria si sommerebbero a un totale che probabilmente le
  // comprende già.
  if (alreadyPaid > 0 && asOf === null) {
    throw badRequest('Indica da quale data in poi le spese vanno conteggiate separatamente dal già pagato')
  }
  if (alreadyPaid > total) throw badRequest("L'importo già pagato non può superare il totale")
  return {
    categoryId,
    name: requiredString(body, 'name'),
    total: toCents(total),
    alreadyPaid: toCents(alreadyPaid),
    asOf: alreadyPaid > 0 ? asOf : null,
    monthly: monthly === null ? null : toCents(monthly),
  }
}

export function listDebts(db: LocalDatabase) {
  return db
    .all<DebtRow>('SELECT * FROM debts ORDER BY created_at DESC, rowid DESC')
    .map((d) => responseAndSyncActive(db, d))
}

export function createDebt(db: LocalDatabase, raw: unknown) {
  const r = readRequest(db, raw, null)
  const id = newId()
  db.run(
    `INSERT INTO debts (id, category_id, name, total_amount, already_paid_amount, already_paid_as_of,
       monthly_payment_amount, active, created_at)
     VALUES (:id, :categoryId, :name, :total, :alreadyPaid, :asOf, :monthly, 1, :now)`,
    { id, ...r, now: nowIso() },
  )
  return responseAndSyncActive(db, findDebt(db, id))
}

export function updateDebt(db: LocalDatabase, id: string, raw: unknown) {
  findDebt(db, id)
  const r = readRequest(db, raw, id)
  db.run(
    `UPDATE debts SET category_id = :categoryId, name = :name, total_amount = :total,
       already_paid_amount = :alreadyPaid, already_paid_as_of = :asOf, monthly_payment_amount = :monthly
     WHERE id = :id`,
    { id, ...r },
  )
  return responseAndSyncActive(db, findDebt(db, id))
}

export function deleteDebt(db: LocalDatabase, id: string): void {
  findDebt(db, id)
  db.run('DELETE FROM debts WHERE id = :id', { id })
}
