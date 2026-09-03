// L'aritmetica del selettore di intervallo date, estratta da DateRangePicker
// perché sta in piedi da sola: nessun riferimento a React, nessun DOM.
//
// Sono tre funzioni pure che decidono cosa si vede scritto sul pulsante e quali
// giorni risultano dentro l'intervallo. Attraverso il DOM sarebbero lente da
// provare e fragili da leggere — bisognerebbe aprire il pannello e contare le
// celle — mentre qui i casi limite (il cambio d'anno, l'offset del lunedì, un
// intervallo di un giorno solo) si scrivono in una riga ciascuno.

const shortFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const shortFmtWithYear = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

// L'anno si scrive una volta sola quando le due date lo condividono: "2 mar –
// 31 mar 2026" invece di ripeterlo due volte.
export function formatRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Tutte le date'
  if (from && to) {
    const df = parseIso(from)
    const dt = parseIso(to)
    const sameYear = df.getFullYear() === dt.getFullYear()
    return `${shortFmt.format(df)} – ${sameYear ? shortFmt.format(dt) : shortFmtWithYear.format(dt)}${
      sameYear ? ' ' + dt.getFullYear() : ''
    }`
  }
  if (from) return `Dal ${shortFmtWithYear.format(parseIso(from))}`
  return `Fino al ${shortFmtWithYear.format(parseIso(to))}`
}

export type CellState = 'none' | 'start' | 'end' | 'in' | 'empty'

export interface MonthCell {
  key: string
  label: string
  iso: string | null
  state: CellState
}

// Sempre 42 celle (sei settimane): una griglia di altezza fissa non fa saltare
// il pannello quando si cambia mese.
export function buildMonthCells(monthDate: Date, draftFrom: string, draftTo: string): MonthCell[] {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = endOfMonth(monthDate).getDate()
  // getDay() è 0=domenica..6=sabato; la settimana qui parte da lunedì.
  const offset = (first.getDay() + 6) % 7
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const day = i - offset + 1
    if (day < 1 || day > daysInMonth) {
      cells.push({ key: `${year}-${month}-e${i}`, label: '', iso: null, state: 'empty' })
      continue
    }
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`
    let state: CellState = 'none'
    if (draftFrom && draftTo && iso > draftFrom && iso < draftTo) state = 'in'
    if (draftFrom && iso === draftFrom) state = 'start'
    // Con un intervallo di un giorno solo la stessa cella è inizio e fine:
    // vince l'inizio, altrimenti la selezione sembrerebbe partire da nulla.
    if (draftTo && iso === draftTo) state = state === 'start' ? 'start' : 'end'
    cells.push({ key: iso, label: String(day), iso, state })
  }
  return cells
}

// Le quattro scorciatoie, più "Personalizzato" che non calcola niente: si
// accende da solo quando l'intervallo scelto a mano non coincide con nessuna.
export function computePresets(today: Date) {
  const thisMonthStart = isoOf(startOfMonth(today))
  const thisMonthEnd = isoOf(endOfMonth(today))
  const lastMonth = addMonths(today, -1)
  const lastMonthStart = isoOf(startOfMonth(lastMonth))
  const lastMonthEnd = isoOf(endOfMonth(lastMonth))
  const last30Start = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))
  const last30End = isoOf(today)
  const yearStart = `${today.getFullYear()}-01-01`
  const yearEnd = `${today.getFullYear()}-12-31`
  return [
    { label: 'Questo mese', from: thisMonthStart, to: thisMonthEnd },
    { label: 'Mese scorso', from: lastMonthStart, to: lastMonthEnd },
    { label: 'Ultimi 30 giorni', from: last30Start, to: last30End },
    { label: "Quest'anno", from: yearStart, to: yearEnd },
  ]
}
