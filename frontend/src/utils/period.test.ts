import { describe, expect, it } from 'vitest'
import { periodKeyOf, periodRangeOf } from './period'

// I periodi stipendio-stipendio. Tutta l'app ci ragiona sopra — Dashboard,
// Risparmio, raggruppamento delle transazioni, export Excel — quindi un errore
// qui sposta i numeri di ogni schermata insieme, in modo coerente e perciò
// difficile da notare.
//
// Le due funzioni sono documentate come coerenti per costruzione: quella
// coerenza si verifica come proprietà su tutte le date, non con qualche esempio.

describe('periodKeyOf', () => {
  it('senza giorno di stipendio il periodo è il mese di calendario', () => {
    expect(periodKeyOf('2026-08-15', null)).toBe('2026-08')
    expect(periodKeyOf('2026-08-01', null)).toBe('2026-08')
    expect(periodKeyOf('2026-08-31', null)).toBe('2026-08')
  })

  it('col giorno 1 il periodo resta il mese di calendario', () => {
    expect(periodKeyOf('2026-08-15', 1)).toBe('2026-08')
  })

  // La regola meno ovvia, e quella che si sbaglia più facilmente leggendo il
  // codice: il periodo prende il nome dal mese in cui *finisce*, perché è quello
  // che quei soldi coprono.
  it('il periodo prende il nome dal mese in cui finisce', () => {
    expect(periodKeyOf('2026-06-27', 27)).toBe('2026-07')
    expect(periodKeyOf('2026-07-26', 27)).toBe('2026-07')
  })

  it('il giorno dello stipendio apre il periodo nuovo', () => {
    expect(periodKeyOf('2026-07-26', 27)).toBe('2026-07')
    expect(periodKeyOf('2026-07-27', 27)).toBe('2026-08')
  })

  it('a fine anno il periodo passa all anno dopo', () => {
    expect(periodKeyOf('2026-12-27', 27)).toBe('2027-01')
    expect(periodKeyOf('2026-12-26', 27)).toBe('2026-12')
  })

  // Con lo stipendio il 31, a febbraio non esiste un 31: il giorno viene
  // troncato all'ultimo del mese, altrimenti il periodo non si aprirebbe mai.
  it('un giorno che non esiste nel mese viene troncato all ultimo', () => {
    expect(periodKeyOf('2026-02-28', 31)).toBe('2026-03')
    expect(periodKeyOf('2026-02-27', 31)).toBe('2026-02')
  })

  it('l anno bisestile è gestito', () => {
    expect(periodKeyOf('2028-02-29', 31)).toBe('2028-03')
    expect(periodKeyOf('2028-02-28', 31)).toBe('2028-02')
  })
})

describe('periodRangeOf', () => {
  it('senza giorno di stipendio restituisce il mese intero', () => {
    expect(periodRangeOf('2026-02', null)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodRangeOf('2028-02', null)).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('col giorno di stipendio va dallo stipendio al giorno prima del successivo', () => {
    expect(periodRangeOf('2026-07', 27)).toEqual({ start: '2026-06-27', end: '2026-07-26' })
  })

  it('a gennaio l inizio del periodo sta nell anno prima', () => {
    expect(periodRangeOf('2027-01', 27)).toEqual({ start: '2026-12-27', end: '2027-01-26' })
  })
})

// La proprietà che tiene insieme le due funzioni. Vale la pena scriverla così e
// non con esempi: copre migliaia di combinazioni, comprese quelle che a mano non
// verrebbero in mente (mesi corti, bisestili, cambi d'anno).
describe('le due funzioni restano coerenti fra loro', () => {
  const giorniDiStipendio = [null, 1, 5, 15, 27, 28, 29, 30, 31]

  function giorniDelPeriodo(start: string, end: string): string[] {
    const giorni: string[] = []
    const [ys, ms, ds] = start.split('-').map(Number)
    const [ye, me, de] = end.split('-').map(Number)
    const corrente = new Date(Date.UTC(ys, ms - 1, ds))
    const ultimo = new Date(Date.UTC(ye, me - 1, de))
    while (corrente <= ultimo) {
      giorni.push(corrente.toISOString().slice(0, 10))
      corrente.setUTCDate(corrente.getUTCDate() + 1)
    }
    return giorni
  }

  it.each(giorniDiStipendio)(
    'ogni giorno di un periodo ricade in quel periodo (giorno %s)',
    (salaryDay) => {
      for (let anno = 2026; anno <= 2028; anno += 1) {
        for (let mese = 1; mese <= 12; mese += 1) {
          const chiave = `${anno}-${String(mese).padStart(2, '0')}`
          const { start, end } = periodRangeOf(chiave, salaryDay)

          expect(new Date(start) <= new Date(end)).toBe(true)

          for (const giorno of giorniDelPeriodo(start, end)) {
            expect(periodKeyOf(giorno, salaryDay)).toBe(chiave)
          }
        }
      }
    },
  )

  it.each(giorniDiStipendio)(
    'due periodi consecutivi si toccano senza buchi né sovrapposizioni (giorno %s)',
    (salaryDay) => {
      for (let anno = 2026; anno <= 2028; anno += 1) {
        for (let mese = 1; mese <= 12; mese += 1) {
          const chiave = `${anno}-${String(mese).padStart(2, '0')}`
          const successivo =
            mese === 12
              ? `${anno + 1}-01`
              : `${anno}-${String(mese + 1).padStart(2, '0')}`

          const fine = new Date(periodRangeOf(chiave, salaryDay).end)
          const inizioSuccessivo = new Date(periodRangeOf(successivo, salaryDay).start)
          const giorniDiScarto =
            (inizioSuccessivo.getTime() - fine.getTime()) / 86_400_000

          expect(giorniDiScarto).toBe(1)
        }
      }
    },
  )
})
