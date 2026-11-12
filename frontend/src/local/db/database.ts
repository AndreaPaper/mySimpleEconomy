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

  // Non readonly: il ripristino di un backup lo sostituisce (replaceWith).
  private db: SqlJsDatabase
  private readonly storage: DatabaseStorage

  private constructor(db: SqlJsDatabase, storage: DatabaseStorage) {
    this.db = db
    this.storage = storage
  }

  static async open(storage: DatabaseStorage): Promise<LocalDatabase> {
    const saved = await storage.load()
    const db = await openSqlite(saved)
    const local = new LocalDatabase(db, storage)
    if (migrate(db)) {
      await local.save()
    }
    return local
  }

  /**
   * Sostituisce tutto il database con un altro (il ripristino di un backup), lo porta
   * alla versione dello schema di quest'app e lo salva. Chi chiama ha già controllato
   * che sia un database dell'app (vedi backup.ts).
   */
  async replaceWith(bytes: Uint8Array): Promise<void> {
    // Tutto o niente: il database nuovo si migra e si scrive su disco prima di prendere
    // il posto di quello attuale. Se un passo fallisce, i dati di prima restano, in
    // memoria e su disco.
    const incoming = await openSqlite(bytes)
    try {
      migrate(incoming)
      // Dopo i salvataggi in corso: uno che finisse dopo riscriverebbe i dati vecchi.
      await this.saving
      await this.storage.save(incoming.export())
    } catch (error) {
      incoming.close()
      throw error
    }
    const previous = this.db
    this.db = incoming
    previous.close()
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

/** Applica le migrazioni mancanti, tutte o nessuna. Vero se ne ha applicata almeno una. */
function migrate(db: SqlJsDatabase): boolean {
  const current = Number(db.exec('PRAGMA user_version')[0].values[0][0])
  if (current >= MIGRATIONS.length) return false
  db.exec('BEGIN')
  try {
    for (let version = current; version < MIGRATIONS.length; version++) {
      db.exec(MIGRATIONS[version])
    }
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return true
}

async function openSqlite(bytes: Uint8Array | null): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs()
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database()
  // Le chiavi esterne in SQLite sono spente di default: senza, una categoria con
  // transazioni si cancellerebbe lasciandole orfane, invece di essere rifiutata
  // come sul server.
  db.run('PRAGMA foreign_keys = ON')
  return db
}

function bind(params: Params): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {}
  for (const [key, value] of Object.entries(params)) {
    out[`:${key}`] = value === undefined ? null : typeof value === 'boolean' ? (value ? 1 : 0) : value
  }
  return out
}
