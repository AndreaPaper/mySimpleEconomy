import { describe, expect, it } from 'vitest'
import {
  categoriesApi,
  checkpointsApi,
  debtsApi,
  forecastApi,
  profileApi,
  recurringApi,
  remindersApi,
  transactionsApi,
} from '../../api/endpoints'
import { atEndOfMonth, endOfMonth, firstOfMonth, lengthOfMonth, onDay, plusDays, plusMonths, plusMonthsYm, today, yearMonthOf } from '../dates'
import { generateReminderForMonth } from '../services/reminders'
import { apiError, withFreshLocalBackend } from '../testing'

// Parità della fase 3: ForecastApiTest, ForecastEstimatesApiTest,
// ForecastPeriodsApiTest e DebtApiTest, con le stesse date relative a oggi e gli
// stessi numeri attesi. Mancano i casi di isolamento fra utenti.

const backend = withFreshLocalBackend()

const OGGI = today()
const PRIMO_DEL_MESE = firstOfMonth(OGGI)
const FINE_MESE = endOfMonth(OGGI)
const meseFa = (mesi: number) => onDay(plusMonths(OGGI, -mesi), 15)
const fraMesi = (mesi: number) => onDay(plusMonths(OGGI, mesi), 15)

const expense = (name = 'Spesa') => categoriesApi.create({ name, type: 'EXPENSE' }).then((c) => c.id)
const income = (name = 'Entrata') => categoriesApi.create({ name, type: 'INCOME' }).then((c) => c.id)
const tx = (categoryId: string, occurredOn: string, amount: number, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') =>
  transactionsApi.create({ categoryId, occurredOn, amount, type })
const checkpoint = (date: string, balance: number) => checkpointsApi.upsert({ checkpointDate: date, balance })
const recurring = (categoryId: string, name: string, amount: number, nextDue: string) =>
  recurringApi.create({
    categoryId,
    name,
    defaultAmount: amount,
    intervalUnit: 'MONTH',
    intervalValue: 1,
    startDate: nextDue,
    nextDueDate: nextDue,
    endDate: null,
  } as Parameters<typeof recurringApi.create>[0])
const reminder = (categoryId: string, name: string, due: string, amount: number | null) =>
  remindersApi.create({
    categoryId,
    name,
    amount,
    intervalUnit: 'MONTH',
    intervalValue: 1,
    startDate: due,
    nextDueDate: due,
    endDate: null,
    notifyDaysBefore: null,
  } as Parameters<typeof remindersApi.create>[0])
const debt = (categoryId: string, total: number, monthly: number | null, extra: Record<string, unknown> = {}) =>
  debtsApi.create({ categoryId, name: 'Prestito', totalAmount: total, monthlyPaymentAmount: monthly, ...extra })
const currentBalance = async () => (await forecastApi.get(1)).currentBalance

describe('saldo attuale e saldo di riferimento', () => {
  it('senza saldo di riferimento parte da zero', async () => {
    const f = await forecastApi.get(3)
    expect(f).toMatchObject({ startingBalance: 0, currentBalance: 0, startingBalanceDate: null })
    expect(f.periods).toHaveLength(3)
  })

  it('senza saldo di riferimento contano tutte le transazioni', async () => {
    await tx(await income(), plusDays(OGGI, -10), 500, 'INCOME')
    await tx(await expense(), plusDays(OGGI, -2), 120)
    expect(await currentBalance()).toBe(380)
  })

  it('una spesa registrata dopo il saldo dello stesso giorno lo muove', async () => {
    const cat = await expense()
    await checkpoint(OGGI, 2700)
    await tx(cat, OGGI, 100)
    expect(await currentBalance()).toBe(2600)
  })

  it('una spesa registrata prima del saldo dello stesso giorno non si toglie due volte', async () => {
    const cat = await expense()
    await tx(cat, OGGI, 400)
    await checkpoint(OGGI, 2089)
    expect(await currentBalance()).toBe(2089)
    await tx(cat, OGGI, 50)
    expect(await currentBalance()).toBe(2039)
  })

  it('le transazioni prima del saldo sono già dentro il numero', async () => {
    const cat = await expense()
    const data = plusDays(OGGI, -10)
    await tx(cat, plusDays(data, -1), 999)
    await checkpoint(data, 1000)
    await tx(cat, plusDays(data, 3), 50)
    expect(await currentBalance()).toBe(950)
  })

  it('vale l ultimo saldo non successivo a oggi', async () => {
    const cat = await expense()
    await checkpoint(plusMonths(OGGI, -2), 5000)
    await checkpoint(plusDays(OGGI, -5), 800)
    await checkpoint(plusMonths(OGGI, 1), 9999)
    await tx(cat, plusDays(OGGI, -1), 30)
    expect(await currentBalance()).toBe(770)
  })

  it('entrate e uscite muovono il saldo in versi opposti', async () => {
    await checkpoint(plusDays(OGGI, -2), 1000)
    await tx(await income(), OGGI, 300, 'INCOME')
    expect(await currentBalance()).toBe(1300)
    await tx(await expense(), OGGI, 100)
    expect(await currentBalance()).toBe(1200)
  })
})

describe('previsione del periodo in corso e dei successivi', () => {
  it('una spesa futura non tocca il saldo attuale, ma entra nella previsione di fine mese', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await tx(cat, FINE_MESE, 250)

    const f = await forecastApi.get(1)
    expect(f.currentBalance).toBe(FINE_MESE === OGGI ? 750 : 1000)
    expect(f.periods[0]).toMatchObject({ projectedExpense: 250, runningBalance: 750 })
  })

  it('un promemoria attivo entra nel mese in cui cade, e una volta registrato non conta due volte', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    const r = await reminder(cat, 'Affitto', FINE_MESE, 400)
    expect((await forecastApi.get(1)).periods[0]).toMatchObject({ projectedExpense: 400, runningBalance: 600 })

    generateReminderForMonth(backend().db, r.id, yearMonthOf(OGGI))

    expect((await forecastApi.get(1)).periods[0]).toMatchObject({ projectedExpense: 400, runningBalance: 600 })
  })

  it('un promemoria senza prezzo e senza storico non si indovina', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await reminder(cat, 'Importo ignoto', FINE_MESE, null)
    expect((await forecastApi.get(1)).periods[0]).toMatchObject({ projectedExpense: 0, runningBalance: 1000 })
  })

  it('una regola attiva si proietta nei mesi futuri', async () => {
    const cat = await income()
    await checkpoint(plusDays(OGGI, -1), 1000)
    await recurring(cat, 'Stipendio', 2000, plusMonths(OGGI, 1))
    expect((await forecastApi.get(3)).periods[1]).toMatchObject({ projectedIncome: 2000, runningBalance: 3000 })
  })

  it('il periodo in corso riflette le transazioni già registrate', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await tx(cat, OGGI, 150)
    expect((await forecastApi.get(2)).periods[0]).toMatchObject({ projectedExpense: 150, runningBalance: 850 })
  })

  it('una spesa futura scritta a mano si somma all occorrenza proiettata', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    const due = fraMesi(1)
    await recurring(cat, 'Netflix', 9.99, due)
    await tx(cat, due, 9.99)
    expect((await forecastApi.get(2)).periods[1].projectedExpense).toBe(19.98)
  })

  it('un occorrenza generata dal job non viene anche proiettata', async () => {
    const cat = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await recurring(cat, 'Abbonamento', 20, plusDays(OGGI, -1))
    // Il giorno 1 l'occorrenza di ieri cade nel mese scorso, prima del saldo.
    const atteso = plusDays(OGGI, -1) >= PRIMO_DEL_MESE ? 20 : 0
    expect((await forecastApi.get(1)).periods[0].projectedExpense).toBe(atteso)
  })

  it('un acquisto una tantum nella categoria di una regola non la sostituisce', async () => {
    const farmaci = await expense('Farmaci')
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await recurring(farmaci, 'Farmaci mensili', 30, onDay(plusMonths(OGGI, 1), 10))
    await tx(farmaci, onDay(plusMonths(OGGI, 1), 20), 15)
    expect((await forecastApi.get(2)).periods[1].projectedExpense).toBe(45)
  })

  it('la media delle spese variabili entra solo nei mesi futuri', async () => {
    const svago = await expense()
    await checkpoint(PRIMO_DEL_MESE, 1000)
    await tx(svago, onDay(plusMonths(OGGI, -1), 15), 60)
    const mesi = (await forecastApi.get(2)).periods
    expect(mesi[0].projectedExpense).toBe(0)
    expect(mesi[1].projectedExpense).toBe(60)
  })
})

describe('le stime: media sullo storico vero e rate dei debiti', () => {
  it('la media divide per i periodi di storico che esistono', async () => {
    const cat = await expense()
    await tx(cat, meseFa(3), 300)
    await tx(cat, meseFa(1), 300)
    const f = await forecastApi.get(2)
    expect(f).toMatchObject({ historyPeriods: 3, variableExpenseAverage: 200 })
    expect(f.periods[1].projectedExpense).toBe(200)
  })

  it('con più di sei periodi di storico il divisore resta sei', async () => {
    const cat = await expense()
    for (let mesi = 1; mesi <= 8; mesi++) await tx(cat, meseFa(mesi), 70)
    expect(await forecastApi.get(2)).toMatchObject({ historyPeriods: 6, variableExpenseAverage: 70 })
  })

  it('senza periodi conclusi lo storico è zero', async () => {
    await tx(await expense(), OGGI, 80)
    const f = await forecastApi.get(2)
    expect(f).toMatchObject({ historyPeriods: 0, variableExpenseAverage: 0 })
    expect(f.periods[1].projectedExpense).toBe(0)
  })

  it('le rate di un debito entrano fino a esaurire il residuo', async () => {
    await debt(await expense(), 250, 100)
    expect((await forecastApi.get(5)).periods.map((p) => p.projectedExpense)).toEqual([0, 100, 100, 50, 0])
  })

  it('una rata già registrata con data futura non conta due volte', async () => {
    const prestito = await expense()
    await debt(prestito, 300, 100)
    await tx(prestito, fraMesi(1), 100)
    expect((await forecastApi.get(5)).periods.slice(1).map((p) => p.projectedExpense)).toEqual([100, 100, 100, 0])
  })

  it('i pagamenti passati di un debito non entrano nella media', async () => {
    const prestito = await expense('Prestito')
    const spesa = await expense('Spesa')
    await debt(prestito, 1000, 100)
    await tx(prestito, meseFa(1), 100)
    await tx(spesa, meseFa(1), 50)
    const f = await forecastApi.get(2)
    expect(f.variableExpenseAverage).toBe(50)
    expect(f.periods[1].projectedExpense).toBe(150)
  })

  it('gli stipendi importati non si sommano alla regola dello stipendio; senza regola restano nella media', async () => {
    const stipendio = await income('Stipendio')
    await tx(stipendio, meseFa(2), 1800, 'INCOME')
    await tx(stipendio, meseFa(1), 1800, 'INCOME')
    expect((await forecastApi.get(2)).periods[1].projectedIncome).toBe(1800)

    await recurring(stipendio, 'Stipendio', 1800, fraMesi(1))
    expect((await forecastApi.get(2)).periods[1].projectedIncome).toBe(1800)
  })
})

describe('periodi di stipendio e card di fine mese', () => {
  const salaryDay = (day: number) => profileApi.update({ salaryDay: day })

  it('i periodi vanno da un accredito al giorno prima del successivo', async () => {
    await salaryDay(15)
    const [primo, secondo] = (await forecastApi.get(2)).periods
    expect(primo.periodStart.slice(8)).toBe('15')
    expect(primo.periodEnd.slice(8)).toBe('14')
    expect(primo.periodStart <= OGGI && OGGI <= primo.periodEnd).toBe(true)
    expect(secondo.periodStart).toBe(plusDays(primo.periodEnd, 1))
  })

  it('una spesa nel mese dopo ma dentro il periodo conta nel periodo in corso', async () => {
    await salaryDay(15)
    const cat = await expense()
    const { periodStart: inizio, periodEnd: fine } = (await forecastApi.get(2)).periods[0]
    await checkpoint(plusDays(inizio, -1), 1000)
    await tx(cat, inizio, 100)
    await tx(cat, fine, 50)
    const periodi = (await forecastApi.get(2)).periods
    expect(periodi[0]).toMatchObject({ projectedExpense: 150, runningBalance: 850 })
    expect(periodi[1].projectedExpense).toBe(0)
  })

  it('ciò che sta prima dell accredito è già dentro il saldo di partenza', async () => {
    await salaryDay(15)
    const cat = await expense()
    const inizio = (await forecastApi.get(1)).periods[0].periodStart
    await checkpoint(plusDays(inizio, -3), 1000)
    await tx(cat, plusDays(inizio, -1), 200)
    expect((await forecastApi.get(1)).periods[0]).toMatchObject({ projectedExpense: 0, runningBalance: 800 })
  })

  it.runIf(Number(OGGI.slice(8)) < lengthOfMonth(Number(OGGI.slice(0, 4)), Number(OGGI.slice(5, 7))))(
    'prima dello stipendio la card guarda a fine di questo mese',
    async () => {
      await salaryDay(Number(OGGI.slice(8)) + 1)
      const stipendio = await income()
      await checkpoint(OGGI, 1000)
      await recurring(stipendio, 'Stipendio', 2000, plusDays(OGGI, 1))
      expect((await forecastApi.get(2)).monthEndForecast).toMatchObject({
        period: yearMonthOf(OGGI),
        periodStart: PRIMO_DEL_MESE,
        periodEnd: FINE_MESE,
        projectedIncome: 2000,
        runningBalance: 3000,
      })
    },
  )

  it.runIf(Number(OGGI.slice(8)) >= 2)('passato lo stipendio la card guarda a fine del mese prossimo', async () => {
    await salaryDay(2)
    const stipendio = await income()
    const spesa = await expense()
    const prossimo = plusMonthsYm(yearMonthOf(OGGI), 1)
    await checkpoint(plusDays(PRIMO_DEL_MESE, -1), 1000)
    await tx(spesa, FINE_MESE, 100)
    await recurring(stipendio, 'Stipendio', 2000, `${prossimo}-02`)
    expect((await forecastApi.get(2)).monthEndForecast).toMatchObject({
      period: prossimo,
      periodStart: `${prossimo}-01`,
      periodEnd: atEndOfMonth(prossimo),
      projectedIncome: 2000,
      runningBalance: 2900,
    })
  })

  it('senza accredito la card guarda al mese in corso', async () => {
    expect((await forecastApi.get(2)).monthEndForecast.period).toBe(yearMonthOf(OGGI))
  })
})

describe('debiti', () => {
  it('crea, elenca, modifica e cancella', async () => {
    const cat = await expense()
    const d = await debtsApi.create({ categoryId: cat, name: 'Prestito auto', totalAmount: 5000, monthlyPaymentAmount: 250 })
    expect(await debtsApi.list()).toEqual([expect.objectContaining({ name: 'Prestito auto', remainingAmount: 5000, active: true })])
    expect(
      await debtsApi.update(d.id, { categoryId: cat, name: 'Prestito auto (rinegoziato)', totalAmount: 4000, monthlyPaymentAmount: 200 }),
    ).toMatchObject({ totalAmount: 4000 })
    await debtsApi.delete(d.id)
    expect(await debtsApi.list()).toEqual([])
    expect((await apiError(debtsApi.delete(d.id))).status).toBe(404)
  })

  it('rifiuta nome vuoto, importo nullo, categoria di entrata e già pagato senza data', async () => {
    const cat = await expense()
    expect((await apiError(debtsApi.create({ categoryId: cat, name: '', totalAmount: 5000 }))).status).toBe(400)
    expect((await apiError(debtsApi.create({ categoryId: cat, name: 'X', totalAmount: 0 }))).status).toBe(400)
    expect((await apiError(debtsApi.create({ categoryId: await income(), name: 'X', totalAmount: 100 }))).status).toBe(400)
    expect(await apiError(debtsApi.create({ categoryId: cat, name: 'X', totalAmount: 5000, alreadyPaidAmount: 1000 }))).toEqual({
      status: 400,
      message: 'Indica da quale data in poi le spese vanno conteggiate separatamente dal già pagato',
    })
  })

  it('le spese prima della data non si sommano al già pagato', async () => {
    const cat = await expense()
    const riferimento = plusMonths(OGGI, -2)
    await tx(cat, plusDays(riferimento, -10), 300)
    await tx(cat, plusDays(riferimento, 10), 200)
    await debt(cat, 5000, 250, { alreadyPaidAmount: 1000, alreadyPaidAsOf: riferimento })
    expect((await debtsApi.list())[0]).toMatchObject({ paidAmount: 1200, remainingAmount: 3800 })
  })

  it('un debito saldato si disattiva da solo e libera la categoria', async () => {
    const cat = await expense()
    await debt(cat, 500, 250)
    await tx(cat, OGGI, 500)
    expect((await debtsApi.list())[0]).toMatchObject({ remainingAmount: 0, active: false })
    await expect(debt(cat, 800, 100)).resolves.toMatchObject({ active: true })
  })

  it('non si possono avere due debiti attivi sulla stessa categoria', async () => {
    const cat = await expense()
    await debt(cat, 5000, 100)
    expect((await apiError(debt(cat, 3000, 100))).status).toBe(409)
  })
})
