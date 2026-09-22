import { describe, expect, it } from 'vitest'
import { buildPeriodSavings, computeBudget } from './savings'
import type { SavingsSettings } from '../context/AuthContext'
import type { Transaction, TransactionType } from '../api/types'

// Il calcolo del budget e del risparmio del periodo. È la funzione più delicata
// dell'app: da lei dipendono i due numeri grossi della Dashboard, ed è pura,
// quindi si può fissare per intero senza mock né DOM.

const CATEGORIA_STIPENDIO = 'cat-stipendio'
const CATEGORIA_REGALI = 'cat-regali'

const PERIODO = { start: '2026-08-27', end: '2026-09-26' }

function impostazioni(overrides: Partial<SavingsSettings> = {}): SavingsSettings {
  return {
    enabled: true,
    savingsPercent: 15,
    defaultSalaryAmount: 1800,
    salaryCategoryId: CATEGORIA_STIPENDIO,
    ...overrides,
  }
}

let contatore = 0
function transazione(
  amount: number,
  type: TransactionType,
  overrides: Partial<Transaction> = {},
): Transaction {
  contatore += 1
  return {
    id: `t-${contatore}`,
    categoryId: type === 'INCOME' ? CATEGORIA_STIPENDIO : 'cat-spesa',
    categoryName: 'Categoria',
    categoryIcon: null,
    categoryColor: null,
    amount,
    type,
    occurredOn: '2026-08-28',
    description: null,
    recurringTransactionId: null,
    ...overrides,
  }
}

const entrata = (amount: number, overrides: Partial<Transaction> = {}) =>
  transazione(amount, 'INCOME', overrides)
const uscita = (amount: number, overrides: Partial<Transaction> = {}) =>
  transazione(amount, 'EXPENSE', overrides)

describe('computeBudget — da dove arrivano le entrate', () => {
  it('con lo stipendio già incassato nella sua categoria, la stima esce di scena', () => {
    const budget = computeBudget([entrata(1800)], impostazioni(), PERIODO, '2026-08-29')

    expect(budget.income).toBe(1800)
  })

  it('le altre entrate si sommano allo stipendio incassato', () => {
    const budget = computeBudget(
      [entrata(1800), entrata(200, { categoryId: CATEGORIA_REGALI })],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.income).toBe(2000)
  })

  // Il bug corretto in 933b28c. Chi importa dalla banca si ritrova lo stipendio
  // nella categoria della banca ("Stipendi e pensioni") e non in quella del
  // profilo: la categoria non lo riconosceva e la stima veniva sommata a
  // un'entrata che era già lo stipendio. La card diceva 3863 € mentre le entrate
  // vere, tre righe più sotto nella stessa pagina, dicevano 1885,14 €.
  it('lo stipendio registrato in un altra categoria non viene contato due volte', () => {
    const budget = computeBudget(
      [entrata(1885.14, { categoryId: CATEGORIA_REGALI })],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.income).toBe(1885.14)
  })

  // L'altra metà della stessa regola: un rimborso arrivato prima della busta non
  // deve far sparire la stima, altrimenti il budget crollerebbe a inizio periodo.
  it('un entrata troppo piccola per essere lo stipendio si somma alla stima', () => {
    const budget = computeBudget(
      [entrata(200, { categoryId: CATEGORIA_REGALI })],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.income).toBe(2000)
  })

  // Il confine fra i due casi qui sopra: sotto il 60% della stima è un rimborso,
  // sopra è una busta più leggera del solito.
  it('la soglia fra rimborso e stipendio sta al 60% della stima', () => {
    const soglia = 1800 * 0.6

    const sopra = computeBudget(
      [entrata(soglia, { categoryId: CATEGORIA_REGALI })],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )
    expect(sopra.income).toBe(soglia)

    const sotto = computeBudget(
      [entrata(soglia - 0.01, { categoryId: CATEGORIA_REGALI })],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )
    expect(sotto.income).toBe(soglia - 0.01 + 1800)
  })

  // Due entrate medie che sommate superano la stima non sono uno stipendio: si
  // guarda la più grande e non il totale, perché lo stipendio è un accredito solo.
  it('due entrate medie non passano per uno stipendio solo perché sommate lo superano', () => {
    const budget = computeBudget(
      [
        entrata(900, { categoryId: CATEGORIA_REGALI }),
        entrata(1000, { categoryId: CATEGORIA_REGALI }),
      ],
      impostazioni(),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.income).toBe(1900 + 1800)
  })

  it('senza nessuna entrata si ragiona sulla sola stima', () => {
    const budget = computeBudget([], impostazioni(), PERIODO, '2026-08-29')

    expect(budget.income).toBe(1800)
  })

  it('senza stipendio configurato contano solo le entrate vere', () => {
    const budget = computeBudget(
      [entrata(500)],
      impostazioni({ defaultSalaryAmount: null, salaryCategoryId: null }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.income).toBe(500)
  })
})

describe('computeBudget — spese, obiettivo e residuo', () => {
  it('le spese generate da una regola ricorrente sono fisse, le altre discrezionali', () => {
    const budget = computeBudget(
      [entrata(1000), uscita(300, { recurringTransactionId: 'regola-1' }), uscita(100)],
      impostazioni({ savingsPercent: 0 }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.fixedExpenses).toBe(300)
    expect(budget.discretionarySpent).toBe(100)
    expect(budget.available).toBe(700)
    expect(budget.remaining).toBe(600)
  })

  it('l obiettivo è la percentuale configurata sulle entrate', () => {
    const budget = computeBudget([entrata(1000)], impostazioni({ savingsPercent: 15 }), PERIODO, '2026-08-29')

    expect(budget.savingsTarget).toBe(150)
    expect(budget.available).toBe(850)
  })

  it('senza percentuale configurata l obiettivo è zero', () => {
    const budget = computeBudget([entrata(1000)], impostazioni({ savingsPercent: null }), PERIODO, '2026-08-29')

    expect(budget.savingsTarget).toBe(0)
  })

  // Le due card della Dashboard non possono dire cose incompatibili: è
  // un'invarianza dichiarata nel commento della funzione, e qui diventa un
  // vincolo verificato su casi diversi fra loro.
  it.each([
    { nome: 'periodo vuoto', tx: [] as Transaction[] },
    { nome: 'solo entrate', tx: [entrata(1800)] },
    { nome: 'entrate e spese miste', tx: [entrata(1800), uscita(300, { recurringTransactionId: 'r' }), uscita(250)] },
    { nome: 'sforato', tx: [entrata(1000), uscita(2000)] },
  ])('risparmio e budget restano coerenti: $nome', ({ tx }) => {
    const budget = computeBudget(tx, impostazioni(), PERIODO, '2026-08-29')

    expect(budget.saved).toBeCloseTo(budget.savingsTarget + budget.remaining, 10)
  })
})

describe('computeBudget — stato del budget', () => {
  it('è "sforato" quando il residuo è negativo', () => {
    const budget = computeBudget(
      [entrata(1000), uscita(1200)],
      impostazioni({ savingsPercent: 0 }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.status).toBe('danger')
  })

  it('è "attenzione" quando resta meno del 20%', () => {
    const budget = computeBudget(
      [entrata(1000), uscita(850)],
      impostazioni({ savingsPercent: 0 }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.status).toBe('warning')
  })

  it('è "in linea" quando ne resta di più', () => {
    const budget = computeBudget(
      [entrata(1000), uscita(100)],
      impostazioni({ savingsPercent: 0 }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.status).toBe('neutral')
  })

  // Con zero budget da spendere non c'è nulla di "in linea" da dire: il caso è
  // richiamato apposta nel commento della funzione.
  it('senza budget disponibile segnala attenzione invece che "in linea"', () => {
    const budget = computeBudget(
      [entrata(1000), uscita(1000, { recurringTransactionId: 'regola-1' })],
      impostazioni({ savingsPercent: 0 }),
      PERIODO,
      '2026-08-29',
    )

    expect(budget.available).toBe(0)
    expect(budget.remaining).toBe(0)
    expect(budget.status).toBe('warning')
  })
})

describe('computeBudget — giorni che mancano', () => {
  it('il primo giorno del periodo mancano tutti gli altri', () => {
    const budget = computeBudget([], impostazioni(), PERIODO, PERIODO.start)

    // 27 agosto - 26 settembre sono 31 giorni, estremi inclusi.
    expect(budget.daysLeft).toBe(30)
  })

  it('l ultimo giorno non ne manca nessuno', () => {
    const budget = computeBudget([], impostazioni(), PERIODO, PERIODO.end)

    expect(budget.daysLeft).toBe(0)
  })

  it('oltre la fine del periodo resta zero e non diventa negativo', () => {
    const budget = computeBudget([], impostazioni(), PERIODO, '2026-10-15')

    expect(budget.daysLeft).toBe(0)
  })

  it('prima dell inizio del periodo mancano tutti i giorni', () => {
    const budget = computeBudget([], impostazioni(), PERIODO, '2026-08-01')

    expect(budget.daysLeft).toBe(31)
  })
})

describe('buildPeriodSavings', () => {
  const chiaveDelPeriodo = (data: string) => data.slice(0, 7)

  it('somma entrate e uscite di ogni periodo', () => {
    const periodi = buildPeriodSavings(
      [
        entrata(1000, { occurredOn: '2026-08-10' }),
        uscita(300, { occurredOn: '2026-08-20' }),
        entrata(1100, { occurredOn: '2026-09-10' }),
      ],
      chiaveDelPeriodo,
      ['2026-08', '2026-09'],
    )

    expect(periodi).toEqual([
      { periodKey: '2026-08', income: 1000, expenses: 300, saved: 700 },
      { periodKey: '2026-09', income: 1100, expenses: 0, saved: 1100 },
    ])
  })

  // I periodi senza movimenti devono restare nell'elenco, altrimenti il grafico
  // dell'andamento salterebbe i mesi vuoti e mentirebbe sulla forma della curva.
  it('un periodo senza movimenti resta nell elenco a zero', () => {
    const periodi = buildPeriodSavings([], chiaveDelPeriodo, ['2026-07', '2026-08'])

    expect(periodi).toHaveLength(2)
    expect(periodi.every((p) => p.saved === 0)).toBe(true)
  })

  it('le transazioni fuori dai periodi richiesti vengono ignorate', () => {
    const periodi = buildPeriodSavings(
      [entrata(999, { occurredOn: '2020-01-05' })],
      chiaveDelPeriodo,
      ['2026-08'],
    )

    expect(periodi).toEqual([{ periodKey: '2026-08', income: 0, expenses: 0, saved: 0 }])
  })

  it('l ordine dei periodi è quello richiesto', () => {
    const periodi = buildPeriodSavings([], chiaveDelPeriodo, ['2026-06', '2026-07', '2026-08'])

    expect(periodi.map((p) => p.periodKey)).toEqual(['2026-06', '2026-07', '2026-08'])
  })
})
