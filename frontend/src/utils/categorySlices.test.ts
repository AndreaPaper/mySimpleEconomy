import { describe, expect, it } from 'vitest'
import { OTHER_ID, buildCategorySlices } from './categorySlices'
import type { CategoryAmountNode } from '../api/types'

// La suddivisione in fette del grafico a ciambella su mobile. La regola è una
// sola — sotto il 5% si confluisce in "Altro" — ma ha un'eccezione che è facile
// perdere in un riordino, e che si vedrebbe solo aprendo la Dashboard su un
// telefono con i dati giusti.

const cat = (id: string, name: string, amount: number, color: string | null = '#A8C7E7'): CategoryAmountNode => ({
  categoryId: id,
  categoryName: name,
  categoryColor: color,
  categoryIcon: null,
  amount,
  children: [],
})

describe('buildCategorySlices', () => {
  it('senza dati non produce fette', () => {
    expect(buildCategorySlices([])).toEqual({ slices: [], total: 0 })
  })

  it('somma il totale e tiene distinte le categorie grosse', () => {
    const { slices, total } = buildCategorySlices([
      cat('c1', 'Casa', 600),
      cat('c2', 'Salute', 400),
    ])

    expect(total).toBe(1000)
    expect(slices.map((s) => s.categoryName)).toEqual(['Casa', 'Salute'])
  })

  it('le categorie sotto il cinque per cento confluiscono in "Altro"', () => {
    const { slices } = buildCategorySlices([
      cat('c1', 'Casa', 900),
      cat('c2', 'Bollo', 20),
      cat('c3', 'Cartoleria', 30),
      cat('c4', 'Caffè', 50),
    ])

    expect(slices.map((s) => s.categoryName)).toEqual(['Casa', 'Caffè', 'Altro'])
    const altro = slices.find((s) => s.categoryId === OTHER_ID)!
    expect(altro.amount).toBe(50)
    // "Altro" resta apribile: le sue categorie sono lì dentro, non perdute.
    expect(altro.children.map((c) => c.categoryName)).toEqual(['Bollo', 'Cartoleria'])
  })

  /**
   * L'eccezione che vale il test: una sola categoria minore non guadagna niente
   * a chiamarsi "Altro". Raggrupparla significherebbe perderne il nome per
   * accorparla con nessun altro — l'utente vedrebbe una fetta anonima al posto
   * di quella che sa di avere.
   */
  it('una sola categoria minore resta sé stessa invece di diventare "Altro"', () => {
    const { slices } = buildCategorySlices([cat('c1', 'Casa', 980), cat('c2', 'Bollo', 20)])

    expect(slices.map((s) => s.categoryName)).toEqual(['Casa', 'Bollo'])
    expect(slices.some((s) => s.categoryId === OTHER_ID)).toBe(false)
  })

  // Esattamente al cinque per cento si resta fuori dal raggruppamento: il
  // confronto è stretto, e la soglia va provata sul proprio bordo.
  it('esattamente al cinque per cento la categoria resta distinta', () => {
    const { slices } = buildCategorySlices([
      cat('c1', 'Casa', 950),
      cat('c2', 'Bollo', 50),
    ])

    expect(slices.map((s) => s.categoryName)).toEqual(['Casa', 'Bollo'])
  })

  // Con tutto a zero non si può calcolare nessuna quota: nessuna categoria
  // finisce in "Altro", invece di finirci tutte per una divisione per zero.
  it('con tutti gli importi a zero non raggruppa nulla', () => {
    const { slices, total } = buildCategorySlices([cat('c1', 'Casa', 0), cat('c2', 'Salute', 0)])

    expect(total).toBe(0)
    expect(slices.map((s) => s.categoryName)).toEqual(['Casa', 'Salute'])
  })

  // Una categoria senza colore ne prende uno di ripiego: null arriverebbe a
  // Recharts come fetta trasparente.
  it('una categoria senza colore ne riceve uno di ripiego', () => {
    const { slices } = buildCategorySlices([cat('c1', 'Casa', 100, null)])

    expect(slices[0].categoryColor).toBeTruthy()
  })
})
