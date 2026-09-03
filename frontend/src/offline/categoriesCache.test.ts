import { describe, expect, it } from 'vitest'
import { cacheCategories, loadCachedCategories } from './categoriesCache'
import type { Category } from '../api/types'

// La copia delle categorie tenuta nel browser: è quello che permette di
// registrare una spesa mentre il backend non risponde. Non è un dato prezioso —
// si riscrive alla prima risposta — ma è letto all'avvio, quindi un errore qui
// non degrada l'app: le impedisce di aprirsi.

const categoria = (id: string, name: string): Category =>
  ({ id, name, type: 'EXPENSE', color: '#A8C7E7', icon: 'cart', parentId: null }) as Category

describe('categoriesCache', () => {
  it('senza nulla in memoria torna un elenco vuoto', () => {
    expect(loadCachedCategories()).toEqual([])
  })

  it('rilegge quello che ha scritto', () => {
    const categorie = [categoria('c1', 'Casa'), categoria('c2', 'Salute')]

    cacheCategories(categorie)

    expect(loadCachedCategories()).toEqual(categorie)
  })

  it('una scrittura successiva sostituisce la precedente invece di aggiungersi', () => {
    cacheCategories([categoria('c1', 'Casa')])
    cacheCategories([categoria('c2', 'Salute')])

    expect(loadCachedCategories()).toHaveLength(1)
  })

  it('un contenuto illeggibile degrada a elenco vuoto', () => {
    localStorage.setItem('categories_cache', '{non-json')

    expect(loadCachedCategories()).toEqual([])
  })

  /**
   * Il caso che il try/catch da solo non copre: un JSON perfettamente valido che
   * però non è un elenco. Passava di qui intatto e faceva esplodere il primo
   * {@code .map()} a valle — cioè al montaggio, cioè con l'app che non parte.
   */
  it('un JSON valido che non è un elenco degrada a elenco vuoto', () => {
    localStorage.setItem('categories_cache', '"una stringa"')
    expect(loadCachedCategories()).toEqual([])

    localStorage.setItem('categories_cache', '{"categorie":[]}')
    expect(loadCachedCategories()).toEqual([])

    localStorage.setItem('categories_cache', 'null')
    expect(loadCachedCategories()).toEqual([])
  })
})
