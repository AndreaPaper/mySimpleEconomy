import type { SavingsSettings } from '../context/AuthContext'
import type { Transaction } from '../api/types'

// Stato del budget discrezionale del periodo.
//  - 'neutral'  → in linea
//  - 'warning'  → resta poco budget, ma non si è ancora sforato
//  - 'danger'   → sforato: il rimanente è negativo
export type BudgetStatus = 'neutral' | 'warning' | 'danger'

// Sotto questa quota di budget ancora disponibile si passa in "attenzione".
const WARNING_REMAINING_RATIO = 0.2

// Quanto deve valere un'entrata, rispetto allo stipendio stimato, perché la si
// possa prendere per lo stipendio quando la categoria non lo dice. Larga
// abbastanza da riconoscere un mese corto o una busta più leggera del solito,
// stretta abbastanza da non scambiare per stipendio un rimborso.
const SALARY_MATCH_RATIO = 0.6

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
 * configurata nel profilo, per non contarlo due volte. Riconoscerlo dalla sola
 * categoria non basta — chi importa dalla banca se lo ritrova sotto la
 * categoria della banca — quindi vale anche un'entrata singola di taglia
 * paragonabile alla stima. Le altre entrate si sommano sempre.
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

  // Lo stipendio riconosciuto dalla categoria collegata al profilo. È il
  // segnale preciso, ma non basta da solo: chi importa dalla banca se lo
  // ritrova nella categoria della banca ("Stipendi e pensioni") e non in
  // quella del profilo, e lì questo conteggio resta a zero.
  const salaryInCategory = settings.salaryCategoryId
    ? sum(incomeTransactions.filter((t) => t.categoryId === settings.salaryCategoryId))
    : 0

  // Ripiego per quando la categoria non lo riconosce: un'entrata singola di
  // taglia paragonabile alla stima è, con ogni probabilità, lo stipendio. Si
  // guarda la più grande e non il totale, perché lo stipendio è un accredito
  // solo; sotto questa quota si tratta di rimborsi e regali, che vanno sommati
  // alla stima invece di sostituirla.
  const largestIncome = incomeTransactions.reduce((max, t) => Math.max(max, t.amount), 0)
  const salaryArrived = salaryInCategory > 0 || largestIncome >= estimatedSalary * SALARY_MATCH_RATIO

  // Arrivato lo stipendio, contano le entrate vere e la stima esce di scena:
  // sommarla vorrebbe dire contarlo due volte. Finché non arriva, la stima si
  // aggiunge a quello che è già entrato, così il budget del periodo non parte
  // da zero il giorno dopo lo stipendio precedente.
  const income = salaryArrived ? totalIncome : totalIncome + estimatedSalary

  const expenses = periodTransactions.filter((t) => t.type === 'EXPENSE')
  const fixedExpenses = sum(expenses.filter((t) => t.recurringTransactionId !== null))
  const discretionarySpent = sum(expenses.filter((t) => t.recurringTransactionId === null))

  const savingsTarget = (income * (settings.savingsPercent ?? 0)) / 100
  const available = income - savingsTarget - fixedExpenses
  const remaining = available - discretionarySpent

  const totalDays = daysBetween(period.start, period.end) + 1
  const elapsedDays = Math.min(Math.max(daysBetween(period.start, todayIso) + 1, 0), totalDays)
  const daysLeft = Math.max(totalDays - elapsedDays, 0)

  let status: BudgetStatus = 'neutral'
  if (remaining < 0) {
    status = 'danger'
  } else if (remaining <= available * WARNING_REMAINING_RATIO) {
    // Con `available` a zero il confronto vale comunque: non c'è budget da
    // spendere, ed è giusto segnalarlo invece di mostrare "in linea".
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
