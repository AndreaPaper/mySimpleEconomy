import type { LocalDatabase } from '../db/database'
import type { IsoDate } from '../dates'
import { newId, nowIso } from '../ids'
import { isCurrentlyActive, nextOccurrence, type IntervalUnit } from './schedule'

// Porting di RecurringTransactionGenerationService: genera le transazioni delle regole
// arrivate a scadenza, recuperando tutte quelle arretrate.

export interface RecurringRow {
  id: string
  category_id: string
  name: string
  default_amount: number // centesimi
  interval_unit: IntervalUnit
  interval_value: number
  start_date: IsoDate
  next_due_date: IsoDate
  end_date: IsoDate | null
  active: number
  created_at: string
}

export function processDueRule(db: LocalDatabase, ruleId: string, today: IsoDate): boolean {
  const rule = db.get<RecurringRow>('SELECT * FROM recurring_transactions WHERE id = :id', { id: ruleId })
  if (!rule) return false

  let changed = false
  let due = rule.next_due_date
  while (isCurrentlyActive(rule, today) && due <= today) {
    generateOccurrence(db, rule, due)
    due = nextOccurrence(due, rule.start_date, rule.interval_unit, rule.interval_value)
    changed = true
  }
  if (changed) db.run('UPDATE recurring_transactions SET next_due_date = :due WHERE id = :id', { id: ruleId, due })
  if (rule.active === 1 && !isCurrentlyActive(rule, today)) {
    db.run('UPDATE recurring_transactions SET active = 0 WHERE id = :id', { id: ruleId })
    changed = true
  }
  return changed
}

function generateOccurrence(db: LocalDatabase, rule: RecurringRow, due: IsoDate): void {
  const override = db.get<{ override_amount: number }>(
    'SELECT override_amount FROM recurring_overrides WHERE recurring_transaction_id = :id AND occurrence_date = :due',
    { id: rule.id, due },
  )
  const type = db.get<{ type: string }>('SELECT type FROM categories WHERE id = :id', { id: rule.category_id })!.type
  // Alla data vera della scadenza, non al primo del mese.
  db.run(
    `INSERT INTO transactions (id, category_id, recurring_transaction_id, amount, type, occurred_on, description,
       import_provisional, created_at)
     VALUES (:id, :category, :rule, :amount, :type, :due, :name, 0, :now)`,
    {
      id: newId(),
      category: rule.category_id,
      rule: rule.id,
      amount: override?.override_amount ?? rule.default_amount,
      type,
      due,
      name: rule.name,
      now: nowIso(),
    },
  )
}
