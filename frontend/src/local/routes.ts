import type { Router } from './router'
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  generateDefaultCategories,
  listArchivedCategories,
  listCategories,
  unarchiveCategory,
  updateCategory,
} from './services/categories'
import { listCheckpoints, upsertCheckpoint } from './services/checkpoints'
import { cleanupData } from './services/dataCleanup'
import { createDebt, deleteDebt, listDebts, updateDebt } from './services/debts'
import { forecast } from './services/forecast'
import { getProfile, updateProfile } from './services/profile'
import {
  createOverride,
  createRecurring,
  deleteOverride,
  deleteRecurring,
  listOverrides,
  listRecurring,
  setRecurringActive,
  updateRecurring,
} from './services/recurring'
import {
  createReminder,
  listReminders,
  setReminderActive,
  upcomingReminders,
  updateReminder,
} from './services/reminders'
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from './services/transactions'

/**
 * Le rotte del backend locale, una per ogni metodo dei controller Spring portato fin
 * qui. Quelle che mancano rispondono 501 (vedi LocalBackend.handle), così la loro
 * assenza si vede subito invece di passare per un errore qualunque.
 */
export function registerRoutes(router: Router): Router {
  // Lo usa OfflineSyncContext per capire se il server risponde: in locale risponde
  // sempre.
  router.get('/ping', () => 'ok')

  // CategoryController
  router.get('/categories', ({ db }) => listCategories(db))
  router.get('/categories/archived', ({ db }) => listArchivedCategories(db))
  router.post('/categories', ({ db, body }) => createCategory(db, body))
  router.post('/categories/generate-defaults', ({ db }) => generateDefaultCategories(db))
  router.put('/categories/{id}', ({ db, params, body }) => updateCategory(db, params.id, body))
  router.post('/categories/{id}/archive', ({ db, params }) => archiveCategory(db, params.id))
  router.post('/categories/{id}/unarchive', ({ db, params }) => unarchiveCategory(db, params.id))
  router.delete('/categories/{id}', ({ db, params }) => deleteCategory(db, params.id))

  // TransactionController
  router.get('/transactions', ({ db, query }) => listTransactions(db, query))
  router.post('/transactions', ({ db, body }) => createTransaction(db, body))
  router.put('/transactions/{id}', ({ db, params, body }) => updateTransaction(db, params.id, body))
  router.delete('/transactions/{id}', ({ db, params }) => deleteTransaction(db, params.id))

  // BalanceCheckpointController
  router.get('/balance-checkpoints', ({ db }) => listCheckpoints(db))
  router.post('/balance-checkpoints', ({ db, body }) => upsertCheckpoint(db, body))

  // ProfileController
  router.get('/profile', ({ db }) => getProfile(db))
  router.put('/profile', ({ db, body }) => updateProfile(db, body))

  // DataCleanupController
  router.delete('/data-cleanup', ({ db, query }) => cleanupData(db, query))

  // RecurringTransactionController
  router.get('/recurring-transactions', ({ db }) => listRecurring(db))
  router.post('/recurring-transactions', ({ db, body }) => createRecurring(db, body))
  router.put('/recurring-transactions/{id}', ({ db, params, body }) => updateRecurring(db, params.id, body))
  router.post('/recurring-transactions/{id}/deactivate', ({ db, params }) => setRecurringActive(db, params.id, false))
  router.post('/recurring-transactions/{id}/reactivate', ({ db, params }) => setRecurringActive(db, params.id, true))
  router.delete('/recurring-transactions/{id}', ({ db, params }) => deleteRecurring(db, params.id))
  router.get('/recurring-transactions/{id}/overrides', ({ db, params }) => listOverrides(db, params.id))
  router.post('/recurring-transactions/{id}/overrides', ({ db, params, body }) => createOverride(db, params.id, body))
  router.delete('/recurring-transactions/{id}/overrides/{overrideId}', ({ db, params }) =>
    deleteOverride(db, params.id, params.overrideId),
  )

  // ExpenseReminderController
  router.get('/expense-reminders', ({ db }) => listReminders(db))
  router.get('/expense-reminders/upcoming', ({ db, query }) => upcomingReminders(db, query))
  router.post('/expense-reminders', ({ db, body }) => createReminder(db, body))
  router.put('/expense-reminders/{id}', ({ db, params, body }) => updateReminder(db, params.id, body))
  router.post('/expense-reminders/{id}/deactivate', ({ db, params }) => setReminderActive(db, params.id, false))
  router.post('/expense-reminders/{id}/reactivate', ({ db, params }) => setReminderActive(db, params.id, true))

  // ForecastController
  router.get('/forecast', ({ db, query }) => forecast(db, query))

  // DebtController
  router.get('/debts', ({ db }) => listDebts(db))
  router.post('/debts', ({ db, body }) => createDebt(db, body))
  router.put('/debts/{id}', ({ db, params, body }) => updateDebt(db, params.id, body))
  router.delete('/debts/{id}', ({ db, params }) => deleteDebt(db, params.id))

  return router
}
