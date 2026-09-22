import { describe, expect, it } from 'vitest'
import { buildCategoryTree, flattenCategoryTree } from './categoryTree'
import type { Category } from '../api/types'

// L'ordinamento ad albero delle categorie: alimenta tutti i menu di scelta
// dell'app e la pagina Categorie. Una categoria che sparisce da qui sparisce da
// ogni menu, e senza errore.

function categoria(id: string, name: string, parentId: string | null = null): Category {
  return { id, name, type: 'EXPENSE', color: null, icon: null, parentId, archived: false }
}

const ALIMENTARI = categoria('1', 'Alimentari')
const CASA = categoria('2', 'Casa')
const SUPERMERCATO = categoria('3', 'Supermercato', '1')
const BAR = categoria('4', 'Bar e caffè', '1')

describe('flattenCategoryTree', () => {
  it('mette ogni sottocategoria subito sotto la propria principale', () => {
    const piatto = flattenCategoryTree([CASA, SUPERMERCATO, ALIMENTARI, BAR])

    expect(piatto.map((e) => e.category.name)).toEqual([
      'Alimentari',
      'Bar e caffè',
      'Supermercato',
      'Casa',
    ])
  })

  it('distingue le principali dalle sottocategorie con la profondità', () => {
    const piatto = flattenCategoryTree([ALIMENTARI, SUPERMERCATO])

    expect(piatto.map((e) => e.depth)).toEqual([0, 1])
  })

  it('ordina alfabeticamente secondo l italiano', () => {
    const piatto = flattenCategoryTree([
      categoria('1', 'Zucchero'),
      categoria('2', 'Àncora'),
      categoria('3', 'Bar'),
    ])

    expect(piatto.map((e) => e.category.name)).toEqual(['Àncora', 'Bar', 'Zucchero'])
  })

  // Il caso documentato nel codice: `categoriesApi.list()` non restituisce le
  // categorie archiviate, quindi una sottocategoria può ritrovarsi col padre
  // assente. Deve comparire lo stesso, come principale: sparire da tutti i menu
  // sarebbe molto peggio che comparire nel posto sbagliato.
  it('una sottocategoria col padre assente diventa principale invece di sparire', () => {
    const piatto = flattenCategoryTree([SUPERMERCATO])

    expect(piatto).toHaveLength(1)
    expect(piatto[0].category.name).toBe('Supermercato')
    expect(piatto[0].depth).toBe(0)
  })

  it('non perde nessuna categoria', () => {
    const tutte = [ALIMENTARI, CASA, SUPERMERCATO, BAR]

    expect(flattenCategoryTree(tutte)).toHaveLength(tutte.length)
  })

  it('con un elenco vuoto restituisce un elenco vuoto', () => {
    expect(flattenCategoryTree([])).toEqual([])
  })

  it('non modifica l elenco che riceve', () => {
    const originale = [CASA, ALIMENTARI]
    const copia = [...originale]

    flattenCategoryTree(originale)

    expect(originale).toEqual(copia)
  })
})

describe('buildCategoryTree', () => {
  it('raggruppa le sottocategorie sotto la propria principale', () => {
    const albero = buildCategoryTree([CASA, SUPERMERCATO, ALIMENTARI, BAR])

    expect(albero.map((n) => n.category.name)).toEqual(['Alimentari', 'Casa'])
    expect(albero[0].children.map((c) => c.name)).toEqual(['Bar e caffè', 'Supermercato'])
    expect(albero[1].children).toEqual([])
  })

  it('una sottocategoria col padre assente diventa principale', () => {
    const albero = buildCategoryTree([SUPERMERCATO])

    expect(albero).toHaveLength(1)
    expect(albero[0].category.name).toBe('Supermercato')
  })

  // Le due funzioni devono raccontare lo stesso albero: la pagina Categorie usa
  // questa, tutti i menu usano l'altra, e se divergessero mostrerebbero elenchi
  // diversi delle stesse categorie.
  it('contiene le stesse categorie della versione piatta', () => {
    const tutte = [CASA, SUPERMERCATO, ALIMENTARI, BAR]

    const daAlbero = buildCategoryTree(tutte)
      .flatMap((n) => [n.category, ...n.children])
      .map((c) => c.id)
      .sort()
    const daPiatto = flattenCategoryTree(tutte)
      .map((e) => e.category.id)
      .sort()

    expect(daAlbero).toEqual(daPiatto)
  })
})
