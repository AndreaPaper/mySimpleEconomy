import initSqlJs from 'sql.js/dist/sql-wasm-inline.js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { categoriesApi, debtsApi, recurringApi, transactionsApi } from '../api/endpoints'
import { createTestQueryClient, withQueryClient } from '../test/queryClient'
import { LocalBackend } from './backend'
import { createBackup, currentSummary, readBackup, restoreBackup } from './backup'
import BackupPanel from './BackupPanel'
import { blobBytes } from './blobs'
import { MIGRATIONS } from './db/schema'
import { toBase64 } from './storage'
import { withFreshLocalBackend } from './testing'

// Il backup dell'app per il telefono: l'unica copia dei dati fuori dal telefono. Un
// backup che non si ripristina, o un ripristino che perde dati, si scopre il giorno in
// cui serve: per questo ogni promessa del modulo ha il suo test.

const backend = withFreshLocalBackend('2026-11-12')

const allTransactions = async () =>
  (await transactionsApi.list({ from: '1900-01-01', to: '2999-12-31' })).content.map((t) => [
    t.occurredOn,
    t.description,
    t.amount,
    t.categoryName,
  ])

async function someData() {
  const spesa = await categoriesApi.create({ name: 'Spesa', type: 'EXPENSE' })
  await transactionsApi.create({ categoryId: spesa.id, occurredOn: '2026-10-03', amount: 42.5, type: 'EXPENSE', description: 'Coop' })
  await transactionsApi.create({ categoryId: spesa.id, occurredOn: '2026-11-02', amount: 10, type: 'EXPENSE', description: 'Forno' })
  await debtsApi.create({ categoryId: spesa.id, name: 'Prestito', totalAmount: 300 })
  return spesa
}

/** Il file di backup come lo sceglierebbe chi ripristina. */
async function backupFile(): Promise<File> {
  const { blob } = await createBackup(backend(), new Date('2026-11-12T10:00:00Z'))
  return new File([await blobBytes(blob)], 'backup.json')
}

const fileWith = (content: unknown) => new File([JSON.stringify(content)], 'backup.json')

describe('backup e ripristino', () => {
  it('il backup porta tutti i dati, e il ripristino li rimette come erano', async () => {
    const spesa = await someData()
    const before = await allTransactions()
    const file = await backupFile()
    // Dopo il backup i dati cambiano: una spesa in più, una categoria in più.
    await transactionsApi.create({ categoryId: spesa.id, occurredOn: '2026-11-10', amount: 99, type: 'EXPENSE', description: 'Dopo' })
    await categoriesApi.create({ name: 'Nuova', type: 'EXPENSE' })

    await restoreBackup(backend(), await readBackup(file), '2026-11-12')

    expect(await allTransactions()).toEqual(before)
    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Spesa'])
    expect((await debtsApi.list()).map((d) => d.name)).toEqual(['Prestito'])
  })

  it('prima di ripristinare dice cosa contiene il backup', async () => {
    await someData()

    const backup = await readBackup(await backupFile())

    expect(backup.createdAt).toBe('2026-11-12T10:00:00.000Z')
    expect(backup.summary).toEqual({
      transactions: 2,
      categories: 1,
      recurringTransactions: 0,
      reminders: 0,
      debts: 1,
      firstTransactionDate: '2026-10-03',
      lastTransactionDate: '2026-11-02',
    })
  })

  it('il nome del file porta il giorno del backup', async () => {
    const { filename, blob } = await createBackup(backend(), new Date('2026-11-12T10:00:00Z'))

    expect(filename).toBe('myeconomy-backup-2026-11-12.json')
    expect(blob.type).toBe('application/json')
  })

  it('un file che non è un backup viene rifiutato senza toccare i dati', async () => {
    await someData()
    const before = await allTransactions()

    await expect(readBackup(new File(['ciao'], 'x.json'))).rejects.toThrow('Questo file non è un backup di MySimpleEconomy.')
    await expect(readBackup(fileWith({ format: 'altro', database: '' }))).rejects.toThrow(
      'Questo file non è un backup di MySimpleEconomy.',
    )
    await expect(readBackup(fileWith({ format: 'myeconomy-backup', version: 1, database: '%%%' }))).rejects.toThrow(
      'Il backup è danneggiato e non si può ripristinare.',
    )
    await expect(
      readBackup(fileWith({ format: 'myeconomy-backup', version: 1, database: toBase64(new TextEncoder().encode('non sqlite')) })),
    ).rejects.toThrow('Il backup è danneggiato e non si può ripristinare.')
    expect(await allTransactions()).toEqual(before)
  })

  // Un SQLite valido ma non dell'app (manca la tabella delle transazioni).
  it("un database che non è dell'app viene rifiutato", async () => {
    const SQL = await initSqlJs()
    const other = new SQL.Database()
    other.run('CREATE TABLE altro (x)')

    await expect(
      readBackup(fileWith({ format: 'myeconomy-backup', version: 1, database: toBase64(other.export()) })),
    ).rejects.toThrow('Il backup è danneggiato e non si può ripristinare.')
  })

  // Un'app vecchia non può capire un database più nuovo: va aggiornata, non forzata.
  it("un backup di una versione più nuova dell'app chiede di aggiornarla", async () => {
    const newer = backend().db.export()
    const SQL = await initSqlJs()
    const db = new SQL.Database(newer)
    db.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
    const message = "Il backup è stato fatto con una versione più nuova dell'app: aggiornala, poi riprova."

    await expect(
      readBackup(fileWith({ format: 'myeconomy-backup', version: 1, database: toBase64(db.export()) })),
    ).rejects.toThrow(message)
    await expect(readBackup(fileWith({ format: 'myeconomy-backup', version: 2, database: '' }))).rejects.toThrow(message)
  })

  // Il motivo per cui il backup è il database intero: uno vecchio passa dalle stesse
  // migrazioni del telefono.
  it('un backup di una versione vecchia si aggiorna ripristinandolo', async () => {
    const SQL = await initSqlJs()
    const old = new SQL.Database()
    old.exec(MIGRATIONS[0])
    old.run('PRAGMA user_version = 1')
    old.run(
      "INSERT INTO categories (id, name, type, archived, created_at) VALUES ('c1', 'Vecchia', 'EXPENSE', 0, '2026-01-01T00:00:00.000Z')",
    )
    const backup = await readBackup(fileWith({ format: 'myeconomy-backup', version: 1, database: toBase64(old.export()) }))

    await restoreBackup(backend(), backup, '2026-11-12')

    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Vecchia'])
    // La tabella della migrazione 2 c'è, e i job l'hanno già usata.
    expect(backend().db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'jobs.lastRun'")?.value).toBe('2026-11-12')
  })

  // Un backup di un mese fa: lo stipendio e le altre regole scadute nel frattempo si
  // registrano al ripristino, come all'apertura dell'app dopo un mese.
  it('dopo il ripristino i job recuperano le scadenze passate dal backup', async () => {
    const spesa = await categoriesApi.create({ name: 'Spesa', type: 'EXPENSE' })
    await recurringApi.create({
      categoryId: spesa.id,
      name: 'Affitto',
      defaultAmount: 500,
      intervalUnit: 'MONTH',
      intervalValue: 1,
      startDate: '2026-12-01',
      nextDueDate: '2026-12-01',
      endDate: null,
    })
    const backup = await readBackup(await backupFile())

    await restoreBackup(backend(), backup, '2027-01-15')

    expect((await allTransactions()).map((t) => t[0])).toEqual(['2027-01-01', '2026-12-01'])
  })

  it('il ripristino arriva su disco, e se la scrittura fallisce i dati restano quelli di prima', async () => {
    let saved: Uint8Array | null = null
    let failing = false
    const storage = {
      load: async () => saved,
      save: async (bytes: Uint8Array) => {
        if (failing) throw new Error('disco pieno')
        saved = bytes
      },
    }
    const own = await LocalBackend.open(storage, '2026-11-12')
    own.db.run(
      "INSERT INTO categories (id, name, type, archived, created_at) VALUES ('c0', 'Prima', 'EXPENSE', 0, '2026-01-01T00:00:00.000Z')",
    )
    await own.db.save()
    await someData()
    const backup = await readBackup(await backupFile())

    failing = true
    await expect(restoreBackup(own, backup, '2026-11-12')).rejects.toThrow('disco pieno')
    expect(own.db.all<{ name: string }>('SELECT name FROM categories').map((c) => c.name)).toEqual(['Prima'])

    failing = false
    await restoreBackup(own, backup, '2026-11-12')
    const reopened = await LocalBackend.open(storage, '2026-11-12')
    expect(reopened.db.all<{ name: string }>('SELECT name FROM categories').map((c) => c.name)).toEqual(['Spesa'])
  })
})

describe('la scheda Backup', () => {
  it('chiede conferma mostrando backup e dati attuali, poi ripristina', async () => {
    await someData()
    const file = await backupFile()
    await categoriesApi.create({ name: 'Da perdere', type: 'EXPENSE' })
    // Una pagina aperta prima del ripristino ha i dati vecchi in cache.
    const client = createTestQueryClient()
    client.setQueryData(['categories'], [{ name: 'Da perdere' }])
    render(withQueryClient(<BackupPanel />, client))

    fireEvent.change(screen.getByLabelText('File di backup'), { target: { files: [file] } })

    const dialog = await screen.findByText('Ripristinare questo backup?')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Nel backup del 12/11/2026:')).toBeInTheDocument()
    expect(screen.getByText('1 categoria')).toBeInTheDocument()
    expect(screen.getAllByText('2 transazioni (dal 03/10/2026 al 02/11/2026)')).toHaveLength(2)
    expect(screen.getByText('2 categorie')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sostituisci i dati' }))

    expect(await screen.findByText('Backup ripristinato.')).toBeInTheDocument()
    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Spesa'])
    // …e dopo non li mostra più: la cache è da rileggere.
    expect(client.getQueryState(['categories'])?.isInvalidated).toBe(true)
  })

  it('annullando, i dati restano', async () => {
    await someData()
    const file = await backupFile()
    await categoriesApi.create({ name: 'Resta', type: 'EXPENSE' })
    render(withQueryClient(<BackupPanel />))

    fireEvent.change(screen.getByLabelText('File di backup'), { target: { files: [file] } })
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }))

    await waitFor(() => expect(screen.queryByText('Ripristinare questo backup?')).not.toBeInTheDocument())
    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Spesa', 'Resta'])
  })

  it('un file sbagliato mostra il motivo, senza chiedere conferma', async () => {
    render(withQueryClient(<BackupPanel />))

    fireEvent.change(screen.getByLabelText('File di backup'), { target: { files: [new File(['x'], 'x.json')] } })

    expect(await screen.findByText('Questo file non è un backup di MySimpleEconomy.')).toBeInTheDocument()
    expect(screen.queryByText('Ripristinare questo backup?')).not.toBeInTheDocument()
  })

  // Nel browser (e qui) il file si scarica con un link; sul telefono passa da Condividi.
  it('esporta il backup come file', async () => {
    const blobs: Blob[] = []
    const names: string[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => (blobs.push(blob), 'blob:backup'))
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    render(withQueryClient(<BackupPanel />))

    await userEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))

    expect(await screen.findByText(/Backup creato/)).toBeInTheDocument()
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^myeconomy-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect((await readBackup(new File([await blobBytes(blobs[0])], names[0]))).summary.categories).toBe(0)
    click.mockRestore()
  })
})

// currentSummary è quello che la conferma mostra come "sul telefono adesso".
it('il riepilogo dei dati attuali conta quello che c’è', async () => {
  await someData()
  expect((await currentSummary(backend())).transactions).toBe(2)
})
