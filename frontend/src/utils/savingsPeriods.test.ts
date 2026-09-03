import { describe, expect, it } from 'vitest'
import { lastPeriodKeys } from './savingsPeriods'

// Le chiavi di periodo dello storico Risparmio. Il cambio d'anno è l'unico
// punto dove si sbaglia, e non si vede montando la pagina.

describe('lastPeriodKeys', () => {
  it('torna le ultime N chiavi, dalla più vecchia alla corrente', () => {
    expect(lastPeriodKeys('2026-06', 4)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
  })

  it('include sempre la corrente come ultima', () => {
    const chiavi = lastPeriodKeys('2026-06', 12)

    expect(chiavi).toHaveLength(12)
    expect(chiavi[chiavi.length - 1]).toBe('2026-06')
  })

  // Il caso che vale l'estrazione: camminando indietro da gennaio si deve
  // scavalcare l'anno, non finire a "2026-00" o "2026--1".
  it('scavalca il cambio d anno andando indietro', () => {
    expect(lastPeriodKeys('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('con una sola chiave torna solo la corrente', () => {
    expect(lastPeriodKeys('2026-06', 1)).toEqual(['2026-06'])
  })

  it('i mesi sono sempre a due cifre', () => {
    expect(lastPeriodKeys('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})
