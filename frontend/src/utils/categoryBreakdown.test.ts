import { describe, expect, it } from 'vitest'
import { buildCategoryBreakdown } from './categoryBreakdown'
import type { Category, Transaction } from '../api/types'

// L'aggregazione per categoria della card "Spese per categoria". Decide quanto
// mostra ogni riga della Dashboard: se una sottocategoria non confluisce nel
// padre, il totale mostrato è più basso del vero e non c'è modo di accorgersene
// guardando lo schermo.

function categoria(id: string, name: string, parentId: string | null = null): Category {
  return { id, name, type: 'EXPENSE', color: null, icon: null, parentId, archived: false }
}

// Il nome che la riga mostra arriva dalla transazione, non dall'elenco delle
// categorie: qui vanno tenuti coerenti come lo sono nei dati veri.
const NOMI: Record<string, string> = {
  alimentari: 'Alimentari',
  supermercato: 'Supermercato',
  bar: 'Bar',
  casa: 'Casa',
}

let contatore = 0
function spesa(categoryId: string, amount: number, type: 'EXPENSE' | 'INCOME' = 'EXPENSE'): Transaction {
  contatore += 1
  return {
    id: `t-${contatore}`,
    categoryId,
    categoryName: NOMI[categoryId],
    categoryIcon: null,
    categoryColor: null,
    amount,
    type,
    occurredOn: '2026-08-10',
    description: null,
    recurringTransactionId: null,
  }
}

const ALIMENTARI = categoria('alimentari', 'Alimentari')
const SUPERMERCATO = categoria('supermercato', 'Supermercato', 'alimentari')
const BAR = categoria('bar', 'Bar', 'alimentari')
const CASA = categoria('casa', 'Casa')

describe('buildCategoryBreakdown', () => {
  it('somma le spese di ogni categoria principale', () => {
    const righe = buildCategoryBreakdown([spesa('casa', 100), spesa('casa', 50)], [CASA])

    expect(righe).toHaveLength(1)
    expect(righe[0].amount).toBe(150)
  })

  // Il punto centrale: la riga del padre mostra il totale complessivo, e il
  // dettaglio resta disponibile aprendola.
  it('le sottocategorie confluiscono nel totale del padre restando nel dettaglio', () => {
    const righe = buildCategoryBreakdown(
      [spesa('supermercato', 80), spesa('bar', 20)],
      [ALIMENTARI, SUPERMERCATO, BAR],
    )

    expect(righe).toHaveLength(1)
    expect(righe[0].categoryName).toBe('Alimentari')
    expect(righe[0].amount).toBe(100)
    expect(righe[0].children.map((c) => c.amount)).toEqual([80, 20])
  })

  // Una spesa messa direttamente sul padre entra nel totale ma non deve
  // generare una riga figlia: nel dettaglio comparirebbe "Alimentari" dentro
  // "Alimentari".
  it('una spesa sul padre entra nel totale senza diventare una riga figlia', () => {
    const righe = buildCategoryBreakdown(
      [spesa('alimentari', 30), spesa('supermercato', 70)],
      [ALIMENTARI, SUPERMERCATO],
    )

    expect(righe[0].amount).toBe(100)
    expect(righe[0].children).toHaveLength(1)
    expect(righe[0].children[0].categoryId).toBe('supermercato')
  })

  // Il padre archiviato non torna da `categoriesApi.list()`: la sottocategoria
  // deve restare visibile al primo livello invece di sparire dalla card.
  it('col padre non fra le categorie note la riga resta al primo livello', () => {
    const righe = buildCategoryBreakdown([spesa('supermercato', 70)], [SUPERMERCATO])

    expect(righe).toHaveLength(1)
    expect(righe[0].categoryId).toBe('supermercato')
    expect(righe[0].children).toEqual([])
  })

  it('le entrate non entrano nella ripartizione delle spese', () => {
    const righe = buildCategoryBreakdown(
      [spesa('casa', 100), spesa('casa', 500, 'INCOME')],
      [CASA],
    )

    expect(righe[0].amount).toBe(100)
  })

  it('ordina le righe e il dettaglio dalla spesa più alta', () => {
    const righe = buildCategoryBreakdown(
      [spesa('casa', 50), spesa('bar', 20), spesa('supermercato', 80)],
      [ALIMENTARI, SUPERMERCATO, BAR, CASA],
    )

    expect(righe.map((r) => r.categoryName)).toEqual(['Alimentari', 'Casa'])
    expect(righe[0].children.map((c) => c.categoryId)).toEqual(['supermercato', 'bar'])
  })

  it('senza spese restituisce un elenco vuoto', () => {
    expect(buildCategoryBreakdown([], [ALIMENTARI, CASA])).toEqual([])
  })

  // Il totale della card deve coincidere con la somma delle spese: è quello che
  // rende confrontabile il numero con quello delle altre schermate.
  it('la somma delle righe è la somma delle spese', () => {
    const spese = [spesa('supermercato', 80), spesa('bar', 20), spesa('casa', 50), spesa('alimentari', 10)]

    const totale = buildCategoryBreakdown(spese, [ALIMENTARI, SUPERMERCATO, BAR, CASA])
      .reduce((somma, r) => somma + r.amount, 0)

    expect(totale).toBe(160)
  })
})
