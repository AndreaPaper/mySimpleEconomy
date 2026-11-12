import type { LocalDatabase } from '../db/database'
import { newId, nowIso } from '../ids'
import { toCents, toEuros } from '../money'
import { bodyOf, requiredDate, requiredNumber } from '../validate'
import type { TransactionRow } from './transactions'

// Porting di BalanceCheckpointService e CheckpointRules.

export interface CheckpointRow {
  id: string
  checkpoint_date: string
  balance: number // centesimi
  counts_from: string | null
  created_at: string
}

function response(row: CheckpointRow) {
  return { id: row.id, checkpointDate: row.checkpoint_date, balance: toEuros(row.balance) }
}

export function listCheckpoints(db: LocalDatabase) {
  return db.all<CheckpointRow>('SELECT * FROM balance_checkpoints ORDER BY checkpoint_date DESC').map(response)
}

/** Crea il saldo di quel giorno, o aggiorna quello che c'è già. */
export function upsertCheckpoint(db: LocalDatabase, raw: unknown) {
  const body = bodyOf(raw)
  const date = requiredDate(body, 'checkpointDate')
  const balance = toCents(requiredNumber(body, 'balance'))
  // Chi scrive un saldo a mano lo legge adesso sul conto: quello che ha già registrato
  // oggi è dentro quel numero. Si riscrive anche aggiornando un saldo esistente,
  // perché il momento buono è l'ultimo.
  const countsFrom = nowIso()
  const existing = db.get<CheckpointRow>('SELECT * FROM balance_checkpoints WHERE checkpoint_date = :date', { date })
  if (existing) {
    db.run('UPDATE balance_checkpoints SET balance = :balance, counts_from = :countsFrom WHERE id = :id', {
      id: existing.id,
      balance,
      countsFrom,
    })
  } else {
    db.run(
      `INSERT INTO balance_checkpoints (id, checkpoint_date, balance, counts_from, created_at)
       VALUES (:id, :date, :balance, :countsFrom, :countsFrom)`,
      { id: newId(), date, balance, countsFrom },
    )
  }
  return response(db.get<CheckpointRow>('SELECT * FROM balance_checkpoints WHERE checkpoint_date = :date', { date })!)
}

/**
 * Il saldo di riferimento più recente non successivo a quel giorno, o undefined.
 * findFirstByUserIdAndCheckpointDateLessThanEqualOrderByCheckpointDateDesc.
 */
export function latestCheckpointOnOrBefore(db: LocalDatabase, date: string): CheckpointRow | undefined {
  return db.get<CheckpointRow>(
    'SELECT * FROM balance_checkpoints WHERE checkpoint_date <= :date ORDER BY checkpoint_date DESC LIMIT 1',
    { date },
  )
}

/**
 * Se una transazione conta sopra un saldo registrato (CheckpointRules.counts).
 *
 * Quelle dopo il giorno del saldo contano sempre. Quelle dello stesso giorno dipendono
 * da cosa vuol dire il saldo: letto in un momento preciso (scritto a mano, counts_from)
 * contano solo quelle registrate da quel momento in poi, perché le altre erano già nel
 * numero; a inizio giornata (counts_from nullo: i saldi dell'import Excel) contano tutte.
 */
export function countsAfterCheckpoint(transaction: TransactionRow, checkpoint: CheckpointRow | undefined): boolean {
  if (!checkpoint) return true
  if (transaction.occurred_on !== checkpoint.checkpoint_date) return true
  if (checkpoint.counts_from === null) return true
  return transaction.created_at >= checkpoint.counts_from
}
