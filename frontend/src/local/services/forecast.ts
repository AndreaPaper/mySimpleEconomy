import { periodKeyOf, periodRangeOf } from '../../utils/period'
import type { LocalDatabase } from '../db/database'
import {
  atEndOfMonth,
  monthsBetween,
  plusDays,
  plusMonthsYm,
  today as todayDate,
  yearMonthOf,
  type IsoDate,
  type YearMonth,
} from '../dates'
import { divideHalfUp, toEuros, type Cents } from '../money'
import { badRequest } from '../router'
import type { CategoryRow, CategoryType } from './categories'
import { countsAfterCheckpoint, latestCheckpointOnOrBefore } from './checkpoints'
import { paidFromTransactions, remainingOf, type DebtRow } from './debts'
import { loadProfile } from './profile'
import type { RecurringRow } from './recurringGeneration'
import { advance, lastExpenseInCategory, reminderActiveOn, type ReminderRow } from './reminders'
import { isCurrentlyActive, nextOccurrence } from './schedule'
import type { TransactionRow } from './transactions'

// Porting di ForecastService. I periodi di stipendio vengono da utils/period.ts, la
// stessa funzione che usano le pagine (ed è il porting di SalaryPeriods): un confine
// di periodo calcolato in due modi prima o poi divergerebbe.

// Un tetto, non il divisore: la media divide per i periodi di storico che esistono.
const VARIABLE_AVERAGE_WINDOW_PERIODS = 6
// "Nessun saldo di riferimento": da qui in poi conta tutto.
const NO_CHECKPOINT = '1970-01-01'

interface Occurrence {
  categoryId: string
  amount: Cents
}

interface DebtPlan {
  categoryId: string
  monthlyPayment: Cents
  remaining: Cents
}

/** Tutto ciò che la previsione legge, letto una volta per le due letture (periodi e mesi). */
interface Inputs {
  today: IsoDate
  checkpointBalance: Cents
  actualSinceCheckpoint: TransactionRow[]
  activeRules: RecurringRow[]
  overridesByRule: Map<string, Map<IsoDate, Cents>>
  reminders: ReminderRow[]
  reminderAmounts: Map<string, Cents>
  historicalWindow: TransactionRow[]
  debts: DebtPlan[]
  debtCategoryIds: Set<string>
  categories: Map<string, CategoryRow>
  materialised: (reminderId: string, month: YearMonth) => boolean
}

const signed = (t: TransactionRow): Cents => (t.type === 'EXPENSE' ? -t.amount : t.amount)
const sum = (values: Cents[]): Cents => values.reduce((a, b) => a + b, 0)
const earliest = (a: IsoDate, b: IsoDate) => (a < b ? a : b)
const latest = (a: IsoDate, b: IsoDate) => (a > b ? a : b)

export function forecast(db: LocalDatabase, query: Record<string, string | undefined>, today: IsoDate = todayDate()) {
  const periods = query.periods === undefined ? 6 : Number(query.periods)
  if (!Number.isInteger(periods) || periods < 1 || periods > 24) throw badRequest('Il parametro periods non è valido')

  const salaryDay = loadProfile(db).salary_day
  const currentPeriod = periodKeyOf(today, salaryDay)
  const currentMonth = yearMonthOf(today)
  // Il mese la cui fine mostra la card "Saldo previsto a fine …": quello in cui arriva il
  // prossimo stipendio, cioè il nome del periodo in corso.
  const monthEndTarget = currentPeriod

  // L'orizzonte copre entrambe le letture: la fine del mese della card può cadere oltre
  // la fine dell'ultimo periodo chiesto, e viceversa.
  const horizonEnd = latest(
    periodRangeOf(plusMonthsYm(currentPeriod, periods - 1), salaryDay).end,
    atEndOfMonth(monthEndTarget),
  )

  const checkpoint = latestCheckpointOnOrBefore(db, today)
  const checkpointBalance = checkpoint?.balance ?? 0

  // Le transazioni dal saldo di riferimento alla fine dell'orizzonte: anche quelle già
  // registrate con data futura, che sono movimenti certi.
  const actualSinceCheckpoint = db
    .all<TransactionRow>('SELECT * FROM transactions WHERE occurred_on BETWEEN :from AND :to ORDER BY rowid', {
      from: checkpoint?.checkpoint_date ?? NO_CHECKPOINT,
      to: horizonEnd,
    })
    .filter((t) => countsAfterCheckpoint(t, checkpoint))

  // Il saldo vero, adesso: solo ciò che è già successo.
  const currentBalance = checkpointBalance + sum(actualSinceCheckpoint.filter((t) => t.occurred_on <= today).map(signed))

  const activeRules = db.all<RecurringRow>('SELECT * FROM recurring_transactions WHERE active = 1 ORDER BY rowid')
  const overridesByRule = new Map<string, Map<IsoDate, Cents>>()
  for (const o of db.all<{ recurring_transaction_id: string; occurrence_date: string; override_amount: number }>(
    'SELECT * FROM recurring_overrides',
  )) {
    const map = overridesByRule.get(o.recurring_transaction_id) ?? new Map()
    map.set(o.occurrence_date, o.override_amount)
    overridesByRule.set(o.recurring_transaction_id, map)
  }

  // I promemoria con un importo prevedibile: il loro, o l'ultima spesa della categoria.
  const reminders: ReminderRow[] = []
  const reminderAmounts = new Map<string, Cents>()
  for (const r of db.all<ReminderRow>('SELECT * FROM expense_reminders WHERE active = 1 ORDER BY rowid')) {
    if (r.category_id === null) continue
    const amount = r.amount ?? lastExpenseInCategory(db, r.category_id)
    if (amount === null) continue
    reminders.push(r)
    reminderAmounts.set(r.id, amount)
  }

  // La finestra storica della media, unione di quelle delle due letture.
  const windowStart = earliest(
    periodRangeOf(plusMonthsYm(currentPeriod, -VARIABLE_AVERAGE_WINDOW_PERIODS), salaryDay).start,
    `${plusMonthsYm(currentMonth, -VARIABLE_AVERAGE_WINDOW_PERIODS)}-01`,
  )
  const windowEnd = latest(plusDays(periodRangeOf(currentPeriod, salaryDay).start, -1), plusDays(`${currentMonth}-01`, -1))
  const historicalWindow =
    windowEnd < windowStart
      ? []
      : db.all<TransactionRow>('SELECT * FROM transactions WHERE occurred_on BETWEEN :from AND :to ORDER BY rowid', {
          from: windowStart,
          to: windowEnd,
        })

  const allDebts = db.all<DebtRow>('SELECT * FROM debts ORDER BY created_at DESC, rowid DESC')
  const debts: DebtPlan[] = []
  for (const d of allDebts) {
    if (d.monthly_payment_amount === null || d.monthly_payment_amount <= 0) continue
    const remaining = remainingOf(d, paidFromTransactions(db, d))
    if (remaining > 0) debts.push({ categoryId: d.category_id, monthlyPayment: d.monthly_payment_amount, remaining })
  }

  const categories = new Map(db.all<CategoryRow>('SELECT * FROM categories').map((c) => [c.id, c]))

  // "Il job l'ha già trasformato in transazione?": per mese di calendario, perché
  // mensile è il job che li genera.
  const memo = new Map<string, boolean>()
  const materialised = (reminderId: string, month: YearMonth) => {
    const key = `${reminderId}|${month}`
    if (!memo.has(key)) {
      memo.set(
        key,
        db.get('SELECT 1 AS x FROM transactions WHERE expense_reminder_id = :id AND occurred_on BETWEEN :from AND :to', {
          id: reminderId,
          from: `${month}-01`,
          to: atEndOfMonth(month),
        }) !== undefined,
      )
    }
    return memo.get(key)!
  }

  const inputs: Inputs = {
    today,
    checkpointBalance,
    actualSinceCheckpoint,
    activeRules,
    overridesByRule,
    reminders,
    reminderAmounts,
    historicalWindow,
    debts,
    debtCategoryIds: new Set(allDebts.map((d) => d.category_id)),
    categories,
    materialised,
  }

  const byPeriod = build(inputs, salaryDay, currentPeriod, periods)
  // La card conta per mese di calendario: lo stesso calcolo ignorando il giorno di
  // accredito, dal mese in corso fino a quello della card.
  const monthsToTarget = monthsBetween(currentMonth, monthEndTarget)
  const months = build(inputs, null, currentMonth, monthsToTarget + 1).buckets

  return {
    startingBalanceDate: checkpoint?.checkpoint_date ?? null,
    startingBalance: toEuros(checkpointBalance),
    currentBalance: toEuros(currentBalance),
    periods: byPeriod.buckets,
    monthEndForecast: months[monthsToTarget],
    variableExpenseAverage: toEuros(byPeriod.variableExpenseAverage),
    historyPeriods: byPeriod.historyPeriods,
  }
}

/**
 * La previsione su dati già letti. basisDay decide il raggruppamento: il giorno di
 * accredito per i periodi, null per i mesi di calendario.
 */
function build(in_: Inputs, basisDay: number | null, first: YearMonth, count: number) {
  const { today, categories } = in_
  const bucketOf = (date: IsoDate) => periodKeyOf(date, basisDay)
  const firstStart = periodRangeOf(first, basisDay).start
  const horizonEnd = periodRangeOf(plusMonthsYm(first, count - 1), basisDay).end
  const typeOf = (categoryId: string): CategoryType => categories.get(categoryId)!.type

  const preHorizonDelta = sum(in_.actualSinceCheckpoint.filter((t) => t.occurred_on < firstStart).map(signed))

  // Il taglio superiore serve perché i dati letti coprono l'unione dei due orizzonti.
  const actualByBucket = groupBy(
    in_.actualSinceCheckpoint.filter((t) => t.occurred_on >= firstStart && t.occurred_on <= horizonEnd),
    (t) => bucketOf(t.occurred_on),
  )

  // Le regole ricorrenti, proiettate oltre oggi con le loro eccezioni.
  const projectedByBucket = new Map<YearMonth, Occurrence[]>()
  for (const rule of in_.activeRules) {
    const overrides = in_.overridesByRule.get(rule.id)
    for (
      let cursor = rule.next_due_date;
      cursor <= horizonEnd && isCurrentlyActive(rule, cursor);
      cursor = nextOccurrence(cursor, rule.start_date, rule.interval_unit, rule.interval_value)
    ) {
      if (cursor > today) {
        push(projectedByBucket, bucketOf(cursor), {
          categoryId: rule.category_id,
          amount: overrides?.get(cursor) ?? rule.default_amount,
        })
      }
    }
  }

  // I promemoria, finché il job non li ha trasformati in transazione per quel mese.
  const reminderByBucket = new Map<YearMonth, Occurrence[]>()
  for (const r of in_.reminders) {
    const amount = in_.reminderAmounts.get(r.id)!
    for (let cursor = r.next_due_date; cursor <= horizonEnd && reminderActiveOn(r, cursor); cursor = advance(r, cursor)) {
      if (!in_.materialised(r.id, yearMonthOf(cursor))) {
        push(reminderByBucket, bucketOf(cursor), { categoryId: r.category_id!, amount })
      }
    }
  }

  // La media delle spese/entrate variabili sui periodi conclusi, fino a sei.
  const windowStart = periodRangeOf(plusMonthsYm(first, -VARIABLE_AVERAGE_WINDOW_PERIODS), basisDay).start
  const windowEnd = plusDays(firstStart, -1)
  const window = in_.historicalWindow.filter((t) => t.occurred_on >= windowStart && t.occurred_on <= windowEnd)

  // Il divisore: i periodi di storico che esistono davvero, dal periodo della
  // transazione più vecchia della finestra (fra tutte, prima del filtro sulle variabili)
  // a quello prima dell'attuale.
  const oldest = window.reduce<IsoDate | null>((min, t) => (min === null || t.occurred_on < min ? t.occurred_on : min), null)
  const historyPeriods =
    oldest === null
      ? 0
      : Math.min(Math.max(monthsBetween(bucketOf(oldest), first), 0), VARIABLE_AVERAGE_WINDOW_PERIODS)

  // Fuori dalla media quello che è già previsto esplicitamente: occorrenze di regole e
  // promemoria, pagamenti dei debiti, entrate delle categorie con una regola di entrata
  // (lo stipendio importato dalla banca, che sommato alla regola farebbe due stipendi).
  const incomeRuleCategoryIds = new Set(
    in_.activeRules.filter((r) => typeOf(r.category_id) === 'INCOME').map((r) => r.category_id),
  )
  const variableAverageByCategory = new Map<string, Cents>()
  if (historyPeriods > 0) {
    const totals = new Map<string, Cents>()
    for (const t of window) {
      if (t.recurring_transaction_id !== null || t.expense_reminder_id !== null) continue
      if (in_.debtCategoryIds.has(t.category_id) || incomeRuleCategoryIds.has(t.category_id)) continue
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount)
    }
    for (const [categoryId, total] of totals) {
      variableAverageByCategory.set(categoryId, divideHalfUp(total, historyPeriods))
    }
  }
  const variableExpenseAverage = sum(
    [...variableAverageByCategory].filter(([id]) => typeOf(id) === 'EXPENSE').map(([, avg]) => avg),
  )

  // Quanto resta da prevedere per ogni debito: si consuma periodo dopo periodo.
  const debtLeft = new Map(in_.debts.map((d) => [d.categoryId, d.remaining]))

  const buckets = []
  let runningBalance = in_.checkpointBalance + preHorizonDelta

  for (let i = 0; i < count; i++) {
    const bucket = plusMonthsYm(first, i)
    const isCurrent = bucket === first
    const breakdown = new Map<string, Cents>()
    const add = (categoryId: string, amount: Cents) => breakdown.set(categoryId, (breakdown.get(categoryId) ?? 0) + amount)
    let income = 0
    let expense = 0

    // Le transazioni già registrate: nell'intervallo in corso quelle passate, nei
    // successivi quelle con data futura.
    const actualHere = actualByBucket.get(bucket) ?? []
    for (const t of actualHere) {
      add(t.category_id, t.amount)
      if (t.type === 'INCOME') income += t.amount
      else expense += t.amount
    }

    for (const o of [...(reminderByBucket.get(bucket) ?? []), ...(projectedByBucket.get(bucket) ?? [])]) {
      add(o.categoryId, o.amount)
      if (typeOf(o.categoryId) === 'INCOME') income += o.amount
      else expense += o.amount
    }

    if (!isCurrent) {
      for (const [categoryId, avg] of variableAverageByCategory) {
        if (!categories.has(categoryId)) continue
        add(categoryId, avg)
        if (typeOf(categoryId) === 'INCOME') income += avg
        else expense += avg
      }

      // Le rate dei debiti: una per periodo futuro finché il residuo non finisce, meno
      // la parte già registrata qui con data futura (che è già fuori dal residuo).
      for (const debt of in_.debts) {
        const left = debtLeft.get(debt.categoryId)!
        if (left <= 0) continue
        const alreadyHere = sum(
          actualHere.filter((t) => t.type === 'EXPENSE' && t.category_id === debt.categoryId).map((t) => t.amount),
        )
        const instalment = Math.max(Math.min(debt.monthlyPayment, left) - alreadyHere, 0)
        if (instalment === 0) continue
        debtLeft.set(debt.categoryId, left - instalment)
        add(debt.categoryId, instalment)
        expense += instalment
      }
    }

    const netBalance = income - expense
    runningBalance += netBalance
    const range = periodRangeOf(bucket, basisDay)
    buckets.push({
      period: bucket,
      periodStart: range.start,
      periodEnd: range.end,
      projectedIncome: toEuros(income),
      projectedExpense: toEuros(expense),
      netBalance: toEuros(netBalance),
      runningBalance: toEuros(runningBalance),
      categoryBreakdown: [...breakdown].map(([categoryId, amount]) => {
        const c = categories.get(categoryId)!
        return {
          categoryId,
          categoryName: c.name,
          categoryIcon: c.icon,
          categoryColor: c.color,
          type: c.type,
          amount: toEuros(amount),
        }
      }),
    })
  }

  return { buckets, historyPeriods, variableExpenseAverage }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) push(map, key(item), item)
  return map
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
