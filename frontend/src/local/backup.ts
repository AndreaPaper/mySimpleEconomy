import initSqlJs from 'sql.js/dist/sql-wasm-inline.js'
import type { LocalBackend } from './backend'
import { blobBytes } from './blobs'
import { MIGRATIONS } from './db/schema'
import { fromBase64, toBase64 } from './storage'

// Il backup dei dati del telefono: un file da tenere fuori dal telefono (Drive, email),
// l'unica copia dei dati se il telefono si perde o l'app si disinstalla.
//
// Il file è un JSON con dentro il database intero (SQLite, in base64), più le
// informazioni per riconoscerlo e per mostrare cosa contiene prima di ripristinarlo.
// Il database intero e non le tabelle una per una: così un backup fatto con una
// versione vecchia dell'app si ripristina con quella nuova passando dalle stesse
// migrazioni che aggiornano il database del telefono, senza un secondo percorso da
// tenere allineato.

const FORMAT = 'myeconomy-backup'
const VERSION = 1

/** Cosa c'è in un database: per mostrarlo prima di sostituire i dati. */
export interface BackupSummary {
  transactions: number
  categories: number
  recurringTransactions: number
  reminders: number
  debts: number
  firstTransactionDate: string | null
  lastTransactionDate: string | null
}

interface BackupFile {
  format: typeof FORMAT
  version: number
  createdAt: string
  schemaVersion: number
  summary: BackupSummary
  database: string
}

/** Un backup letto e controllato, pronto da ripristinare. */
export interface CheckedBackup {
  createdAt: string
  summary: BackupSummary
  bytes: Uint8Array
}

export class BackupError extends Error {}

/** Il file di backup dei dati attuali, e il nome con cui salvarlo. */
export async function createBackup(backend: LocalBackend, now: Date = new Date()): Promise<{ blob: Blob; filename: string }> {
  const bytes = backend.db.export()
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: now.toISOString(),
    schemaVersion: MIGRATIONS.length,
    summary: await summarize(bytes),
    database: toBase64(bytes),
  }
  const day = now.toLocaleDateString('sv-SE')
  return {
    blob: new Blob([JSON.stringify(file)], { type: 'application/json' }),
    filename: `myeconomy-backup-${day}.json`,
  }
}

/** Cosa contengono i dati attuali: per il confronto nella conferma del ripristino. */
export function currentSummary(backend: LocalBackend): Promise<BackupSummary> {
  return summarize(backend.db.export())
}

/**
 * Legge un file di backup e controlla che si possa ripristinare, senza toccare i dati
 * attuali. Ogni problema è un BackupError con un messaggio da mostrare così com'è.
 */
export async function readBackup(file: Blob): Promise<CheckedBackup> {
  let parsed: Partial<BackupFile>
  try {
    parsed = JSON.parse(new TextDecoder().decode(await blobBytes(file))) as Partial<BackupFile>
  } catch {
    throw new BackupError('Questo file non è un backup di MySimpleEconomy.')
  }
  if (parsed?.format !== FORMAT || typeof parsed.database !== 'string') {
    throw new BackupError('Questo file non è un backup di MySimpleEconomy.')
  }
  if (typeof parsed.version !== 'number' || parsed.version > VERSION) {
    throw new BackupError("Il backup è stato fatto con una versione più nuova dell'app: aggiornala, poi riprova.")
  }

  let bytes: Uint8Array
  try {
    bytes = fromBase64(parsed.database)
  } catch {
    throw new BackupError('Il backup è danneggiato e non si può ripristinare.')
  }
  const schemaVersion = await inspect(bytes)
  if (schemaVersion > MIGRATIONS.length) {
    throw new BackupError("Il backup è stato fatto con una versione più nuova dell'app: aggiornala, poi riprova.")
  }
  return { createdAt: String(parsed.createdAt ?? ''), summary: await summarize(bytes), bytes }
}

/** Sostituisce i dati attuali con quelli del backup. */
export async function restoreBackup(backend: LocalBackend, backup: CheckedBackup, today?: string): Promise<void> {
  await backend.restore(backup.bytes, today)
}

/**
 * Apre il database del backup a parte e controlla che sia intero e che sia dell'app.
 * Restituisce la versione del suo schema.
 */
async function inspect(bytes: Uint8Array): Promise<number> {
  const SQL = await initSqlJs()
  let db
  try {
    db = new SQL.Database(bytes)
    const integrity = db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0]
    const hasTransactions = db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").length > 0
    if (integrity !== 'ok' || !hasTransactions) throw new Error('non valido')
    return Number(db.exec('PRAGMA user_version')[0].values[0][0])
  } catch {
    throw new BackupError('Il backup è danneggiato e non si può ripristinare.')
  } finally {
    db?.close()
  }
}

async function summarize(bytes: Uint8Array): Promise<BackupSummary> {
  const SQL = await initSqlJs()
  const db = new SQL.Database(bytes)
  try {
    const one = (sql: string) => db.exec(sql)[0]?.values[0]?.[0] ?? null
    const count = (table: string) => Number(one(`SELECT COUNT(*) FROM ${table}`))
    return {
      transactions: count('transactions'),
      categories: count('categories'),
      recurringTransactions: count('recurring_transactions'),
      reminders: count('expense_reminders'),
      debts: count('debts'),
      firstTransactionDate: one('SELECT MIN(occurred_on) FROM transactions') as string | null,
      lastTransactionDate: one('SELECT MAX(occurred_on) FROM transactions') as string | null,
    }
  } finally {
    db.close()
  }
}
