import { dayOfMonth, endOfMonth, onDay, plusDays, plusMonths, plusYears, type IsoDate } from '../dates'

// Porting di RecurrenceSchedule: la scadenza successiva di una regola o di un
// promemoria. Il mese si calcola dalla scadenza precedente, il giorno da quello che la
// regola voleva avere: un 31 accorciato a 28 febbraio torna al 31 a marzo.

export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export function nextOccurrence(date: IsoDate, startDate: IsoDate | null, unit: IntervalUnit, value: number): IsoDate {
  switch (unit) {
    case 'DAY':
      return plusDays(date, value)
    case 'WEEK':
      return plusDays(date, value * 7)
    case 'MONTH':
      return onDay(plusMonths(onDay(date, 1), value), intendedDay(date, startDate))
    case 'YEAR':
      return onDay(plusYears(onDay(date, 1), value), intendedDay(date, startDate))
  }
}

/**
 * Il giorno che la scadenza voleva avere: il suo, a meno che non cada sull'ultimo
 * giorno del mese e la regola sia nata su un giorno più avanti (accorciata da un mese
 * corto). Una scadenza spostata a mano su un altro giorno resta lì.
 */
function intendedDay(date: IsoDate, startDate: IsoDate | null): number {
  const lastDayOfMonth = date === endOfMonth(date)
  if (startDate !== null && lastDayOfMonth && dayOfMonth(startDate) > dayOfMonth(date)) {
    return dayOfMonth(startDate)
  }
  return dayOfMonth(date)
}

/** Attiva e non oltre la data di fine (isCurrentlyActive). */
export function isCurrentlyActive(rule: { active: number; end_date: IsoDate | null }, today: IsoDate): boolean {
  return rule.active === 1 && (rule.end_date === null || rule.end_date >= today)
}
