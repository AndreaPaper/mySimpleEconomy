import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import MobileCategoryChart from './MobileCategoryChart'
import { stubChartSize } from '../test/mountPage'
import type { CategoryAmountNode } from '../api/types'

// Il grafico a ciambella della Dashboard su mobile. La suddivisione in fette è
// già coperta al 100% in utils/categorySlices; qui resta la selezione, che è
// l'unica cosa che il componente decide da sé.
//
// Serve lo stub delle dimensioni: senza, ResponsiveContainer misura zero e non
// rende nulla dei figli — il test passerebbe su un grafico vuoto.

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

const nodo = (over: Partial<CategoryAmountNode> = {}): CategoryAmountNode => ({
  categoryId: 'c-1',
  categoryName: 'Casa',
  categoryColor: '#A8C7E7',
  categoryIcon: null,
  amount: 600,
  children: [],
  ...over,
})

const BREAKDOWN: CategoryAmountNode[] = [
  nodo({ categoryId: 'c-casa', categoryName: 'Casa', amount: 600 }),
  nodo({ categoryId: 'c-cibo', categoryName: 'Alimentari', amount: 300, categoryColor: '#F6C9C0' }),
  nodo({ categoryId: 'c-sal', categoryName: 'Salute', amount: 100, categoryColor: '#C5E1C5' }),
]

beforeEach(() => {
  stubChartSize({ width: 340, height: 260 })
})

const monta = (breakdown = BREAKDOWN) =>
  render(<MobileCategoryChart breakdown={breakdown} currency={currency} />)

describe('MobileCategoryChart', () => {
  it('senza fette non rende nulla', () => {
    const { container } = monta([])

    expect(container).toBeEmptyDOMElement()
  })

  it('mostra il totale al centro e una pastiglia per fetta', () => {
    monta()

    expect(screen.getByText('Totale')).toBeInTheDocument()
    expect(screen.getByText('Casa')).toBeInTheDocument()
    expect(screen.getByText('Alimentari')).toBeInTheDocument()
    expect(screen.getByText('Salute')).toBeInTheDocument()
  })

  /**
   * Scegliendo una categoria il centro smette di mostrare il totale e mostra quella: è
   * l'unico modo, su uno schermo stretto, di leggere quanto pesa una singola voce senza
   * un'etichetta su ogni fetta.
   */
  it('scegliere una pastiglia mostra quella categoria al centro', async () => {
    const utente = userEvent.setup()
    monta()

    await utente.click(screen.getByText('Alimentari'))

    expect(screen.queryByText('Totale')).not.toBeInTheDocument()
    expect(screen.getByText('300,00 €')).toBeInTheDocument()
  })

  // Ri-cliccare la stessa pastiglia deseleziona: è il modo per tornare al totale
  // senza dover cercare un pulsante di chiusura.
  it('ri-cliccare la stessa pastiglia torna al totale', async () => {
    const utente = userEvent.setup()
    monta()

    // Scelta la categoria, il nome compare due volte: sulla pastiglia e al centro.
    // Si ri-clicca la pastiglia, che e' un pulsante.
    await utente.click(screen.getByText('Alimentari'))
    await utente.click(screen.getAllByRole('button', { name: /Alimentari/ })[0])

    expect(screen.getByText('Totale')).toBeInTheDocument()
  })

  it('con una categoria scelta si vedono le sue sottocategorie', async () => {
    const utente = userEvent.setup()
    monta([
      nodo({
        categoryId: 'c-casa',
        categoryName: 'Casa',
        amount: 600,
        children: [
          { categoryId: 'c-bol', categoryName: 'Bollette', categoryColor: '#A8C7E7', categoryIcon: null, amount: 400 },
          { categoryId: 'c-aff', categoryName: 'Affitto', categoryColor: '#A8C7E7', categoryIcon: null, amount: 200 },
        ],
      }),
      nodo({ categoryId: 'c-cibo', categoryName: 'Alimentari', amount: 300 }),
    ])

    await utente.click(screen.getByText('Casa'))

    expect(screen.getByText('Bollette')).toBeInTheDocument()
    expect(screen.getByText('Affitto')).toBeInTheDocument()
  })

  /**
   * Le categorie minori confluiscono in "Altro", che resta scegliibile: è così che si vede
   * cosa contiene, invece di perderle. La regola sta in utils/categorySlices; qui si verifica
   * che il componente la usi davvero e non elenchi tutto.
   */
  it('le categorie minori si raccolgono in "Altro", che resta apribile', async () => {
    const utente = userEvent.setup()
    monta([
      nodo({ categoryId: 'c-casa', categoryName: 'Casa', amount: 900 }),
      nodo({ categoryId: 'c-a', categoryName: 'Bollo', amount: 20 }),
      nodo({ categoryId: 'c-b', categoryName: 'Cartoleria', amount: 30 }),
    ])

    expect(screen.getByText('Altro')).toBeInTheDocument()
    expect(screen.queryByText('Bollo')).not.toBeInTheDocument()

    await utente.click(screen.getByText('Altro'))

    expect(screen.getByText('Bollo')).toBeInTheDocument()
    expect(screen.getByText('Cartoleria')).toBeInTheDocument()
  })
})
