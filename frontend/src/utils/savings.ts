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
  savingsTarget: number
  fixedExpenses: number
  /** Quanto resta per le spese discrezionali una volta tolti risparmio e spese fisse. */
  available: number
  discretionarySpent: number
  /** available - discretionarySpent: negativo se si è sforato. */
  remaining: number
  status: BudgetStatus
  /**
   * Quanto si riuscirà davvero a mettere da parte se lo sforamento resta:
   * lo sforamento erode il risparmio, non il budget (che è già a zero).
   */
  projectedSavings: number
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
    projectedSavings: remaining < 0 ? Math.max(savingsTarget + remaining, 0) : savingsTarget,
    daysLeft,
    dailyAllowance: daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : Math.max(remaining, 0),
  }
}
