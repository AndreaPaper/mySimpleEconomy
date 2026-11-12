import { describe, expect, it } from 'vitest'
import { formatCadence, formatDay } from './cadence'

describe('cadenza e scadenza leggibili', () => {
  it('al singolare senza il numero, al plurale con', () => {
    expect(formatCadence(1, 'MONTH')).toBe('ogni mese')
    expect(formatCadence(2, 'MONTH')).toBe('ogni 2 mesi')
    expect(formatCadence(1, 'WEEK')).toBe('ogni settimana')
    expect(formatCadence(3, 'DAY')).toBe('ogni 3 giorni')
    expect(formatCadence(1, 'YEAR')).toBe('ogni anno')
    expect(formatCadence(2, 'YEAR')).toBe('ogni 2 anni')
  })

  it('la data come si scrive in italiano', () => {
    expect(formatDay('2026-11-04')).toBe('04/11/2026')
  })
})
