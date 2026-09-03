// La generazione delle chiavi di periodo mostrate nella pagina Risparmio,
// estratta perché è aritmetica di calendario pura e perché il punto in cui
// sbaglia — il cambio d'anno — non si vede montando la pagina.

/**
 * Le ultime `count` chiavi di periodo fino a `currentPeriodKey` inclusa, dalla
 * più vecchia alla più recente.
 *
 * Una chiave è "YYYY-MM". Si cammina all'indietro con {@code new Date(y, m-1-i, 1)},
 * che gestisce da sé il rientro d'anno: gennaio meno un mese è dicembre
 * dell'anno prima, non il mese -1 dello stesso anno.
 */
export function lastPeriodKeys(currentPeriodKey: string, count: number): string[] {
  const [year, month] = currentPeriodKey.split('-').map(Number)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}
