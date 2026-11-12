import { describe, expect, it } from 'vitest'
import { LocalDatabase, memoryStorage } from '../db/database'
import { daysBetween, plusMonths } from '../dates'
import { divideHalfUp, toCents } from '../money'
import { countsAfterCheckpoint, type CheckpointRow } from '../services/checkpoints'
import { processDueRule, type RecurringRow } from '../services/recurringGeneration'
import { nextOccurrence, type IntervalUnit } from '../services/schedule'
import type { TransactionRow } from '../services/transactions'

// Parità delle regole pure: CheckpointRulesTest, RecurrenceScheduleTest e
// RecurringTransactionGenerationTest, con le stesse date e gli stessi numeri.

describe('cosa conta dopo un saldo di riferimento (CheckpointRules)', () => {
  const GIORNO = '2026-08-26'
  const MEZZOGIORNO = '2026-08-26T12:00:00.000Z'
  const UN_ORA_PRIMA = '2026-08-26T11:00:00.000Z'
  const UN_ORA_DOPO = '2026-08-26T13:00:00.000Z'
  const transazione = (occurredOn: string, createdAt: string) =>
    ({ occurred_on: occurredOn, created_at: createdAt }) as TransactionRow
  const saldo = (countsFrom: string | null) => ({ checkpoint_date: GIORNO, counts_from: countsFrom }) as CheckpointRow

  it('senza saldo conta tutto', () => {
    expect(countsAfterCheckpoint(transazione(GIORNO, MEZZOGIORNO), undefined)).toBe(true)
  })
  it('dopo e prima del giorno del saldo contano sempre', () => {
    expect(countsAfterCheckpoint(transazione('2026-08-27', MEZZOGIORNO), saldo(MEZZOGIORNO))).toBe(true)
    expect(countsAfterCheckpoint(transazione('2026-08-25', MEZZOGIORNO), saldo(MEZZOGIORNO))).toBe(true)
  })
  it('con un saldo letto in quel momento, le spese già registrate non contano di nuovo', () => {
    expect(countsAfterCheckpoint(transazione(GIORNO, UN_ORA_PRIMA), saldo(MEZZOGIORNO))).toBe(false)
  })
  it('ma quelle aggiunte dopo sì, e anche quelle dello stesso istante', () => {
    expect(countsAfterCheckpoint(transazione(GIORNO, UN_ORA_DOPO), saldo(MEZZOGIORNO))).toBe(true)
    expect(countsAfterCheckpoint(transazione(GIORNO, MEZZOGIORNO), saldo(MEZZOGIORNO))).toBe(true)
  })
  it('con un saldo a inizio giornata contano tutte le spese del giorno', () => {
    expect(countsAfterCheckpoint(transazione(GIORNO, UN_ORA_PRIMA), saldo(null))).toBe(true)
  })
})

describe('le scadenze successive (RecurrenceSchedule)', () => {
  const catena = (prima: string, inizio: string | null, unita: IntervalUnit, passi: number) => {
    const date: string[] = []
    let d = prima
    for (let i = 0; i < passi; i++) {
      d = nextOccurrence(d, inizio, unita, 1)
      date.push(d)
    }
    return date
  }

  it('una regola del 31 torna al 31 dopo febbraio', () => {
    expect(catena('2026-01-31', '2026-01-31', 'MONTH', 6)).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31',
    ])
  })
  it('una regola del 30 torna al 30', () => {
    expect(catena('2026-01-30', '2026-01-30', 'MONTH', 2)).toEqual(['2026-02-28', '2026-03-30'])
  })
  it('un annuale del 29 febbraio torna al 29 negli anni bisestili', () => {
    expect(catena('2028-02-29', '2028-02-29', 'YEAR', 4)).toEqual([
      '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29',
    ])
  })
  it('una scadenza spostata a mano resta dov è stata', () => {
    expect(nextOccurrence('2026-03-15', '2026-01-31', 'MONTH', 1)).toBe('2026-04-15')
  })
  it('senza data di inizio il giorno resta', () => {
    expect(nextOccurrence('2026-02-28', null, 'MONTH', 1)).toBe('2026-03-28')
  })
  it('giorni e settimane non cambiano', () => {
    expect(nextOccurrence('2026-01-31', '2026-01-31', 'DAY', 3)).toBe('2026-02-03')
    expect(nextOccurrence('2026-01-31', '2026-01-31', 'WEEK', 2)).toBe('2026-02-14')
  })
})

describe('la generazione delle ricorrenti (RecurringTransactionGenerationService)', () => {
  const GENNAIO = '2026-01-15'

  async function scenario(nextDue: string, importo: number, endDate: string | null = null) {
    const db = await LocalDatabase.open(memoryStorage)
    db.run("INSERT INTO categories (id, name, type, created_at) VALUES ('casa', 'Casa', 'EXPENSE', 'x')")
    db.run(
      `INSERT INTO recurring_transactions (id, category_id, name, default_amount, interval_unit, interval_value,
         start_date, next_due_date, end_date, active, created_at)
       VALUES ('affitto', 'casa', 'Affitto', :amount, 'MONTH', 1, :due, :due, :end, 1, 'x')`,
      { amount: toCents(importo), due: nextDue, end: endDate },
    )
    const date = () =>
      db.all<{ occurred_on: string }>('SELECT occurred_on FROM transactions ORDER BY occurred_on').map((t) => t.occurred_on)
    const regola = () => db.get<RecurringRow>("SELECT * FROM recurring_transactions WHERE id = 'affitto'")!
    return { db, date, regola }
  }

  it('una regola del 31 non scivola dopo febbraio', async () => {
    const s = await scenario('2026-01-31', 500)

    processDueRule(s.db, 'affitto', '2026-05-01')

    expect(s.date()).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(s.regola().next_due_date).toBe('2026-05-31')
  })

  it('recupera tutte le occorrenze arretrate, alla data vera', async () => {
    const s = await scenario(GENNAIO, 500)

    processDueRule(s.db, 'affitto', '2026-04-14')

    expect(s.date()).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
    expect(s.regola().next_due_date).toBe('2026-04-15')
    expect(s.regola().active).toBe(1)
  })

  it('una seconda esecuzione non duplica nulla', async () => {
    const s = await scenario(GENNAIO, 500)
    processDueRule(s.db, 'affitto', '2026-04-14')
    processDueRule(s.db, 'affitto', '2026-04-14')
    expect(s.date()).toHaveLength(3)
  })

  it('una regola non ancora scaduta non genera nulla', async () => {
    const s = await scenario(GENNAIO, 500)
    expect(processDueRule(s.db, 'affitto', '2026-01-14')).toBe(false)
    expect(s.date()).toEqual([])
    expect(s.regola().next_due_date).toBe(GENNAIO)
  })

  it('la data di fine è il suo ultimo giorno utile', async () => {
    const s = await scenario(GENNAIO, 100, GENNAIO)
    processDueRule(s.db, 'affitto', GENNAIO)
    expect(s.date()).toEqual(['2026-01-15'])
    expect(s.regola().active).toBe(1)
  })

  it('superata la data di fine la regola si disattiva da sola', async () => {
    const s = await scenario(GENNAIO, 100, GENNAIO)
    processDueRule(s.db, 'affitto', '2026-01-16')
    expect(s.regola().active).toBe(0)
  })

  // Comportamento del server, riprodotto com'è: la data di fine si confronta con oggi,
  // non con la singola occorrenza.
  it('una regola scaduta durante un fermo non recupera gli arretrati', async () => {
    const s = await scenario(GENNAIO, 100, '2026-02-20')
    processDueRule(s.db, 'affitto', '2026-04-14')
    expect(s.date()).toEqual([])
    expect(s.regola().active).toBe(0)
  })

  it('un eccezione di importo vale sulla sua occorrenza', async () => {
    const s = await scenario(GENNAIO, 80)
    s.db.run(
      "INSERT INTO recurring_overrides (id, recurring_transaction_id, occurrence_date, override_amount) VALUES ('o', 'affitto', :d, 23000)",
      { d: GENNAIO },
    )

    processDueRule(s.db, 'affitto', '2026-02-15')

    expect(s.db.all('SELECT occurred_on, amount, type FROM transactions ORDER BY occurred_on')).toEqual([
      { occurred_on: '2026-01-15', amount: 23000, type: 'EXPENSE' },
      { occurred_on: '2026-02-15', amount: 8000, type: 'EXPENSE' },
    ])
  })

  it('una regola inesistente non fa esplodere il job', async () => {
    const s = await scenario(GENNAIO, 100)
    expect(processDueRule(s.db, 'nessuna', '2026-04-14')).toBe(false)
  })
})

describe('date e importi', () => {
  it('plusMonths scende all ultimo giorno del mese più corto', () => {
    expect(plusMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(plusMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(plusMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(plusMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
  it('i giorni fra due date passano il cambio dell ora legale senza perdere un giorno', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('gli importi in centesimi arrotondano come BigDecimal HALF_UP', () => {
    expect(toCents(10.35)).toBe(1035)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(divideHalfUp(25, 2)).toBe(13)
    expect(divideHalfUp(-25, 2)).toBe(-13)
    expect(divideHalfUp(100, 3)).toBe(33)
  })
})
