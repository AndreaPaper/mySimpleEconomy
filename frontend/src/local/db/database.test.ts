import { describe, expect, it } from 'vitest'
import { LocalDatabase, memoryStorage, type DatabaseStorage } from './database'
import { MIGRATIONS } from './schema'

// Il database locale: lo stesso SQLite (sql.js) che gira sul telefono.

/** Uno storage in memoria che ricorda l'ultimo file salvato, come farebbe il telefono. */
function fakeDisk(): DatabaseStorage & { file: Uint8Array | null; saves: number } {
  const disk = {
    file: null as Uint8Array | null,
    saves: 0,
    load: async () => disk.file,
    save: async (bytes: Uint8Array) => {
      disk.file = bytes
      disk.saves++
    },
  }
  return disk
}

describe('il database locale', () => {
  it('alla prima apertura crea lo schema e segna la versione', async () => {
    const db = await LocalDatabase.open(memoryStorage)

    const tabelle = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name)
    expect(tabelle).toEqual(expect.arrayContaining(['profile', 'categories', 'transactions', 'debts']))
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length)
  })

  /**
   * I dati sopravvivono alla chiusura dell'app: il file salvato viene riaperto, e le
   * migrazioni già applicate non vengono ripetute (rieseguire una CREATE TABLE su un
   * database esistente fallirebbe, e l'app non si aprirebbe più).
   */
  it('riaprendo il file salvato ritrova i dati e non rifà le migrazioni', async () => {
    const disk = fakeDisk()
    const prima = await LocalDatabase.open(disk)
    prima.run("INSERT INTO categories (id, name, type, created_at) VALUES ('c1', 'Casa', 'EXPENSE', 'x')")
    await prima.save()

    const dopo = await LocalDatabase.open(disk)

    expect(dopo.all<{ name: string }>('SELECT name FROM categories')).toEqual([{ name: 'Casa' }])
  })

  // Spente di default in SQLite: senza, una categoria con transazioni si
  // cancellerebbe lasciandole orfane, invece di essere rifiutata come sul server.
  it('le chiavi esterne sono attive', async () => {
    const db = await LocalDatabase.open(memoryStorage)
    db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('c1', 'Casa', 'EXPENSE', 'x')")
    db.run(
      "INSERT INTO transactions (id, category_id, amount, type, occurred_on, created_at) VALUES ('t1', 'c1', 100, 'EXPENSE', '2026-01-01', 'x')",
    )

    expect(() => db.run("DELETE FROM categories WHERE id = 'c1'")).toThrow(/FOREIGN KEY/)
  })

  it('una transazione che fallisce non lascia scritture a metà', async () => {
    const db = await LocalDatabase.open(memoryStorage)

    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('c1', 'Casa', 'EXPENSE', 'x')")
        throw new Error('a metà')
      }),
    ).toThrow('a metà')
    expect(db.all('SELECT * FROM categories')).toEqual([])
  })

  /**
   * I salvataggi in fila: il file finale è quello dell'ultima modifica, anche se le
   * scritture sono partite quasi insieme.
   */
  it('due salvataggi ravvicinati lasciano su disco l ultimo stato', async () => {
    const disk = fakeDisk()
    const db = await LocalDatabase.open(disk)
    db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('c1', 'Casa', 'EXPENSE', 'x')")
    const primo = db.save()
    db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('c2', 'Auto', 'EXPENSE', 'x')")
    await Promise.all([primo, db.save()])

    const riaperto = await LocalDatabase.open(disk)
    expect(riaperto.all('SELECT id FROM categories ORDER BY id')).toEqual([{ id: 'c1' }, { id: 'c2' }])
  })
})
