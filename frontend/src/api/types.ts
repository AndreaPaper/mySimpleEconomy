export type CategoryType = 'INCOME' | 'EXPENSE'
export type TransactionType = 'INCOME' | 'EXPENSE'
export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export interface Category {
  id: string
  name: string
  type: CategoryType
  color: string | null
  icon: string | null
  archived: boolean
}

export interface Transaction {
  id: string
  categoryId: string
  categoryName: string
  amount: number
  type: TransactionType
  occurredOn: string
  description: string | null
  recurringTransactionId: string | null
}

export interface RecurringTransaction {
  id: string
  categoryId: string
  categoryName: string
  categoryType: CategoryType
  name: string
  defaultAmount: number
  intervalUnit: IntervalUnit
  intervalValue: number
  startDate: string
  nextDueDate: string
  endDate: string | null
  active: boolean
}

export interface RecurringOverride {
  id: string
  occurrenceDate: string
  overrideAmount: number
  note: string | null
}

export interface CategoryAmount {
  categoryId: string
  categoryName: string
  type: CategoryType
  amount: number
}

export interface MonthlyForecast {
  yearMonth: string
  projectedIncome: number
  projectedExpense: number
  netBalance: number
  runningBalance: number
  categoryBreakdown: CategoryAmount[]
}

export interface ForecastResponse {
  startingBalanceDate: string | null
  startingBalance: number
  months: MonthlyForecast[]
}

export interface BalanceCheckpoint {
  id: string
  checkpointDate: string
  balance: number
}
