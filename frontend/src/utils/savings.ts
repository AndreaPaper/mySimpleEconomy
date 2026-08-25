import type { SavingsSettings } from '../context/AuthContext'
import type { Transaction } from '../api/types'

// Stato del budget discrezionale del periodo.
//  - 'neutral'  → in linea
//  - 'warning'  → budget non ancora esaurito ma ritmo di spesa troppo alto
//  - 'danger'   → sforato: il rimanente è negativo
export type BudgetStatus = 'neutral' | 'warning' | 'danger'

// Sopra questo scarto tra quota di budget consumata e quota di periodo
// trascorsa si passa in "attenzione" (15 punti percentuali).
const PACE_WARNING_THRESHOLD = 0.15

export interface BudgetBreakdown {
  income: number
  /** Obiettivo del periodo: entrate × percentuale configurata. */
  savingsTarget: number
  fixedExpenses: number
  /** Quanto resta per le spese discrezionali una volta tolti risparmio e spese fisse. */
  available: number
  discretionarySpent: number
  /** available - discretionarySpent: negativo se si è sforato. */
  remaining: number
  status: BudgetStatus
  /**
   * Il risparmio vero del periodo: entrate meno tutte le uscite. Non si
   * accantona nulla a mano — quello che avanza *è* il risparmio. Coincide per
   * costruzione con `savingsTarget + remaining`, quindi le due card della
   * Dashboard non possono dire cose incompatibili.
   */
  saved: number
  /** Giorni che mancano alla fine del periodo, estremo incluso. */
  daysLeft: number
  /** Quanto si può spendere al giorno per arrivare a fine periodo in pari. */
  dailyAllowance: number
}

function sum(transactions: Transaction[]): number {
  return transactions.reduce((total, t) => total + t.amount, 0)
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

/**
 * Applica la formula del budget disponibile alle transazioni di un periodo.
 *
 * Entrate: uno stipendio realmente incassato **sostituisce** la stima
 * configurata nel profilo (per non contarlo due volte); se non è ancora
 * arrivato si usa la stima. Le altre entrate si sommano sempre.
 *
 * Spese fisse: quelle generate da una regola ricorrente (affitto, bollette,
 * abbonamenti). Il collegamento esiste già su ogni transazione, quindi non
 * serve classificare nulla a mano.
 *
 * Risparmio: non è qualcosa da accantonare a mano, è quello che avanza. La
 * percentuale configurata serve solo a fissare l'obiettivo e quindi a decidere
 * quanto tenere da parte prima di considerare il resto spendibile.
 */
export function computeBudget(
  periodTransactions: Transaction[],
  settings: SavingsSettings,
  period: { start: string; end: string },
  todayIso: string,
): BudgetBreakdown {
  const incomeTransactions = periodTransactions.filter((t) => t.type === 'INCOME')
  const totalIncome = sum(incomeTransactions)
  const estimatedSalary = settings.defaultSalaryAmount ?? 0

  let income: number
  if (settings.salaryCategoryId) {
    const salaryReceived = sum(incomeTransactions.filter((t) => t.categoryId === settings.salaryCategoryId))
    const otherIncome = totalIncome - salaryReceived
    // Lo stipendio davvero incassato sostituisce la stima; le altre entrate
    // (regali, rimborsi) si sommano sempre.
    income = (salaryReceived > 0 ? salaryReceived : estimatedSalary) + otherIncome
  } else {
    // Senza una categoria stipendio configurata non si può distinguere lo
    // stipendio dalle altre entrate: si usa la stima solo finché non è
    // entrato nulla, altrimenti la si sommerebbe a un'entrata che
    // potrebbe già essere lo stipendio stesso.
    income = totalIncome > 0 ? totalIncome : estimatedSalary
  }

  const expenses = periodTransactions.filter((t) => t.type === 'EXPENSE')
  const fixedExpenses = sum(expenses.filter((t) => t.recurringTransactionId !== null))
  const discretionarySpent = sum(expenses.filter((t) => t.recurringTransactionId === null))

  const savingsTarget = (income * (settings.savingsPercent ?? 0)) / 100
  const available = income - savingsTarget - fixedExpenses
  const remaining = available - discretionarySpent

  // Quota di periodo trascorsa vs quota di budget consumata: spendere il 70%
  // del budget a metà mese è un segnale, anche se non si è ancora sforato.
  const totalDays = daysBetween(period.start, period.end) + 1
  const elapsedDays = Math.min(Math.max(daysBetween(period.start, todayIso) + 1, 0), totalDays)
  const daysLeft = Math.max(totalDays - elapsedDays, 0)
  const elapsedRatio = totalDays > 0 ? elapsedDays / totalDays : 0
  const spentRatio = available > 0 ? discretionarySpent / available : 0

  let status: BudgetStatus = 'neutral'
  if (remaining < 0) {
    status = 'danger'
  } else if (available > 0 && spentRatio - elapsedRatio > PACE_WARNING_THRESHOLD) {
    status = 'warning'
  }

  return {
    income,
    savingsTarget,
    fixedExpenses,
    available,
    discretionarySpent,
    remaining,
    status,
    saved: income - fixedExpenses - discretionarySpent,
    daysLeft,
    dailyAllowance: daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : Math.max(remaining, 0),
  }
}

export interface PeriodSavings {
  /** Chiave del periodo (stessa di periodKeyOf), es. "2026-08". */
  periodKey: string
  income: number
  expenses: number
  /** income - expenses: negativo se nel periodo si è intaccato il risparmio. */
  saved: number
}

/**
 * Risparmio periodo per periodo, ricostruito dalle sole transazioni realmente
 * registrate. A differenza di `computeBudget` qui non si usa mai la stima dello
 * stipendio: su un periodo concluso vale quello che è successo davvero, e una
 * stima gonfierebbe un mese in cui semplicemente non è entrato nulla.
 *
 * Restituisce i periodi in ordine cronologico, inclusi quelli senza movimenti,
 * così il grafico non salta i mesi vuoti.
 */
export function buildPeriodSavings(
  transactions: Transaction[],
  periodKeyOf: (dateIso: string) => string,
  periodKeys: string[],
): PeriodSavings[] {
  const byPeriod = new Map<string, { income: number; expenses: number }>()
  for (const key of periodKeys) byPeriod.set(key, { income: 0, expenses: 0 })

  for (const t of transactions) {
    const bucket = byPeriod.get(periodKeyOf(t.occurredOn))
    if (!bucket) continue
    if (t.type === 'INCOME') bucket.income += t.amount
    else bucket.expenses += t.amount
  }

  return periodKeys.map((periodKey) => {
    const { income, expenses } = byPeriod.get(periodKey)!
    return { periodKey, income, expenses, saved: income - expenses }
  })
}
