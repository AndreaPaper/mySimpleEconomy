import { describe, expect, it } from 'vitest'
import { projectPayoff } from './payoff'

// La data di estinzione di un debito. Divisione per zero e salti di mese: due
// modi di produrre una data plausibile ma sbagliata, che a schermo non si
// distinguerebbe da una giusta.

const fmt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

describe('projectPayoff', () => {
  it('divide il residuo per la rata e arrotonda per eccesso', () => {
    // 4800 / 200 = 24 mesi esatti da marzo 2026 → marzo 2028.
    expect(projectPayoff(4800, 200, fmt, new Date(2026, 2, 15))).toBe('marzo 2028')
  })

  it('un resto non intero fa slittare al mese dopo', () => {
    // 450 / 200 = 2,25 → 3 mesi da gennaio → aprile.
    expect(projectPayoff(450, 200, fmt, new Date(2026, 0, 10))).toBe('aprile 2026')
  })

  /**
   * Il salto di mese pulito: partendo da un 31 gennaio, senza portare prima il
   * giorno al primo, {@code setMonth(+1)} finirebbe in marzo (febbraio non ha
   * il 31) e la proiezione sbaglierebbe di un mese.
   */
  it('non sballa il mese partendo dal 31 gennaio', () => {
    // 200 / 200 = 1 mese da 31 gennaio → deve dare febbraio, non marzo.
    expect(projectPayoff(200, 200, fmt, new Date(2026, 0, 31))).toBe('febbraio 2026')
  })

  it('a cavallo d anno somma correttamente', () => {
    // 3 mesi da novembre 2026 → febbraio 2027.
    expect(projectPayoff(600, 200, fmt, new Date(2026, 10, 5))).toBe('febbraio 2027')
  })

  /**
   * Rata nulla: non c'è una data. Dividere darebbe Infinity e una data
   * assurda; si restituisce null e chi chiama mostra un trattino.
   */
  it('con rata nulla o negativa non proietta nulla', () => {
    expect(projectPayoff(4800, 0, fmt, new Date(2026, 2, 15))).toBeNull()
    expect(projectPayoff(4800, -50, fmt, new Date(2026, 2, 15))).toBeNull()
  })

  it('un residuo già estinto è saldato oggi', () => {
    expect(projectPayoff(0, 200, fmt, new Date(2026, 2, 15))).toBe('marzo 2026')
  })
})
