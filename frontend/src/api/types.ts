export type CategoryType = 'INCOME' | 'EXPENSE'
export type TransactionType = 'INCOME' | 'EXPENSE'
export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export interface Category {
  id: string
  name: string
  type: CategoryType
  color: string | null
  icon: string | null
  // Null = categoria principale. La gerarchia è a un solo livello: una
  // categoria con parentId valorizzato non può avere sottocategorie proprie.
  parentId: string | null
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

export interface TransactionPage {
  content: Transaction[]
  hasNext: boolean
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

// Riga aggregata della card "Spese per categoria": `amount` è il totale
// complessivo (spese dirette sulla categoria + quelle di tutte le sue
// sottocategorie), `children` il dettaglio da mostrare quando si espande.
export interface CategoryAmountNode extends CategoryAmount {
  children: CategoryAmount[]
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
  currentBalance: number
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
  estimated: boolean
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
  // Sezione risparmio: quota delle entrate da mettere da parte. Resta
  // memorizzata anche a sezione spenta.
  savingsEnabled: boolean
  savingsPercent: number | null
  // Categoria dello stipendio, se configurato: serve a capire se lo stipendio
  // del periodo è già stato incassato o va ancora stimato.
  salaryCategoryId: string | null
}


// --- Import dell'estratto conto della banca ---------------------------------

export type BankSource = 'INTESA_SANPAOLO'

// Cosa succede a una riga dell'estratto conto. Riguarda solo doppioni ed
// esclusioni: la categoria è un'informazione a parte, perché una riga può
// benissimo essere nuova e avere una categoria ancora da mappare.
export type BankImportOutcome =
  | 'NUOVA'
  | 'GIA_IMPORTATA'
  | 'AGGIORNA_PROVVISORIA'
  | 'SOSPETTO_MANUALE'
  | 'SOSPETTO_RICORRENTE'
  | 'ESCLUSA'

export interface BankImportRowPreview {
  rowNumber: number
  occurredOn: string
  description: string
  rawOperation: string | null
  rawDetails: string | null
  bankCategory: string
  amount: number
  type: TransactionType
  provisional: boolean
  outcome: BankImportOutcome
  categoryId: string | null
  matchedTransactionId: string | null
  conflictDescription: string | null
  selectedByDefault: boolean
}

export interface BankCategoryMappingDto {
  bankCategory: string
  transactionType: TransactionType
  categoryId: string | null
  doNotImport: boolean
  rowCount: number
  sampleDescription: string | null
}

export interface BankImportExclusionDto {
  pattern: string
  note: string | null
}

export interface BankImportSummary {
  rowsInFile: number
  firstDate: string
  lastDate: string
  nuove: number
  giaImportate: number
  daAggiornare: number
  sospettiManuali: number
  sospettiRicorrenti: number
  escluse: number
  categorieDaMappare: number
}

export interface BankImportPreviewResponse {
  rows: BankImportRowPreview[]
  unmappedCategories: BankCategoryMappingDto[]
  exclusions: BankImportExclusionDto[]
  suggestedExclusions: BankImportExclusionDto[]
  summary: BankImportSummary
}

export interface BankImportCommitRow {
  occurredOn: string
  rawOperation: string | null
  rawDetails: string | null
  bankCategory: string
  amount: number
  type: TransactionType
  provisional: boolean
  description: string
  categoryId: string | null
  updateTransactionId: string | null
}

export interface BankImportResult {
  importate: number
  aggiornate: number
  saltate: number
  mappatureSalvate: number
  esclusioniSalvate: number
}
