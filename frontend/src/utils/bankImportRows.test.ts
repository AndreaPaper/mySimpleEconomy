import { describe, expect, it } from 'vitest'
import {
  activeExclusions,
  applyDecisions,
  isMappingResolved,
  isSelected,
  rowsOfMapping,
  selectedByDefault,
  toggleSection,
} from './bankImportRows'
import type {
  BankCategoryMappingDto,
  BankImportExclusionDto,
  BankImportOutcome,
  BankImportRowPreview,
} from '../api/types'

// La derivazione delle righe dell'import bancario. Ha tre regole di precedenza
// che si sovrappongono e una selezione memorizzata al contrario: è il punto
// dell'app dove un errore fa entrare in archivio una spesa sbagliata, o non la
// fa entrare affatto, senza dirlo.

function riga(
  rowNumber: number,
  overrides: Partial<BankImportRowPreview> = {},
): BankImportRowPreview {
  return {
    rowNumber,
    occurredOn: '2026-08-26',
    description: 'Bonifico',
    rawOperation: 'Bonifico',
    rawDetails: 'PAGAMENTO SEDUTA',
    bankCategory: 'Bonifici in uscita',
    amount: 70,
    type: 'EXPENSE',
    provisional: false,
    outcome: 'NUOVA' as BankImportOutcome,
    categoryId: null,
    matchedTransactionId: null,
    conflictDescription: null,
    selectedByDefault: true,
    ...overrides,
  }
}

function mappatura(overrides: Partial<BankCategoryMappingDto> = {}): BankCategoryMappingDto {
  return {
    bankCategory: 'Bonifici in uscita',
    transactionType: 'EXPENSE',
    categoryId: null,
    doNotImport: false,
    rowCount: 1,
    sampleDescription: null,
    ...overrides,
  }
}

const esclusione = (pattern: string): BankImportExclusionDto => ({ pattern, note: null })

describe('activeExclusions', () => {
  it('unisce le regole salvate a quelle proposte e accettate', () => {
    const attive = activeExclusions(
      [esclusione('GIROCONTO')],
      [esclusione('Prelievo'), esclusione('a favore di Mario')],
      new Set(['Prelievo']),
    )

    expect(attive.map((e) => e.pattern)).toEqual(['GIROCONTO', 'Prelievo'])
  })

  it('una proposta non accettata resta fuori', () => {
    expect(activeExclusions([], [esclusione('Prelievo')], new Set())).toEqual([])
  })
})

describe('applyDecisions — da dove arriva la categoria', () => {
  it('senza scelte la riga resta com era', () => {
    const [risultato] = applyDecisions([riga(1)], [], [], new Map())

    expect(risultato.categoryId).toBeNull()
    expect(risultato.outcome).toBe('NUOVA')
  })

  it('la mappatura della categoria della banca vale per tutte le sue righe', () => {
    const [risultato] = applyDecisions(
      [riga(1)],
      [mappatura({ categoryId: 'cat-casa' })],
      [],
      new Map(),
    )

    expect(risultato.categoryId).toBe('cat-casa')
  })

  // Il motivo per cui la scelta per riga esiste: "Bonifici in uscita" tiene
  // insieme la psicologa e i soldi di un regalo.
  it('la scelta sulla singola riga scavalca quella della mappatura', () => {
    const [risultato] = applyDecisions(
      [riga(1)],
      [mappatura({ categoryId: 'cat-casa' })],
      [],
      new Map([[1, 'cat-salute']]),
    )

    expect(risultato.categoryId).toBe('cat-salute')
  })

  it('una riga già importata non viene toccata', () => {
    const originale = riga(1, { outcome: 'GIA_IMPORTATA' })

    const [risultato] = applyDecisions(
      [originale],
      [mappatura({ categoryId: 'cat-casa' })],
      [],
      new Map([[1, 'cat-salute']]),
    )

    expect(risultato).toBe(originale)
  })
})

describe('applyDecisions — le tre regole di precedenza', () => {
  it('la mappatura "non importare" esclude la riga', () => {
    const [risultato] = applyDecisions([riga(1)], [mappatura({ doNotImport: true })], [], new Map())

    expect(risultato.outcome).toBe('ESCLUSA')
  })

  it('un esclusione per testo esclude la riga', () => {
    const [risultato] = applyDecisions([riga(1)], [], [esclusione('SEDUTA')], new Map())

    expect(risultato.outcome).toBe('ESCLUSA')
  })

  it('l esclusione per testo ignora maiuscole e minuscole', () => {
    const [risultato] = applyDecisions([riga(1)], [], [esclusione('seduta')], new Map())

    expect(risultato.outcome).toBe('ESCLUSA')
  })

  // Prima regola: una scelta sulla singola riga è più specifica del "non
  // importare" della sua categoria, ed è l'unico modo per tirare fuori una spesa
  // vera da un gruppo scartato in blocco.
  it('la scelta per riga scavalca il "non importare" della mappatura', () => {
    const [risultato] = applyDecisions(
      [riga(1)],
      [mappatura({ doNotImport: true })],
      [],
      new Map([[1, 'cat-salute']]),
    )

    expect(risultato.outcome).toBe('NUOVA')
    expect(risultato.categoryId).toBe('cat-salute')
  })

  // Seconda regola, ed è il verso opposto: le esclusioni per testo si decidono
  // *dopo* la mappatura e hanno una loro casella per riga, quindi restano valide.
  it('la scelta per riga NON scavalca un esclusione per testo', () => {
    const [risultato] = applyDecisions(
      [riga(1)],
      [],
      [esclusione('SEDUTA')],
      new Map([[1, 'cat-salute']]),
    )

    expect(risultato.outcome).toBe('ESCLUSA')
  })

  // Terza: anche una riga esclusa porta con sé la categoria, così includerla
  // dall'anteprima non obbliga a tornare alla mappatura.
  it('anche una riga esclusa conserva la categoria assegnata', () => {
    const [risultato] = applyDecisions(
      [riga(1)],
      [mappatura({ categoryId: 'cat-casa' })],
      [esclusione('SEDUTA')],
      new Map(),
    )

    expect(risultato.outcome).toBe('ESCLUSA')
    expect(risultato.categoryId).toBe('cat-casa')
  })
})

describe('selezione', () => {
  it('entrano di default le righe nuove e quelle da aggiornare', () => {
    expect(selectedByDefault(riga(1, { outcome: 'NUOVA' }))).toBe(true)
    expect(selectedByDefault(riga(2, { outcome: 'AGGIORNA_PROVVISORIA' }))).toBe(true)
  })

  it('quello che va deciso o è escluso parte spento', () => {
    expect(selectedByDefault(riga(1, { outcome: 'SOSPETTO_MANUALE' }))).toBe(false)
    expect(selectedByDefault(riga(2, { outcome: 'SOSPETTO_RICORRENTE' }))).toBe(false)
    expect(selectedByDefault(riga(3, { outcome: 'ESCLUSA' }))).toBe(false)
  })

  // La selezione è memorizzata come scostamenti dalla proposta, non come elenco
  // degli spuntati: così cambiare una mappatura aggiorna da sé cosa entra senza
  // cancellare le scelte fatte a mano. Da cui questo XOR, facile da invertire
  // per sbaglio.
  it('lo scostamento inverte la proposta', () => {
    const nuova = riga(1, { outcome: 'NUOVA' })
    const esclusa = riga(2, { outcome: 'ESCLUSA' })

    expect(isSelected(nuova, new Set())).toBe(true)
    expect(isSelected(nuova, new Set([1]))).toBe(false)
    expect(isSelected(esclusa, new Set())).toBe(false)
    expect(isSelected(esclusa, new Set([2]))).toBe(true)
  })
})

describe('toggleSection', () => {
  const nuove = [riga(1, { outcome: 'NUOVA' }), riga(2, { outcome: 'NUOVA' })]

  it('spegnere una sezione che era accesa registra gli scostamenti', () => {
    const dopo = toggleSection(new Set(), nuove, false)

    expect([...dopo].sort()).toEqual([1, 2])
    expect(nuove.every((r) => !isSelected(r, dopo))).toBe(true)
  })

  // Il punto delicato: riportare una sezione allo stato proposto deve *togliere*
  // gli scostamenti, non aggiungerne. Altrimenti la riga smetterebbe di seguire
  // le proposte future.
  it('riaccendere una sezione toglie gli scostamenti invece di accumularli', () => {
    const dopo = toggleSection(toggleSection(new Set(), nuove, false), nuove, true)

    expect(dopo.size).toBe(0)
  })

  it('non tocca le righe fuori dalla sezione', () => {
    const dopo = toggleSection(new Set([99]), nuove, false)

    expect(dopo.has(99)).toBe(true)
  })
})

describe('completezza della mappatura', () => {
  const righe = [riga(1), riga(2), riga(3, { outcome: 'GIA_IMPORTATA' })]

  it('conta solo i movimenti che possono ancora entrare', () => {
    expect(rowsOfMapping(righe, mappatura()).map((r) => r.rowNumber)).toEqual([1, 2])
  })

  it('una categoria della banca senza scelta non è a posto', () => {
    expect(isMappingResolved(mappatura(), righe, new Map())).toBe(false)
  })

  it('con la categoria scelta è a posto', () => {
    expect(isMappingResolved(mappatura({ categoryId: 'cat-casa' }), righe, new Map())).toBe(true)
  })

  it('anche "non importare" è una scelta', () => {
    expect(isMappingResolved(mappatura({ doNotImport: true }), righe, new Map())).toBe(true)
  })

  // Chi decide riga per riga non deve essere costretto a scegliere anche una
  // categoria "padre" che non gli serve.
  it('è a posto anche se ogni riga ha una scelta propria', () => {
    const perRiga = new Map([
      [1, 'cat-salute'],
      [2, 'cat-regali'],
    ])

    expect(isMappingResolved(mappatura(), righe, perRiga)).toBe(true)
  })

  it('non basta averne decise solo alcune', () => {
    expect(isMappingResolved(mappatura(), righe, new Map([[1, 'cat-salute']]))).toBe(false)
  })
})
