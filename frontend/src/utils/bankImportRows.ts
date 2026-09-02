import type {
  BankCategoryMappingDto,
  BankImportExclusionDto,
  BankImportOutcome,
  BankImportRowPreview,
} from '../api/types'

// La derivazione delle righe dell'anteprima dell'import bancario: da quello che
// il backend ha analizzato, più le scelte fatte nella schermata di mappatura, a
// cosa entra davvero e con quale categoria.
//
// Sta qui e non dentro il componente perché è la logica più intricata dell'app —
// tre regole di precedenza che si sovrappongono e una selezione memorizzata al
// contrario — e attraverso il DOM sarebbe lenta da provare e fragile da leggere.

// Le esclusioni in vigore: quelle già salvate più le proposte accettate.
export function activeExclusions(
  saved: BankImportExclusionDto[],
  suggested: BankImportExclusionDto[],
  accepted: Set<string>,
): BankImportExclusionDto[] {
  return [...saved, ...suggested.filter((e) => accepted.has(e.pattern))]
}

// Le righe con mappature, esclusioni e scelte per riga applicate. Si ricalcola
// qui invece di rianalizzare il file: è già stato letto e il risultato non
// cambierebbe.
export function applyDecisions(
  rows: BankImportRowPreview[],
  mappings: BankCategoryMappingDto[],
  exclusions: BankImportExclusionDto[],
  rowCategories: Map<number, string>,
): BankImportRowPreview[] {
  return rows.map((row) => {
    const mapping = mappings.find(
      (m) => m.bankCategory === row.bankCategory && m.transactionType === row.type,
    )
    const text = `${row.rawOperation ?? ''} ${row.rawDetails ?? ''}`.toUpperCase()
    const excludedByRule = exclusions.some((e) => text.includes(e.pattern.toUpperCase()))

    if (row.outcome === 'GIA_IMPORTATA') return row

    // La categoria si assegna anche alle righe escluse: se si decide di
    // includerne una, deve poter entrare senza tornare alla mappatura.
    const override = rowCategories.get(row.rowNumber)
    const withCategory = { ...row, categoryId: override ?? mapping?.categoryId ?? row.categoryId }

    // Una scelta fatta sulla singola riga scavalca il "non importare" della sua
    // categoria della banca: è più specifica, ed è l'unico modo per far entrare
    // una spesa vera da un gruppo scartato in blocco. Le esclusioni per testo
    // restano invece valide, perché si decidono dopo la mappatura e hanno una
    // loro casella per riga nell'anteprima.
    if (override && !excludedByRule) return withCategory
    return mapping?.doNotImport || excludedByRule
      ? { ...withCategory, outcome: 'ESCLUSA' as BankImportOutcome }
      : withCategory
  })
}

// Entrano di default solo le righe nuove e quelle da aggiornare: quello che va
// deciso, o è stato escluso, parte spento.
export function selectedByDefault(row: BankImportRowPreview): boolean {
  return row.outcome === 'NUOVA' || row.outcome === 'AGGIORNA_PROVVISORIA'
}

// La selezione è memorizzata come scostamenti dalla proposta e non come elenco
// degli spuntati: così accettare un'esclusione o cambiare una mappatura aggiorna
// da sé cosa entra, senza cancellare le scelte fatte a mano. Da cui questo XOR.
export function isSelected(row: BankImportRowPreview, flipped: Set<number>): boolean {
  return selectedByDefault(row) !== flipped.has(row.rowNumber)
}

// Lo scostamento serve solo quando lo stato voluto differisce dalla proposta:
// altrimenti si toglie, e la riga torna a seguirla.
export function toggleSection(
  flipped: Set<number>,
  sectionRows: BankImportRowPreview[],
  on: boolean,
): Set<number> {
  const next = new Set(flipped)
  for (const row of sectionRows) {
    if (selectedByDefault(row) === on) next.delete(row.rowNumber)
    else next.add(row.rowNumber)
  }
  return next
}

// I movimenti che ricadono sotto una categoria della banca ancora da mappare.
// Stesso filtro che il backend usa per contarli (rowCount), così l'elenco che si
// apre e il numero scritto accanto dicono la stessa cosa.
export function rowsOfMapping(
  rows: BankImportRowPreview[],
  mapping: BankCategoryMappingDto,
): BankImportRowPreview[] {
  return rows.filter(
    (r) =>
      r.bankCategory === mapping.bankCategory &&
      r.type === mapping.transactionType &&
      r.outcome !== 'GIA_IMPORTATA' &&
      r.outcome !== 'ESCLUSA',
  )
}

// Una categoria della banca è a posto se ha una scelta valida per tutte le sue
// righe: quella "padre", oppure una riga per riga.
export function isMappingResolved(
  mapping: BankCategoryMappingDto,
  rows: BankImportRowPreview[],
  rowCategories: Map<number, string>,
): boolean {
  return (
    mapping.doNotImport ||
    !!mapping.categoryId ||
    rowsOfMapping(rows, mapping).every((r) => rowCategories.has(r.rowNumber))
  )
}
