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
  categoryIcon: string | null
  categoryColor: string | null
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
  categoryIcon: string
  categoryColor: string
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
  categoryIcon: string | null
  categoryColor: string | null
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

export interface CategorySuggestion {
  tempId: string
  name: string
  type: CategoryType
  color: string | null
}

export interface RecurringImportItem {
  name: string
  amount: number
  startDate: string
  occurrenceCount: number
  existingCategoryId: string | null
  newCategoryTempId: string | null
}

export interface OneOffImportItem {
  occurredOn: string
  name: string
  amount: number
  needsCategory: boolean
  existingCategoryId: string | null
  newCategoryTempId: string | null
}

export interface BalanceCheckpointImportItem {
  checkpointDate: string
  balance: number
}

export interface ImportSummary {
  sheetsProcessed: number
  recurringDetected: number
  oneOffDetected: number
  categoriesToCreate: number
  itemsNeedingCategory: number
  checkpointsDetected: number
}

export interface ExcelImportPreviewResponse {
  newCategorySuggestions: CategorySuggestion[]
  recurringTransactions: RecurringImportItem[]
  oneOffTransactions: OneOffImportItem[]
  balanceCheckpoints: BalanceCheckpointImportItem[]
  summary: ImportSummary
}

export interface ExcelImportResult {
  categoriesCreated: number
  recurringTransactionsCreated: number
  transactionsCreated: number
  checkpointsCreated: number
}

export interface DataCleanupResult {
  transactionsDeleted: number
  recurringTransactionsDeleted: number
  balanceCheckpointsDeleted: number
  expenseRemindersDeleted: number
}

export interface ExpenseReminder {
  id: string
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
  name: string
  amount: number | null
  intervalUnit: IntervalUnit
  intervalValue: number
  startDate: string
  nextDueDate: string
  endDate: string | null
  active: boolean
  notifyDaysBefore: number | null
}

export interface ExpenseReminderOccurrence {
  reminderId: string
  name: string
  date: string
  amount: number | null
}

export interface MonthlyReminders {
  yearMonth: string
  occurrences: ExpenseReminderOccurrence[]
}

export interface UpcomingRemindersResponse {
  months: MonthlyReminders[]
}

export interface Debt {
  id: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  name: string
  totalAmount: number
  alreadyPaidAmount: number
  alreadyPaidAsOf: string | null
  paidAmount: number
  remainingAmount: number
  monthlyPaymentAmount: number | null
  active: boolean
  createdAt: string
}

export interface Profile {
  email: string
  nickname: string | null
  defaultSalaryAmount: number | null
  salaryDay: number | null
  avatarKey: string | null
}
