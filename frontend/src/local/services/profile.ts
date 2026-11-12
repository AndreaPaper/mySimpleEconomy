import type { LocalDatabase } from '../db/database'
import { atDay, lengthOfYearMonth, onDay, plusMonths, plusMonthsYm, today as todayDate, yearMonthOf, type IsoDate } from '../dates'
import { newId, nowIso } from '../ids'
import { toCents, toEurosOrNull } from '../money'
import { badRequest } from '../router'
import { bodyOf, optionalBoolean, optionalNumber, optionalString } from '../validate'
import { findCategoryByName, insertCategory } from './categories'
import { processDueRule, type RecurringRow } from './recurringGeneration'

// Porting di ProfileService. Sul telefono il profilo è una riga sola, creata alla
// prima lettura.

const SALARY_CATEGORY = { name: 'Stipendio', color: '#10B981', icon: 'Wallet' }
const SALARY_RECURRING_NAME = 'Stipendio'
const AVATARS = ['cat', 'dog', 'rabbit', 'bird', 'fish', 'turtle', 'squirrel', 'panda', 'mouse', 'snail']

// Al posto dell'email del server: la Dashboard e il profilo la mostrano come nome
// dell'account.
export const LOCAL_ACCOUNT_LABEL = 'Su questo telefono'

export interface ProfileRow {
  id: number
  nickname: string | null
  default_salary_amount: number | null
  salary_day: number | null
  avatar_key: string | null
  savings_enabled: number
  savings_percent: number | null
  salary_recurring_transaction_id: string | null
  created_at: string
}

export function loadProfile(db: LocalDatabase): ProfileRow {
  const existing = db.get<ProfileRow>('SELECT * FROM profile WHERE id = 1')
  if (existing) return existing
  db.run('INSERT INTO profile (id, savings_enabled, created_at) VALUES (1, 0, :now)', { now: nowIso() })
  return db.get<ProfileRow>('SELECT * FROM profile WHERE id = 1')!
}

function response(db: LocalDatabase, p: ProfileRow) {
  const rule = p.salary_recurring_transaction_id
    ? db.get<{ category_id: string }>('SELECT category_id FROM recurring_transactions WHERE id = :id', {
        id: p.salary_recurring_transaction_id,
      })
    : undefined
  return {
    email: LOCAL_ACCOUNT_LABEL,
    nickname: p.nickname,
    defaultSalaryAmount: toEurosOrNull(p.default_salary_amount),
    salaryDay: p.salary_day,
    avatarKey: p.avatar_key,
    savingsEnabled: p.savings_enabled === 1,
    savingsPercent: p.savings_percent,
    // La categoria dello stipendio, ricavata dalla regola: serve al calcolo delle
    // entrate del periodo.
    salaryCategoryId: rule?.category_id ?? null,
  }
}

export function getProfile(db: LocalDatabase) {
  return response(db, loadProfile(db))
}

export function updateProfile(db: LocalDatabase, raw: unknown, today: IsoDate = todayDate()) {
  const body = bodyOf(raw)
  const nickname = optionalString(body, 'nickname', 100)
  const salaryEuros = optionalNumber(body, 'defaultSalaryAmount')
  if (salaryEuros !== null && salaryEuros < 0.01) throw badRequest('Lo stipendio deve essere maggiore di zero')
  const salaryDay = optionalNumber(body, 'salaryDay')
  if (salaryDay !== null && (!Number.isInteger(salaryDay) || salaryDay < 1 || salaryDay > 31)) {
    throw badRequest('Il giorno deve essere tra 1 e 31')
  }
  const savingsEnabled = optionalBoolean(body, 'savingsEnabled') === true
  const savingsPercent = optionalNumber(body, 'savingsPercent')
  if (savingsPercent !== null && (!Number.isInteger(savingsPercent) || savingsPercent < 0 || savingsPercent > 100)) {
    throw badRequest('La percentuale deve essere tra 0 e 100')
  }
  // Senza percentuale il budget disponibile non si calcola.
  if (savingsEnabled && savingsPercent === null) {
    throw badRequest('Con la sezione risparmio attiva serve la percentuale da mettere da parte')
  }
  const avatarKey = optionalString(body, 'avatarKey')
  if (avatarKey !== null && !AVATARS.includes(avatarKey)) throw badRequest('Avatar non valido')

  const salary = salaryEuros === null ? null : toCents(salaryEuros)

  return db.transaction(() => {
    const previous = loadProfile(db)
    db.run(
      `UPDATE profile SET nickname = :nickname, default_salary_amount = :salary, salary_day = :salaryDay,
         avatar_key = :avatarKey, savings_enabled = :savingsEnabled, savings_percent = :savingsPercent WHERE id = 1`,
      { nickname, salary, salaryDay, avatarKey, savingsEnabled, savingsPercent },
    )
    // Solo se stipendio o giorno sono davvero cambiati: un salvataggio che tocca solo
    // il soprannome non deve far risorgere una regola cancellata apposta.
    if (previous.default_salary_amount !== salary || previous.salary_day !== salaryDay) {
      syncSalaryRule(db, salary, salaryDay, today)
    }
    return response(db, loadProfile(db))
  })
}

// Tiene allineata la regola "Stipendio" collegata al profilo: la crea al primo
// stipendio, la aggiorna ai salvataggi successivi, la disattiva (senza cancellarla) se
// lo stipendio viene svuotato.
function syncSalaryRule(db: LocalDatabase, amount: number | null, day: number | null, today: IsoDate): void {
  const profile = loadProfile(db)
  const rule = profile.salary_recurring_transaction_id
    ? db.get<RecurringRow>('SELECT * FROM recurring_transactions WHERE id = :id', {
        id: profile.salary_recurring_transaction_id,
      })
    : undefined

  if (amount === null || day === null) {
    if (rule) db.run('UPDATE recurring_transactions SET active = 0 WHERE id = :id', { id: rule.id })
    return
  }

  // Alla prima attivazione si usa il giorno di questo mese anche se già passato, così
  // lo stipendio del mese viene generato subito; su una regola già attiva si guarda
  // solo avanti, per non generarlo due volte.
  const isNewOrReactivating = !rule || rule.active !== 1
  const nextDueDate = isNewOrReactivating ? onDay(today, day) : nextOccurrenceOfDay(day, today)
  const startDate = anchorForDay(day, nextDueDate)

  if (!rule) {
    const id = newId()
    db.run(
      `INSERT INTO recurring_transactions (id, category_id, name, default_amount, interval_unit, interval_value,
         start_date, next_due_date, active, created_at)
       VALUES (:id, :category, :name, :amount, 'MONTH', 1, :start, :next, 1, :now)`,
      {
        id,
        category: salaryCategoryId(db),
        name: SALARY_RECURRING_NAME,
        amount,
        start: startDate,
        next: nextDueDate,
        now: nowIso(),
      },
    )
    db.run('UPDATE profile SET salary_recurring_transaction_id = :id WHERE id = 1', { id })
    processDueRule(db, id, today)
    return
  }

  db.run(
    `UPDATE recurring_transactions SET default_amount = :amount, next_due_date = :next, start_date = :start,
       active = 1 WHERE id = :id`,
    { id: rule.id, amount, next: nextDueDate, start: startDate },
  )
  processDueRule(db, rule.id, today)
}

function salaryCategoryId(db: LocalDatabase): string {
  const existing = findCategoryByName(db, SALARY_CATEGORY.name)
  if (existing) return existing.id
  return insertCategory(db, { ...SALARY_CATEGORY, type: 'INCOME', parentId: null }).id
}

/**
 * La data di inizio della regola porta il giorno di accredito: è da lì che il calcolo
 * delle scadenze ricava il giorno voluto quando un mese corto lo accorcia. Se il giorno
 * non esiste nel mese della scadenza, l'ultimo mese che ce l'ha.
 */
function anchorForDay(day: number, nextDueDate: IsoDate): IsoDate {
  let month = yearMonthOf(nextDueDate)
  while (lengthOfYearMonth(month) < day) month = plusMonthsYm(month, -1)
  return atDay(month, day)
}

/** La prossima occorrenza del giorno del mese, oggi compreso. */
function nextOccurrenceOfDay(day: number, today: IsoDate): IsoDate {
  const candidate = onDay(today, day)
  if (candidate >= today) return candidate
  return onDay(plusMonths(today, 1), day)
}
