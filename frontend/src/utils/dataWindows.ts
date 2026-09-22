import { periodKeyOf, periodRangeOf } from './period'
import { lastPeriodKeys } from './savingsPeriods'

// Quali intervalli di dati chiedono Dashboard e Risparmio.
//
// Stanno qui, e non dentro le pagine, perché servono in due posti: alla pagina
// per le sue query, e al menu per precaricarle al passaggio sopra il link. Se
// i due calcoli fossero copie diverse basterebbe una differenza di un giorno
// per far precaricare una chiave di cache che la pagina non legge mai — senza
// nessun errore, solo un prefetch inutile.

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Le durate offerte dai chip del grafico su mobile, al posto dei due campi data.
export const DEFAULT_MOBILE_RANGE_MONTHS = 6

// I mesi di promemoria in arrivo mostrati in Dashboard.
export const UPCOMING_REMINDER_MONTHS = 6

// I periodi di stipendio mostrati in Risparmio.
export const SAVINGS_PERIODS_SHOWN = 12

/** Inizio del grafico sul desktop: il primo gennaio dell'anno in corso. */
export function defaultRangeStart(): string {
  return `${new Date().getFullYear()}-01-01`
}

/** Inizio del grafico a `months` mesi fa (i chip su mobile). */
export function chartRangeStart(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return iso(d)
}

/** Fine predefinita del grafico: fra sei mesi. */
export function defaultRangeEnd(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 6)
  return iso(d)
}

/**
 * L'inizio del grafico con cui la Dashboard parte. Su mobile i chip di durata:
 * partire dal primo gennaio lascerebbe tutti e quattro spenti, come se non
 * fosse selezionato niente, e sei mesi è la durata che il grafico mostra meglio
 * nello spazio che ha. Sul desktop resta l'anno in corso.
 */
export function initialRangeStart(isMobile: boolean): string {
  return isMobile ? chartRangeStart(DEFAULT_MOBILE_RANGE_MONTHS) : defaultRangeStart()
}

/**
 * Quanti mesi di previsione servono per coprire `rangeEnd` partendo dal mese
 * corrente: il motore di previsione parte sempre da oggi, mai da rangeStart.
 */
export function forecastWindow(rangeEnd: string, today: Date): { monthsDiff: number; months: number } {
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const rangeEndDate = new Date(rangeEnd)
  const endMonthStart = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), 1)
  const monthsDiff =
    (endMonthStart.getFullYear() - currentMonthStart.getFullYear()) * 12 +
    (endMonthStart.getMonth() - currentMonthStart.getMonth())
  return { monthsDiff, months: Math.min(24, Math.max(1, monthsDiff + 1)) }
}

/**
 * Lo storico delle transazioni che la Dashboard scarica.
 *
 * Finestra ampia (2 anni) per default: copre praticamente qualsiasi utente
 * senza dover sapere in anticipo da quando ha dati reali, per la card "Spese
 * per categoria" che permette di sfogliare periodi passati indipendentemente
 * dal range scelto per il grafico. Si allarga oltre i 2 anni solo se si sceglie
 * un inizio del grafico ancora più indietro.
 *
 * Il limite superiore arriva fino alla fine del periodo di stipendio corrente,
 * non solo a oggi: così una spesa già registrata con data futura ma ancora
 * dentro il periodo corrente non viene esclusa.
 */
export function historyWindow(rangeStart: string, today: Date, salaryDay: number | null): { from: string; to: string } {
  const defaultHistoryStart = new Date(today.getFullYear() - 2, today.getMonth(), 1)
  const chartHistoryStart = new Date(rangeStart)
  const historyStart = chartHistoryStart < defaultHistoryStart ? chartHistoryStart : defaultHistoryStart
  const to = periodRangeOf(periodKeyOf(iso(today), salaryDay), salaryDay).end
  return { from: iso(historyStart), to }
}

/**
 * I periodi e l'intervallo di Risparmio: il primo giorno del periodo più
 * vecchio mostrato, l'ultimo di quello corrente.
 */
export function savingsWindow(
  today: Date,
  salaryDay: number | null,
): { from: string; to: string; periodKeys: string[]; currentPeriodKey: string } {
  const currentPeriodKey = periodKeyOf(iso(today), salaryDay)
  const periodKeys = lastPeriodKeys(currentPeriodKey, SAVINGS_PERIODS_SHOWN)
  return {
    from: periodRangeOf(periodKeys[0], salaryDay).start,
    to: periodRangeOf(currentPeriodKey, salaryDay).end,
    periodKeys,
    currentPeriodKey,
  }
}
