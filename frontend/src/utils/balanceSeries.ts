import { periodKeyOf } from './period'

// La ricostruzione della curva "Andamento saldo", estratta da DashboardPage.
//
// È l'aritmetica più a rischio dell'app, e per una ragione precisa: non
// conserva i saldi storici. Parte dal saldo di oggi, torna indietro sottraendo
// il netto di tutti i periodi noti, e da lì cammina in avanti periodo per
// periodo. Uno scarto di un periodo in questa camminata non produce un errore
// né un grafico vuoto: produce una curva sbagliata ma plausibile, che è il modo
// peggiore di sbagliare — nessuno la guarda pensando di dover verificare.
//
// I punti sono periodi da stipendio a stipendio, non mesi di calendario: erano
// mesi, ed erano l'ultimo pezzo dell'app a esserlo mentre budget, risparmio,
// card "Spese per categoria" ed export contavano già per periodi.

export interface ChartPoint {
  key?: string
  label: string
  actual: number | null
  projected: number | null
  /**
   * Periodo della card "Spese per categoria" a cui questo punto rimanda al
   * click. Da quando il grafico ragiona per periodi coincide con `key`: prima
   * andava ricavato dalla metà del mese, perché la chiave del punto era un mese
   * di calendario e il periodo omonimo poteva cadere quasi tutto in quello
   * precedente. Resta null sui periodi futuri, che non hanno spese registrate
   * da mostrare.
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
 * I punti storici della curva, uno per periodo concluso.
 *
 * Il periodo in corso è escluso di proposito: è incompleto, e disegnarlo
 * farebbe sembrare che il saldo sia crollato ogni volta che si apre la
 * Dashboard il giorno dopo l'accredito. Al suo posto il grafico mostra il punto
 * "Ora" e, subito dopo, la *previsione* di fine periodo corrente — che è il
 * numero della card "Saldo previsto a fine periodo".
 *
 * `startKey`/`endKey` (chiavi di periodo) ritagliano la finestra *dopo* il
 * calcolo e non prima: il saldo di partenza si ricostruisce da tutto lo storico
 * disponibile, altrimenti restringere la finestra sposterebbe anche la curva.
 */
export function buildHistoricalPoints(
  transactions: SeriesTransaction[],
  currentBalance: number,
  currentPeriodKey: string,
  startKey: string,
  endKey: string,
  salaryDay: number | null,
  periodLabel: (periodKey: string) => string,
): ChartPoint[] {
  const netByPeriod = new Map<string, number>()
  for (const t of transactions) {
    const key = periodKeyOf(t.occurredOn, salaryDay)
    if (key >= currentPeriodKey) continue
    const signed = t.type === 'INCOME' ? t.amount : -t.amount
    netByPeriod.set(key, (netByPeriod.get(key) ?? 0) + signed)
  }

  const historicalKeys = Array.from(netByPeriod.keys()).sort()
  const totalHistoricalNet = historicalKeys.reduce((sum, k) => sum + (netByPeriod.get(k) ?? 0), 0)

  // All'indietro fino a prima del primo periodo noto, poi in avanti: il punto di
  // un periodo è il saldo *alla sua fine*, non al suo inizio.
  let running = currentBalance - totalHistoricalNet
  return historicalKeys
    .map((key) => {
      running += netByPeriod.get(key) ?? 0
      return {
        key,
        label: periodLabel(key),
        actual: running,
        projected: null,
        periodKey: key,
      }
    })
    .filter((p) => p.key >= startKey && p.key <= endKey)
}

/**
 * La serie intera: storico, il punto "Ora" che fa da cerniera fra il misurato e
 * il previsto, e i periodi previsti — a partire da quello in corso. "Ora" porta
 * entrambi i valori perché è dove le due linee si toccano: con uno solo, il
 * grafico mostrerebbe uno stacco.
 *
 * Il primo periodo previsto è quello **in corso**, e non il successivo: era il
 * successivo, e il saldo di fine periodo corrente — il numero che la card
 * mostra in grande — non compariva da nessuna parte sulla curva, che cominciava
 * a prevedere solo da un mese e mezzo in avanti.
 */
export function buildBalanceSeries(
  historicalPoints: ChartPoint[],
  currentBalance: number,
  todayStr: string,
  forecastPeriods: { period: string; runningBalance: number }[],
  salaryDay: number | null,
  periodLabel: (periodKey: string) => string,
): ChartPoint[] {
  return [
    ...historicalPoints,
    {
      label: 'Ora',
      actual: currentBalance,
      projected: currentBalance,
      periodKey: periodKeyOf(todayStr, salaryDay),
    },
    ...forecastPeriods.map((p) => ({
      label: periodLabel(p.period),
      actual: null,
      projected: p.runningBalance,
      periodKey: null,
    })),
  ]
}
