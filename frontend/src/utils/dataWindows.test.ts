import { describe, expect, it } from 'vitest'
import { forecastWindow, historyWindow, savingsWindow } from './dataWindows'

// Quali intervalli di dati chiedono Dashboard e Risparmio. Stanno in un file a
// parte perché li usano in due: la pagina per le sue query e il menu per
// precaricarle. Una differenza fra i due calcoli non dà errore — riempie una
// voce di cache che nessuno legge, e la pagina riparte da capo al clic.

describe('forecastWindow', () => {
  /**
   * Conta periodi da stipendio a stipendio, non mesi di calendario, perché è
   * per periodi che il backend prevede.
   *
   * Il caso che distingue le due letture: oggi è il 28 marzo e l'accredito è il
   * 27, quindi il periodo in corso è già quello che finisce ad aprile. Con
   * l'intervallo che arriva al 10 settembre — ancora dentro il periodo di
   * settembre — i periodi da coprire sono sei (aprile…settembre). Contando i
   * mesi di calendario se ne chiederebbero sette: uno in più, e con la chiave
   * di cache sbagliata.
   */
  it('conta periodi, e dopo l accredito il periodo in corso è già il prossimo', () => {
    const oggi = new Date('2026-03-28T12:00:00')

    expect(forecastWindow('2026-09-10', oggi, 27)).toEqual({ periodsDiff: 5, periods: 6 })
  })

  it('senza giorno di accredito il periodo è il mese, e il conto non cambia', () => {
    const oggi = new Date('2026-03-28T12:00:00')

    expect(forecastWindow('2026-09-10', oggi, null)).toEqual({ periodsDiff: 6, periods: 7 })
  })

  // Un intervallo che finisce nel periodo in corso chiede comunque un periodo:
  // è quello che riempie la card "saldo previsto a fine periodo".
  it('almeno un periodo, anche con un intervallo che finisce oggi', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(forecastWindow('2026-03-10', oggi, 27)).toEqual({ periodsDiff: 0, periods: 1 })
  })

  // Il tetto è quello del backend (@Max(24)): chiedere di più darebbe 400.
  it('non chiede mai più di ventiquattro periodi', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(forecastWindow('2030-03-10', oggi, 27).periods).toBe(24)
  })

  // Un intervallo che finisce nel passato non ha niente da prevedere: chi
  // chiama lo riconosce dal segno, e non disegna punti futuri.
  it('un intervallo già passato si riconosce dal segno', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(forecastWindow('2026-01-10', oggi, 27).periodsDiff).toBeLessThan(0)
  })
})

describe('historyWindow', () => {
  /**
   * Il limite superiore è la fine del periodo in corso, non oggi: una spesa già
   * registrata con data futura ma dentro il periodo corrente fa parte di questo
   * periodo e deve entrare nella card "Spese per categoria".
   */
  it('arriva alla fine del periodo in corso, non a oggi', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(historyWindow('2026-01-01', oggi, 27).to).toBe('2026-03-26')
  })

  it('senza giorno di accredito arriva a fine mese', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(historyWindow('2026-01-01', oggi, null).to).toBe('2026-03-31')
  })

  // Due anni indietro di default, e più indietro solo se lo chiede il grafico.
  it('parte da due anni fa, o da prima se il grafico lo chiede', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    expect(historyWindow('2026-01-01', oggi, null).from).toBe('2024-03-01')
    expect(historyWindow('2023-06-01', oggi, null).from).toBe('2023-06-01')
  })
})

describe('savingsWindow', () => {
  it('copre i dodici periodi mostrati, fino alla fine di quello in corso', () => {
    const oggi = new Date('2026-03-10T12:00:00')

    const finestra = savingsWindow(oggi, 27)

    expect(finestra.currentPeriodKey).toBe('2026-03')
    expect(finestra.periodKeys).toHaveLength(12)
    expect(finestra.to).toBe('2026-03-26')
    expect(finestra.from).toBe('2025-03-27')
  })
})
