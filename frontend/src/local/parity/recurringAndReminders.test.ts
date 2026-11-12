import { describe, expect, it } from 'vitest'
import { categoriesApi, recurringApi, remindersApi, transactionsApi } from '../../api/endpoints'
import { LocalDatabase, memoryStorage } from '../db/database'
import { plusDays, plusMonths, today } from '../dates'
import { runDueJobs } from '../jobs'
import { planNotifications } from '../notifications'
import { advanceDueReminder, generateReminderForMonth } from '../services/reminders'
import { apiError, withFreshLocalBackend } from '../testing'

// Parità della fase 2: RecurringTransactionApiTest, ExpenseReminderApiTest,
// ExpenseReminderGenerationTest, ExpenseReminderAdvancementTest,
// ExpenseReminderNotificationTest, più i job all'avvio che sul server non esistono
// (lì girano di notte).

withFreshLocalBackend()

const OGGI = today()
const expenseCategory = (name = 'Spesa') => categoriesApi.create({ name, type: 'EXPENSE' })

const rule = (categoryId: string, nextDueDate: string, extra: Record<string, unknown> = {}) =>
  recurringApi.create({
    categoryId,
    name: 'Netflix',
    defaultAmount: 9.99,
    intervalUnit: 'MONTH',
    intervalValue: 1,
    startDate: nextDueDate,
    nextDueDate,
    endDate: null,
    ...extra,
  } as Parameters<typeof recurringApi.create>[0])

const putRule = (id: string, categoryId: string, name: string, amount: number, start: string, next: string) =>
  recurringApi.update(id, {
    categoryId,
    name,
    defaultAmount: amount,
    intervalUnit: 'MONTH',
    intervalValue: 1,
    startDate: start,
    nextDueDate: next,
    endDate: null,
  } as Parameters<typeof recurringApi.update>[1])

describe('regole ricorrenti', () => {
  it('una regola con scadenza futura non genera ancora niente', async () => {
    await rule((await expenseCategory()).id, plusMonths(OGGI, 1))
    expect((await transactionsApi.list()).content).toEqual([])
  })

  it('con la scadenza nel passato recupera subito gli arretrati, alla data vera', async () => {
    const start = plusMonths(OGGI, -3)
    await rule((await expenseCategory()).id, start)

    const date = (await transactionsApi.list()).content.map((t) => t.occurredOn).sort()
    expect(date).toEqual([start, plusMonths(start, 1), plusMonths(start, 2), plusMonths(start, 3)])
    expect((await transactionsApi.list()).content.every((t) => t.recurringTransactionId !== null)).toBe(true)
  })

  it('il recupero si ferma alla data di fine', async () => {
    const start = plusMonths(OGGI, -3)
    await rule((await expenseCategory()).id, start, { endDate: plusMonths(start, 1) })
    // La data di fine è passata: per il server (che confronta con oggi) la regola si
    // disattiva senza generare.
    expect((await recurringApi.list())[0].active).toBe(false)
  })

  it('elenca, disattiva, riattiva e cancella; le transazioni generate restano', async () => {
    const cat = await expenseCategory()
    const r = await rule(cat.id, plusDays(OGGI, -1))

    await recurringApi.deactivate(r.id)
    expect((await recurringApi.list())[0].active).toBe(false)
    await recurringApi.reactivate(r.id)
    expect((await recurringApi.list())[0]).toMatchObject({
      active: true,
      categoryName: 'Spesa',
      categoryType: 'EXPENSE',
      defaultAmount: 9.99,
    })

    await recurringApi.delete(r.id)
    expect(await recurringApi.list()).toEqual([])
    expect((await transactionsApi.list()).content).toEqual([expect.objectContaining({ recurringTransactionId: null })])
    expect((await apiError(recurringApi.delete(r.id))).status).toBe(404)
  })

  it('le eccezioni si creano, si elencano e si cancellano; una seconda sulla stessa data no', async () => {
    const r = await rule((await expenseCategory()).id, plusMonths(OGGI, 6))
    const data = plusMonths(OGGI, 7)

    const o = await recurringApi.createOverride(r.id, { occurrenceDate: data, overrideAmount: 123.45, note: 'x' })
    expect(await recurringApi.listOverrides(r.id)).toEqual([
      { id: o.id, occurrenceDate: data, overrideAmount: 123.45, note: 'x' },
    ])
    expect(await apiError(recurringApi.createOverride(r.id, { occurrenceDate: data, overrideAmount: 1 }))).toEqual({
      status: 409,
      message: "Esiste già un'eccezione per questa data",
    })
    await recurringApi.deleteOverride(r.id, o.id)
    expect(await recurringApi.listOverrides(r.id)).toEqual([])
    expect((await apiError(recurringApi.deleteOverride(r.id, o.id))).status).toBe(404)
  })

  it("l'importo dell'eccezione vale quando la modifica fa recuperare quella scadenza", async () => {
    const cat = await expenseCategory()
    const due = plusMonths(OGGI, -1)
    const r = await rule(cat.id, plusMonths(OGGI, 6))
    await recurringApi.createOverride(r.id, { occurrenceDate: due, overrideAmount: 123.45 })

    await putRule(r.id, cat.id, 'Netflix', 9.99, due, due)

    const amounts = (await transactionsApi.list()).content.map((t) => [t.occurredOn, t.amount])
    expect(amounts).toContainEqual([due, 123.45])
  })

  it('la modifica cambia nome, importo e categoria', async () => {
    const cat = await expenseCategory()
    const altra = await expenseCategory('Abbonamenti')
    const futuro = plusMonths(OGGI, 1)
    const r = await rule(cat.id, futuro)

    expect(await putRule(r.id, altra.id, 'Spotify', 12.99, futuro, futuro)).toMatchObject({
      name: 'Spotify',
      defaultAmount: 12.99,
      categoryId: altra.id,
    })
  })

  it('la modifica recupera subito gli arretrati, e risalvare la scadenza corrente non rigenera', async () => {
    const cat = await expenseCategory()
    const r = await rule(cat.id, plusMonths(OGGI, 1))
    const passato = plusDays(OGGI, -3)

    const dopo = await putRule(r.id, cat.id, 'Netflix', 9.99, passato, passato)
    expect((await transactionsApi.list()).content).toHaveLength(1)
    expect(dopo.nextDueDate > OGGI).toBe(true)

    await putRule(r.id, cat.id, 'Netflix', 12.99, passato, dopo.nextDueDate)
    expect((await transactionsApi.list()).content).toHaveLength(1)
  })

  // Comportamento del server, riprodotto com'è (RecurringTransactionApiTest lo fissa):
  // la generazione non ha una guardia per occorrenza.
  it('rimandare due volte la stessa scadenza passata duplica l occorrenza, come sul server', async () => {
    const cat = await expenseCategory()
    const r = await rule(cat.id, plusMonths(OGGI, 1))
    const passato = plusDays(OGGI, -3)

    await putRule(r.id, cat.id, 'Netflix', 9.99, passato, passato)
    await putRule(r.id, cat.id, 'Netflix', 9.99, passato, passato)

    expect((await transactionsApi.list()).content).toHaveLength(2)
  })

  it('rifiuta importo zero, nome vuoto, intervallo non positivo e regole inesistenti', async () => {
    const cat = await expenseCategory()
    expect((await apiError(rule(cat.id, OGGI, { defaultAmount: 0 }))).status).toBe(400)
    expect((await apiError(rule(cat.id, OGGI, { name: ' ' }))).status).toBe(400)
    expect((await apiError(rule(cat.id, OGGI, { intervalValue: 0 }))).status).toBe(400)
    expect((await apiError(recurringApi.deactivate('nessuna'))).status).toBe(404)
  })
})

const reminder = (categoryId: string, nextDueDate: string, extra: Record<string, unknown> = {}) =>
  remindersApi.create({
    categoryId,
    name: 'Bollo auto',
    amount: null,
    intervalUnit: 'MONTH',
    intervalValue: 1,
    startDate: nextDueDate,
    nextDueDate,
    endDate: null,
    notifyDaysBefore: null,
    ...extra,
  } as Parameters<typeof remindersApi.create>[0])

describe('promemoria', () => {
  it('si creano, si elencano, si modificano, si disattivano', async () => {
    const cat = await expenseCategory('Auto')
    const altra = await expenseCategory('Casa')
    const r = await reminder(cat.id, plusDays(OGGI, 3), { amount: 120 })
    expect(await remindersApi.list()).toEqual([expect.objectContaining({ name: 'Bollo auto', amount: 120, categoryName: 'Auto' })])

    await remindersApi.update(r.id, {
      categoryId: altra.id,
      name: 'Condominio',
      amount: 80,
      intervalUnit: 'MONTH',
      intervalValue: 1,
      startDate: r.startDate,
      nextDueDate: r.nextDueDate,
      endDate: null,
      notifyDaysBefore: 2,
    } as Parameters<typeof remindersApi.update>[1])
    expect((await remindersApi.list())[0]).toMatchObject({ name: 'Condominio', amount: 80, categoryId: altra.id, notifyDaysBefore: 2 })

    await remindersApi.deactivate(r.id)
    expect((await remindersApi.list())[0].active).toBe(false)
    await remindersApi.reactivate(r.id)
    expect((await remindersApi.list())[0].active).toBe(true)
    expect((await apiError(remindersApi.deactivate('nessuno'))).status).toBe(404)
  })

  it('senza categoria o con una categoria di entrata viene rifiutato', async () => {
    const entrata = await categoriesApi.create({ name: 'Bonus', type: 'INCOME' })
    expect(await apiError(reminder(entrata.id, OGGI))).toEqual({
      status: 400,
      message: 'La categoria di un promemoria deve essere di tipo uscita',
    })
    expect((await apiError(reminder(null as unknown as string, OGGI))).status).toBe(400)
  })

  it('le prossime scadenze coprono i mesi chiesti', async () => {
    await reminder((await expenseCategory()).id, plusDays(OGGI, 3))
    expect((await remindersApi.upcoming(4)).months).toHaveLength(4)
  })

  const primaOccorrenza = async () => (await remindersApi.upcoming(3)).months.flatMap((m) => m.occurrences)[0]

  it('un prezzo impostato si mostra e non è una stima', async () => {
    await reminder((await expenseCategory()).id, plusDays(OGGI, 3), { amount: 120 })
    expect(await primaOccorrenza()).toMatchObject({ amount: 120, estimated: false })
  })

  it("senza prezzo si stima sull'ultima spesa della categoria, e lo si dice", async () => {
    const cat = await expenseCategory()
    await transactionsApi.create({ categoryId: cat.id, amount: 80, type: 'EXPENSE', occurredOn: plusMonths(OGGI, -2) })
    await transactionsApi.create({ categoryId: cat.id, amount: 95, type: 'EXPENSE', occurredOn: plusDays(OGGI, -5) })
    await reminder(cat.id, plusDays(OGGI, 3))
    expect(await primaOccorrenza()).toMatchObject({ amount: 95, estimated: true })
  })

  it('senza prezzo e senza storico non si inventa un importo', async () => {
    await reminder((await expenseCategory()).id, plusDays(OGGI, 3))
    expect(await primaOccorrenza()).toMatchObject({ amount: null, estimated: false })
  })
})

describe('job dei promemoria (generazione, avanzamento)', () => {
  const MARZO = '2026-03'
  const SCADENZA = '2026-03-15'

  async function scenario(amount: number | null) {
    const db = await LocalDatabase.open(memoryStorage)
    db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('auto', 'Auto', 'EXPENSE', 'x')")
    db.run(
      `INSERT INTO expense_reminders (id, category_id, name, amount, interval_unit, interval_value, start_date,
         next_due_date, active, created_at)
       VALUES ('p', 'auto', 'Assicurazione', :amount, 'MONTH', 1, :d, :d, 1, 'x')`,
      { amount, d: SCADENZA },
    )
    const spesa = (date: string, cents: number) =>
      db.run(
        `INSERT INTO transactions (id, category_id, amount, type, occurred_on, created_at)
         VALUES (:id, 'auto', :cents, 'EXPENSE', :date, :date)`,
        { id: date + cents, date, cents },
      )
    const transazioni = () =>
      db.all<{ occurred_on: string; amount: number }>(
        'SELECT occurred_on, amount FROM transactions WHERE expense_reminder_id IS NOT NULL ORDER BY occurred_on',
      )
    const scadenza = () => db.get<{ next_due_date: string; active: number }>("SELECT * FROM expense_reminders WHERE id = 'p'")!
    return { db, spesa, transazioni, scadenza }
  }

  it('senza importo e senza storico non genera niente', async () => {
    const s = await scenario(null)
    expect(generateReminderForMonth(s.db, 'p', MARZO)).toBe(false)
    expect(s.transazioni()).toEqual([])
  })

  it("senza importo stima sull'ultima spesa della categoria, al primo del mese", async () => {
    const s = await scenario(null)
    s.spesa('2025-03-20', 31000)
    s.spesa('2026-01-20', 48000)
    generateReminderForMonth(s.db, 'p', MARZO)
    expect(s.transazioni()).toEqual([{ occurred_on: '2026-03-01', amount: 48000 }])
  })

  it('un importo esplicito batte lo storico; una seconda esecuzione non duplica; il mese dopo sì', async () => {
    const s = await scenario(9900)
    s.spesa('2026-01-20', 48000)
    generateReminderForMonth(s.db, 'p', MARZO)
    generateReminderForMonth(s.db, 'p', MARZO)
    generateReminderForMonth(s.db, 'p', '2026-04')
    expect(s.transazioni()).toEqual([
      { occurred_on: '2026-03-01', amount: 9900 },
      { occurred_on: '2026-04-01', amount: 9900 },
    ])
    expect(generateReminderForMonth(s.db, 'nessuno', MARZO)).toBe(false)
  })

  it("l'avanzamento recupera tutte le scadenze arretrate, il giorno stesso compreso", async () => {
    const s = await scenario(9900)
    advanceDueReminder(s.db, 'p', '2026-06-15')
    expect(s.scadenza().next_due_date).toBe('2026-07-15')
  })

  it('una scadenza futura resta dov era', async () => {
    const s = await scenario(9900)
    expect(advanceDueReminder(s.db, 'p', '2026-03-14')).toBe(false)
    expect(s.scadenza().next_due_date).toBe(SCADENZA)
  })

  it('superata la data di fine si disattiva; il giorno della data di fine è ancora attivo', async () => {
    const s = await scenario(9900)
    s.db.run("UPDATE expense_reminders SET end_date = '2026-03-15'")
    advanceDueReminder(s.db, 'p', '2026-03-15')
    expect(s.scadenza().active).toBe(1)
    advanceDueReminder(s.db, 'p', '2026-03-16')
    expect(s.scadenza().active).toBe(0)
  })

  /**
   * I job all'apertura dell'app, dopo un mese e mezzo chiusa: la spesa fissa di ogni
   * mese il cui primo giorno è passato nel frattempo, poi l'avanzamento. Senza l'ordine
   * giusto l'avanzamento salterebbe i mesi da registrare.
   */
  it("all'apertura recupera le spese fisse dei mesi passati ad app chiusa, poi avanza", async () => {
    const s = await scenario(9900)
    runDueJobs(s.db, '2026-02-20') // l'ultima apertura

    runDueJobs(s.db, '2026-04-10')

    expect(s.transazioni()).toEqual([
      { occurred_on: '2026-03-01', amount: 9900 },
      { occurred_on: '2026-04-01', amount: 9900 },
    ])
    expect(s.scadenza().next_due_date).toBe('2026-04-15')
  })

  // Differenza voluta dal server: lì un promemoria che scade proprio il 1° viene avanzato
  // prima della generazione, e la sua spesa del mese si perde.
  it('un promemoria che scade il primo del mese registra comunque la sua spesa', async () => {
    const s = await scenario(9900)
    s.db.run("UPDATE expense_reminders SET start_date = '2026-03-01', next_due_date = '2026-03-01'")
    runDueJobs(s.db, '2026-02-28')

    runDueJobs(s.db, '2026-03-01')

    expect(s.transazioni()).toEqual([{ occurred_on: '2026-03-01', amount: 9900 }])
    expect(s.scadenza().next_due_date).toBe('2026-04-01')
  })

  // La prima apertura in assoluto non recupera niente: non c'è un "prima".
  it('alla prima apertura non registra spese fisse dei mesi passati', async () => {
    const s = await scenario(9900)
    runDueJobs(s.db, '2026-04-10')
    expect(s.transazioni()).toEqual([])
  })
})

describe('il piano delle notifiche (preavviso dei promemoria)', () => {
  async function conPromemoria(due: string, notifyDaysBefore: number | null, lastNotified: string | null = null) {
    const db = await LocalDatabase.open(memoryStorage)
    db.run(
      `INSERT INTO expense_reminders (id, name, interval_unit, interval_value, start_date, next_due_date, active,
         notify_days_before, last_notified_due_date, created_at)
       VALUES ('p', 'Bollo', 'YEAR', 1, :due, :due, 1, :n, :last, 'x')`,
      { due, n: notifyDaysBefore, last: lastNotified },
    )
    return db
  }
  const alle = (date: string, h: number) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`)

  it('prima della finestra programma il preavviso per le 8 del giorno giusto', async () => {
    const db = await conPromemoria('2026-03-15', 3)
    expect(planNotifications(db, alle('2026-03-01', 10))).toEqual([
      expect.objectContaining({
        at: alle('2026-03-12', 8),
        title: 'Promemoria: Bollo tra 3 giorni',
        body: 'Il promemoria "Bollo" scade il 15/03/2026 (tra 3 giorni).',
      }),
    ])
  })

  it('dentro la finestra e mai notificato: subito, con i giorni che mancano davvero', async () => {
    const db = await conPromemoria('2026-03-15', 3)
    expect(planNotifications(db, alle('2026-03-14', 10))).toEqual([
      expect.objectContaining({ at: null, title: 'Promemoria: Bollo tra 1 giorno' }),
    ])
    expect(planNotifications(db, alle('2026-03-15', 10))[0].title).toBe('Promemoria: Bollo oggi')
  })

  it('già notificato, scadenza passata o senza preavviso: niente', async () => {
    expect(planNotifications(await conPromemoria('2026-03-15', 3, '2026-03-15'), alle('2026-03-14', 10))).toEqual([])
    expect(planNotifications(await conPromemoria('2026-03-15', 3), alle('2026-03-16', 10))).toEqual([])
    expect(planNotifications(await conPromemoria('2026-03-15', null), alle('2026-03-14', 10))).toEqual([])
  })

  /**
   * Programmata in anticipo e scattata ad app chiusa: alla riapertura non va ridata.
   * Senza questa memoria il preavviso arriverebbe due volte.
   */
  it('una notifica già scattata ad app chiusa non si ripete', async () => {
    const db = await conPromemoria('2026-03-15', 3)
    const scheduled = { p: { due: '2026-03-15', at: alle('2026-03-12', 8).toISOString() } }
    expect(planNotifications(db, alle('2026-03-13', 10), scheduled)).toEqual([])
  })
})
