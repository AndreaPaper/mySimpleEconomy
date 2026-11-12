import initSqlJs from 'sql.js/dist/sql-wasm-inline.js'
import type { Database as SqlJsDatabase, SqlValue } from 'sql.js'
import { MIGRATIONS } from './schema'

/**
 * Dove il database locale vive fra un'apertura dell'app e l'altra.
 *
 * sql.js tiene il database in memoria: la persistenza è un file con il database
 * intero, riscritto dopo ogni modifica. Con i dati di una persona (qualche migliaio
 * di movimenti, pochi megabyte) è veloce, e ha un vantaggio che conta più della
 * velocità: lo stesso motore SQLite gira nei test, nel browser e sul telefono, quindi
 * quello che i test provano è quello che gira da lei.
 */
export interface DatabaseStorage {
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
}

/** Nessuna persistenza: per i test, che partono ogni volta da un database vuoto. */
export const memoryStorage: DatabaseStorage = {
  load: async () => null,
  save: async () => {},
}

export type Params = Record<string, SqlValue | boolean | undefined>

/**
 * Il database locale: SQL con parametri nominati (:nome), e il salvataggio.
 *
 * I booleani diventano 0/1 e undefined diventa NULL già qui, così chi scrive le
 * query non deve ricordarselo.
 */
export class LocalDatabase {
  private saving: Promise<void> = Promise.resolve()

  private readonly db: SqlJsDatabase
  private readonly storage: DatabaseStorage

  private constructor(db: SqlJsDatabase, storage: DatabaseStorage) {
    this.db = db
    this.storage = storage
  }

  static async open(storage: DatabaseStorage): Promise<LocalDatabase> {
    const SQL = await initSqlJs()
    const saved = await storage.load()
    const db = saved ? new SQL.Database(saved) : new SQL.Database()
    // Le chiavi esterne in SQLite sono spente di default: senza, una categoria con
    // transazioni si cancellerebbe lasciandole orfane, invece di essere rifiutata
    // come sul server.
    db.run('PRAGMA foreign_keys = ON')
    const local = new LocalDatabase(db, storage)
    if (local.migrate()) {
      await local.save()
    }
    return local
  }

  /** Applica le migrazioni mancanti. Vero se ne ha applicata almeno una. */
  private migrate(): boolean {
    const current = Number(this.db.exec('PRAGMA user_version')[0].values[0][0])
    if (current >= MIGRATIONS.length) return false
    this.transaction(() => {
      for (let version = current; version < MIGRATIONS.length; version++) {
        this.db.exec(MIGRATIONS[version])
      }
      this.db.run(`PRAGMA user_version = ${MIGRATIONS.length}`)
    })
    return true
  }

  all<T>(sql: string, params: Params = {}): T[] {
    const statement = this.db.prepare(sql)
    try {
      statement.bind(bind(params))
      const rows: T[] = []
      while (statement.step()) rows.push(statement.getAsObject() as T)
      return rows
    } finally {
      statement.free()
    }
  }

  get<T>(sql: string, params: Params = {}): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  run(sql: string, params: Params = {}): void {
    this.db.run(sql, bind(params))
  }

  /**
   * Tutto o niente, come le @Transactional del backend: se fn lancia, nessuna delle
   * sue scritture resta. Le transazioni annidate si appoggiano a quella esterna.
   */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn()
    this.db.exec('BEGIN')
    this.inTransaction = true
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      this.inTransaction = false
    }
  }

  private inTransaction = false

  /**
   * Scrive il database sullo storage. I salvataggi si mettono in fila: due modifiche
   * ravvicinate non devono scrivere il file nello stesso momento, con il rischio che
   * la più vecchia arrivi per ultima e cancelli la più recente.
   */
  save(): Promise<void> {
    this.saving = this.saving.then(() => this.storage.save(this.db.export()))
    return this.saving
  }

  /** Il database intero, per il backup. */
  export(): Uint8Array {
    return this.db.export()
  }
}

function bind(params: Params): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {}
  for (const [key, value] of Object.entries(params)) {
    out[`:${key}`] = value === undefined ? null : typeof value === 'boolean' ? (value ? 1 : 0) : value
  }
  return out
}
