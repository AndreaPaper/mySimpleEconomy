import type { Category, CategoryAmount, CategoryAmountNode, Transaction } from '../api/types'


// Aggrega le transazioni di spesa di un mese per categoria, per i mesi passati
// dove non abbiamo un forecast.categoryBreakdown già pronto dal backend.
//
// Le sottocategorie confluiscono nella riga del padre: `amount` della riga
// padre è il totale complessivo (sue spese dirette + tutti i figli), mentre
// `children` contiene il dettaglio da mostrare quando la riga viene espansa.
// Le spese registrate direttamente sul padre restano nel totale ma non
// generano una riga figlia. Se il padre non è tra le categorie note (es.
// archiviato, che `categoriesApi.list()` non restituisce) la riga resta al
// livello principale, cioè il comportamento precedente a questa feature.
export function buildCategoryBreakdown(transactions: Transaction[], categories: Category[]): CategoryAmountNode[] {
  const byCategory = new Map<string, CategoryAmount>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE') continue
    const existing = byCategory.get(t.categoryId)
    if (existing) {
      byCategory.set(t.categoryId, { ...existing, amount: existing.amount + t.amount })
    } else {
      byCategory.set(t.categoryId, {
        categoryId: t.categoryId,
        categoryName: t.categoryName,
        categoryIcon: t.categoryIcon,
        categoryColor: t.categoryColor,
        type: 'EXPENSE',
        amount: t.amount,
      })
    }
  }

  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]))
  const knownIds = new Set(categories.map((c) => c.id))
  const roots = new Map<string, CategoryAmountNode>()

  const rootFor = (row: CategoryAmount): CategoryAmountNode => {
    const existing = roots.get(row.categoryId)
    if (existing) return existing
    const created: CategoryAmountNode = { ...row, amount: 0, children: [] }
    roots.set(row.categoryId, created)
    return created
  }

  for (const row of byCategory.values()) {
    const parentId = parentOf.get(row.categoryId)
    if (parentId && knownIds.has(parentId)) {
      const parentCategory = categories.find((c) => c.id === parentId)!
      const parentRow = rootFor({
        categoryId: parentCategory.id,
        categoryName: parentCategory.name,
        categoryIcon: parentCategory.icon,
        categoryColor: parentCategory.color,
        type: 'EXPENSE',
        amount: 0,
      })
      parentRow.amount += row.amount
      parentRow.children.push(row)
    } else {
      rootFor(row).amount += row.amount
    }
  }

  const byAmountDesc = (a: CategoryAmount, b: CategoryAmount) => b.amount - a.amount
  return Array.from(roots.values())
    .map((node) => ({ ...node, children: node.children.sort(byAmountDesc) }))
    .sort(byAmountDesc)
}
