import type { LocalDatabase } from '../db/database'
import { requiredDate } from '../validate'

// Porting di DataCleanupService: ripulisce i dati "diario" per un reimport pulito da
// Excel. Le categorie non si toccano: sono riferimenti riusabili, non eventi datati.

function changes(db: LocalDatabase): number {
  return db.get<{ n: number }>('SELECT changes() AS n')!.n
}

export function cleanupData(db: LocalDatabase, query: Record<string, string | undefined>) {
  const from = query.from ? requiredDate({ from: query.from }, 'from') : null
  const to = query.to ? requiredDate({ to: query.to }, 'to') : null

  return db.transaction(() => {
    if (from === null && to === null) {
      db.run('DELETE FROM transactions')
      const transactionsDeleted = changes(db)
      db.run('DELETE FROM recurring_transactions')
      const recurringTransactionsDeleted = changes(db)
      db.run('DELETE FROM balance_checkpoints')
      const balanceCheckpointsDeleted = changes(db)
      db.run('DELETE FROM expense_reminders')
      const expenseRemindersDeleted = changes(db)
      return { transactionsDeleted, recurringTransactionsDeleted, balanceCheckpointsDeleted, expenseRemindersDeleted }
    }

    const range = { from: from ?? '0000-01-01', to: to ?? '9999-12-31' }
    db.run('DELETE FROM transactions WHERE occurred_on BETWEEN :from AND :to', range)
    const transactionsDeleted = changes(db)
    db.run('DELETE FROM balance_checkpoints WHERE checkpoint_date BETWEEN :from AND :to', range)
    const balanceCheckpointsDeleted = changes(db)
    return { transactionsDeleted, recurringTransactionsDeleted: 0, balanceCheckpointsDeleted, expenseRemindersDeleted: 0 }
  })
}
