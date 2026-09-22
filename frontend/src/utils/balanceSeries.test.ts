import { describe, expect, it } from 'vitest'
import { buildBalanceSeries, buildHistoricalPoints, monthKey } from './balanceSeries'
import type { SeriesTransaction } from './balanceSeries'

// La curva dell'andamento saldo. Non conserva i saldi storici: parte da quello
// di oggi, torna indietro sottraendo il netto dei mesi noti, e da lì cammina in
// avanti. Uno scarto di un mese qui non dà errore e non svuota il grafico:
// disegna una curva sbagliata ma plausibile, che nessuno pensa di verificare.

const t = (occurredOn: string, amount: number, type: 'INCOME' | 'EXPENSE'): SeriesTransaction => ({
  occurredOn,
  amount,
  type,
})

const etichetta = (ym: string) => ym

/** Con i valori larghi che i test usano, la finestra non taglia mai nulla. */
const punti = (
  transazioni: SeriesTransaction[],
  saldoAttuale: number,
  meseCorrente: string,
  da = '0000-00',
  a = '9999-99',
) => buildHistoricalPoints(transazioni, saldoAttuale, meseCorrente, da, a, 27, etichetta)

describe('monthKey', () => {
  it('taglia la data al mese', () => {
    expect(monthKey('2026-03-02')).toBe('2026-03')
  })
})

describe('i punti storici', () => {
  /**
   * Il caso da cui dipende tutto il resto: il punto di un mese è il saldo
   * <em>alla sua fine</em>. Con 1000 oggi e un netto di -100 a gennaio e +300 a
   * febbraio, il saldo prima di gennaio era 800: quindi 700 a fine gennaio e
   * 1000 a fine febbraio. Un punto sfasato di un mese darebbe 800 e 700 —
   * numeri credibili, curva sbagliata.
   */
  it('ricostruisce il saldo a ritroso e lo riporta in avanti', () => {
    const risultato = punti(
      [
        t('2026-01-10', 100, 'EXPENSE'),
        t('2026-02-05', 300, 'INCOME'),
      ],
      1000,
      '2026-03',
    )

    expect(risultato.map((p) => [p.key, p.actual])).toEqual([
      ['2026-01', 700],
      ['2026-02', 1000],
    ])
  })

  /**
   * Il mese corrente è escluso di proposito: è incompleto, e disegnarlo farebbe
   * sembrare che il saldo sia crollato ogni volta che si apre la Dashboard il
   * primo del mese.
   */
  it('esclude il mese corrente perché è ancora a metà', () => {
    const risultato = punti(
      [t('2026-02-05', 300, 'INCOME'), t('2026-03-01', 500, 'EXPENSE')],
      1000,
      '2026-03',
    )

    expect(risultato.map((p) => p.key)).toEqual(['2026-02'])
    // E la spesa di marzo non entra nemmeno nella ricostruzione all'indietro:
    // il saldo attuale la comprende già.
    expect(risultato[0].actual).toBe(1000)
  })

  it('somma più movimenti dello stesso mese', () => {
    const risultato = punti(
      [t('2026-01-05', 100, 'EXPENSE'), t('2026-01-20', 40, 'EXPENSE'), t('2026-01-25', 200, 'INCOME')],
      1000,
      '2026-02',
    )

    // Netto di gennaio: +60. Prima era 940, a fine gennaio 1000.
    expect(risultato[0].actual).toBe(1000)
  })

  it('ordina i mesi anche se i movimenti arrivano alla rinfusa', () => {
    const risultato = punti(
      [t('2026-03-05', 10, 'EXPENSE'), t('2026-01-05', 10, 'EXPENSE'), t('2026-02-05', 10, 'EXPENSE')],
      1000,
      '2026-04',
    )

    expect(risultato.map((p) => p.key)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  /**
   * La finestra ritaglia <em>dopo</em> il calcolo. È la regola che tiene insieme
   * il grafico con la Dashboard: se restringesse anche la ricostruzione, i punti
   * mostrati cambierebbero valore a seconda di quanto indietro si guarda —
   * lo stesso mese direbbe due numeri diversi.
   */
  it('la finestra taglia i punti ma non sposta la curva', () => {
    const movimenti = [
      t('2026-01-10', 100, 'EXPENSE'),
      t('2026-02-05', 300, 'INCOME'),
      t('2026-03-05', 50, 'EXPENSE'),
    ]

    const intera = punti(movimenti, 1000, '2026-04')
    const ritagliata = punti(movimenti, 1000, '2026-04', '2026-02', '2026-03')

    expect(ritagliata.map((p) => p.key)).toEqual(['2026-02', '2026-03'])
    expect(ritagliata.map((p) => p.actual)).toEqual(
      intera.filter((p) => p.key !== '2026-01').map((p) => p.actual),
    )
  })

  it('senza storico non produce punti', () => {
    expect(punti([], 1000, '2026-03')).toEqual([])
  })

  /**
   * Il periodo a cui il punto rimanda si calcola sulla metà del mese, non sul
   * suo primo giorno: con un accredito a inizio mese il periodo omonimo cadrebbe
   * quasi tutto nel mese precedente, e cliccare su "marzo" aprirebbe le spese
   * di febbraio.
   */
  it('il periodo di destinazione si calcola a metà mese', () => {
    const risultato = punti([t('2026-01-10', 100, 'EXPENSE')], 1000, '2026-02')

    expect(risultato[0].periodKey).toBe('2026-01')
  })
})

describe('la serie completa', () => {
  /**
   * "Ora" porta sia il misurato sia il previsto perché è dove le due linee si
   * toccano: con uno solo dei due il grafico mostrerebbe uno stacco fra la
   * curva dello storico e quella della previsione.
   */
  it('il punto "Ora" fa da cerniera fra misurato e previsto', () => {
    const serie = buildBalanceSeries([], 1000, '2026-03-02', [], 27, etichetta)

    expect(serie).toHaveLength(1)
    expect(serie[0].label).toBe('Ora')
    expect(serie[0].actual).toBe(1000)
    expect(serie[0].projected).toBe(1000)
  })

  it('mette in fila storico, ora e futuro', () => {
    const storico = punti([t('2026-01-10', 100, 'EXPENSE')], 1000, '2026-02')

    const serie = buildBalanceSeries(
      storico,
      1000,
      '2026-02-15',
      [
        { yearMonth: '2026-03', runningBalance: 1200 },
        { yearMonth: '2026-04', runningBalance: 1400 },
      ],
      27,
      etichetta,
    )

    expect(serie.map((p) => p.label)).toEqual(['2026-01', 'Ora', '2026-03', '2026-04'])
  })

  // I mesi futuri non hanno spese registrate da mostrare: cliccarci non deve
  // aprire la card di un periodo vuoto.
  it('i mesi futuri non rimandano a nessun periodo', () => {
    const serie = buildBalanceSeries(
      [],
      1000,
      '2026-02-15',
      [{ yearMonth: '2026-03', runningBalance: 1200 }],
      27,
      etichetta,
    )

    const futuro = serie[serie.length - 1]
    expect(futuro.periodKey).toBeNull()
    expect(futuro.actual).toBeNull()
    expect(futuro.projected).toBe(1200)
  })
})
