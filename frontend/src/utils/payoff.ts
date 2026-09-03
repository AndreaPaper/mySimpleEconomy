// La proiezione della data di estinzione di un debito, estratta da DebtsPage.
// Non serve al backend: è una stima fatta a schermo dividendo il residuo per la
// rata. È il tipo di aritmetica che si può provare in una riga e che, sbagliata,
// darebbe una data plausibile ma falsa.

/**
 * I mesi stimati per saldare il residuo alla rata indicata, e la data prevista.
 *
 * `setDate(1)` prima di `setMonth` è deliberato: senza, partendo da un 31
 * gennaio, {@code setMonth(+1)} finirebbe al 2 o 3 marzo (febbraio non ha il
 * 31), sballando il mese. Portando prima il giorno al primo, il salto di mese
 * resta pulito.
 *
 * Con una rata nulla o negativa non c'è una data: dividere darebbe Infinity o un
 * numero senza senso, quindi si restituisce null e chi chiama mostra un trattino.
 */
export function projectPayoff(
  remainingAmount: number,
  monthlyPaymentAmount: number,
  formatter: Intl.DateTimeFormat,
  today: Date = new Date(),
): string | null {
  if (monthlyPaymentAmount <= 0) return null
  if (remainingAmount <= 0) return formatter.format(today)

  const monthsRemaining = Math.ceil(remainingAmount / monthlyPaymentAmount)
  const payoffDate = new Date(today)
  payoffDate.setDate(1)
  payoffDate.setMonth(payoffDate.getMonth() + monthsRemaining)
  return formatter.format(payoffDate)
}
