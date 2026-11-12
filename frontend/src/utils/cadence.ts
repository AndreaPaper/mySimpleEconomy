import type { IntervalUnit } from '../api/types'

// Come si legge una cadenza e una scadenza nelle pagine Ricorrenti e Promemoria. Prima
// si vedeva il valore grezzo dell'API: "ogni 1 month · 2026-11-14".

const UNITS: Record<IntervalUnit, [string, string]> = {
  DAY: ['giorno', 'giorni'],
  WEEK: ['settimana', 'settimane'],
  MONTH: ['mese', 'mesi'],
  YEAR: ['anno', 'anni'],
}

/** "ogni mese", "ogni 2 mesi", "ogni settimana". */
export function formatCadence(value: number, unit: IntervalUnit): string {
  const [one, many] = UNITS[unit] ?? [unit.toLowerCase(), unit.toLowerCase()]
  return value === 1 ? `ogni ${one}` : `ogni ${value} ${many}`
}

/** "14/11/2026", da una data "2026-11-14". */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}
