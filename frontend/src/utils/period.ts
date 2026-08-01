// Giorni nel mese (month è 1-indicizzato: gennaio = 1).
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Chiave del periodo (formato "YYYY-MM", stesso formato usato per i mesi di
// calendario) a cui appartiene una data, secondo il giorno di stipendio
// configurato dall'utente. Se salaryDay è null o 1, il periodo coincide col
// mese di calendario (comportamento di default, invariato).
//
// Il periodo è "intitolato" al mese in cui termina, non a quello in cui
// inizia: es. salaryDay=27, lo stipendio del 27 giugno apre il periodo che
// l'utente chiama "luglio" (27 giugno...26 luglio = "luglio").
export function periodKeyOf(dateStr: string, salaryDay: number | null): string {
  if (!salaryDay || salaryDay === 1) return dateStr.slice(0, 7)
  const [year, month, day] = dateStr.split('-').map(Number)
  const effDay = Math.min(salaryDay, daysInMonth(year, month))
  let keyYear = year
  let keyMonth = month
  if (day >= effDay) {
    keyMonth += 1
    if (keyMonth > 12) {
      keyMonth = 1
      keyYear += 1
    }
  }
  return `${keyYear}-${pad(keyMonth)}`
}

// Estremi (inclusivi) del periodo identificato da una chiave "YYYY-MM",
// coerenti per costruzione con periodKeyOf: ogni data del range restituito
// mappa, tramite periodKeyOf, esattamente su questa stessa chiave (nessun
// buco, nessuna sovrapposizione tra periodi consecutivi).
export function periodRangeOf(periodKey: string, salaryDay: number | null): { start: string; end: string } {
  const [year, month] = periodKey.split('-').map(Number)
  if (!salaryDay || salaryDay === 1) {
    return { start: `${periodKey}-01`, end: `${periodKey}-${pad(daysInMonth(year, month))}` }
  }
  let prevYear = year
  let prevMonth = month - 1
  if (prevMonth < 1) {
    prevMonth = 12
    prevYear -= 1
  }
  const startDay = Math.min(salaryDay, daysInMonth(prevYear, prevMonth))
  const endDay = Math.min(salaryDay, daysInMonth(year, month)) - 1
  return { start: `${prevYear}-${pad(prevMonth)}-${pad(startDay)}`, end: `${year}-${pad(month)}-${pad(endDay)}` }
}
