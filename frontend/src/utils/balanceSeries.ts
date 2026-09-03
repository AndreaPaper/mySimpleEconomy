import { periodKeyOf } from './period'

// La ricostruzione della curva "Andamento saldo", estratta da DashboardPage.
//
// È l'aritmetica più a rischio dell'app, e per una ragione precisa: non
// conserva i saldi storici. Parte dal saldo di oggi, torna indietro sottraendo
// il netto di tutti i mesi noti, e da lì cammina in avanti mese per mese. Uno
// scarto di un mese in questa camminata non produce un errore né un grafico
// vuoto: produce una curva sbagliata ma plausibile, che è il modo peggiore di
// sbagliare — nessuno la guarda pensando di dover verificare.

export interface ChartPoint {
  key?: string
  label: string
  actual: number | null
  projected: number | null
  /**
   * Periodo della card "Spese per categoria" a cui questo punto rimanda al
   * click. Il grafico ragiona per mese di calendario, la card per periodo
   * stipendio-to-stipendio: null sui mesi futuri, che non hanno spese
   * registrate da mostrare.
   */
  periodKey: string | null
}

export interface SeriesTransaction {
  occurredOn: string
  amount: number
  type: 'INCOME' | 'EXPENSE'
}

export const monthKey = (dateStr: string): string => dateStr.slice(0, 7)

/**
 * I punti storici della curva.
 *
 * Il mese corrente è escluso di proposito: è incompleto, e disegnarlo farebbe
 * sembrare che il saldo sia crollato ogni volta che si apre la Dashboard il
 * primo del mese.
 *
 * `startMonthKey`/`endMonthKey` ritagliano la finestra *dopo* il calcolo e non
 * prima: il saldo di partenza si ricostruisce da tutto lo storico disponibile,
 * altrimenti restringere la finestra sposterebbe anche la curva.
 */
export function buildHistoricalPoints(
  transactions: SeriesTransaction[],
  currentBalance: number,
  currentCalendarKey: string,
  startMonthKey: string,
  endMonthKey: string,
  salaryDay: number | null,
  monthLabel: (yearMonth: string) => string,
): ChartPoint[] {
  const netByMonth = new Map<string, number>()
  for (const t of transactions) {
    const key = monthKey(t.occurredOn)
    if (key >= currentCalendarKey) continue
    const signed = t.type === 'INCOME' ? t.amount : -t.amount
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + signed)
  }

  const historicalKeys = Array.from(netByMonth.keys()).sort()
  const totalHistoricalNet = historicalKeys.reduce((sum, k) => sum + (netByMonth.get(k) ?? 0), 0)

  // All'indietro fino a prima del primo mese noto, poi in avanti: il punto di
  // un mese è il saldo *alla sua fine*, non al suo inizio.
  let running = currentBalance - totalHistoricalNet
  return historicalKeys
    .map((key) => {
      running += netByMonth.get(key) ?? 0
      return {
        key,
        label: monthLabel(key),
        actual: running,
        projected: null,
        // Il periodo che contiene la metà di questo mese di calendario: con
        // un accredito a inizio mese il periodo omonimo cadrebbe quasi tutto
        // nel mese precedente, quindi non basta riusare la stessa chiave.
        periodKey: periodKeyOf(`${key}-15`, salaryDay),
      }
    })
    .filter((p) => p.key >= startMonthKey && p.key <= endMonthKey)
}

/**
 * La serie intera: storico, il punto "Ora" che fa da cerniera fra il misurato e
 * il previsto, e i mesi futuri. "Ora" porta entrambi i valori perché è dove le
 * due linee si toccano: con uno solo, il grafico mostrerebbe uno stacco.
 */
export function buildBalanceSeries(
  historicalPoints: ChartPoint[],
  currentBalance: number,
  todayStr: string,
  futureMonths: { yearMonth: string; runningBalance: number }[],
  salaryDay: number | null,
  monthLabel: (yearMonth: string) => string,
): ChartPoint[] {
  return [
    ...historicalPoints,
    {
      label: 'Ora',
      actual: currentBalance,
      projected: currentBalance,
      periodKey: periodKeyOf(todayStr, salaryDay),
    },
    ...futureMonths.map((m) => ({
      label: monthLabel(m.yearMonth),
      actual: null,
      projected: m.runningBalance,
      periodKey: null,
    })),
  ]
}
