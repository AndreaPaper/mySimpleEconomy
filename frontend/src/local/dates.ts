// Le date del backend locale: stringhe 'AAAA-MM-GG', come le LocalDate di Java.
//
// Mai oggetti Date per i giorni: un Date è un istante, e "mezzanotte del 5 marzo" in
// Italia è il 4 marzo in UTC. Questo file fa i conti sui numeri (anno, mese, giorno)
// e passa da Date.UTC solo per sommare i giorni, dove il fuso non entra.

export type IsoDate = string

interface Ymd {
  y: number
  m: number // 1-12
  d: number
}

function parse(date: IsoDate): Ymd {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

function format({ y, m, d }: Ymd): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Il giorno di oggi nel fuso del telefono: LocalDate.now(). */
export function today(now: Date = new Date()): IsoDate {
  return format({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

export function lengthOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function dayOfMonth(date: IsoDate): number {
  return parse(date).d
}

export function plusDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parse(date)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return format({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() })
}

/**
 * Come LocalDate.plusMonths: il giorno resta, e se il mese di arrivo è più corto
 * scende all'ultimo (31 gennaio + 1 mese = 28 febbraio).
 */
export function plusMonths(date: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(date)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return format({ y: ny, m: nm, d: Math.min(d, lengthOfMonth(ny, nm)) })
}

export function plusYears(date: IsoDate, years: number): IsoDate {
  return plusMonths(date, years * 12)
}

/** Il giorno `day` di quel mese, o l'ultimo se il mese è più corto. */
export function onDay(date: IsoDate, day: number): IsoDate {
  const { y, m } = parse(date)
  return format({ y, m, d: Math.min(day, lengthOfMonth(y, m)) })
}

export function firstOfMonth(date: IsoDate): IsoDate {
  return date.slice(0, 8) + '01'
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { y, m } = parse(date)
  return format({ y, m, d: lengthOfMonth(y, m) })
}

/** Giorni da a a b (b - a), come ChronoUnit.DAYS.between. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = parse(a)
  const pb = parse(b)
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000)
}

// --- YearMonth: 'AAAA-MM' -----------------------------------------------------

export type YearMonth = string

export function yearMonthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7)
}

export function plusMonthsYm(ym: YearMonth, months: number): YearMonth {
  return yearMonthOf(plusMonths(`${ym}-01`, months))
}

export function atDay(ym: YearMonth, day: number): IsoDate {
  return onDay(`${ym}-01`, day)
}

export function atEndOfMonth(ym: YearMonth): IsoDate {
  return endOfMonth(`${ym}-01`)
}

export function lengthOfYearMonth(ym: YearMonth): number {
  const { y, m } = parse(`${ym}-01`)
  return lengthOfMonth(y, m)
}

/** Mesi da a a b, come YearMonth.until(b, MONTHS). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const pa = parse(`${a}-01`)
  const pb = parse(`${b}-01`)
  return pb.y * 12 + pb.m - (pa.y * 12 + pa.m)
}

export function isValidIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { y, m, d } = parse(value)
  return m >= 1 && m <= 12 && d >= 1 && d <= lengthOfMonth(y, m)
}
