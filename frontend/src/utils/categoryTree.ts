import type { Category, SpendingBucket } from '../api/types'

export interface FlatCategoryEntry {
  category: Category
  depth: 0 | 1
}

// Ordina le categorie ad albero: ogni categoria principale in ordine
// alfabetico, seguita subito dalle proprie sottocategorie (anch'esse in
// ordine alfabetico). La gerarchia è a un solo livello, quindi `depth` vale
// 0 o 1 e non serve ricorsione.
//
// Una sottocategoria il cui padre non è nell'elenco passato (es. padre
// archiviato, che `categoriesApi.list()` non restituisce) viene trattata
// come principale, così non sparisce mai dai menu di scelta.
export function flattenCategoryTree(categories: Category[]): FlatCategoryEntry[] {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'it')
  const ids = new Set(categories.map((c) => c.id))

  const childrenByParent = new Map<string, Category[]>()
  const roots: Category[] = []

  for (const category of categories) {
    if (category.parentId && ids.has(category.parentId)) {
      const siblings = childrenByParent.get(category.parentId)
      if (siblings) {
        siblings.push(category)
      } else {
        childrenByParent.set(category.parentId, [category])
      }
    } else {
      roots.push(category)
    }
  }

  const entries: FlatCategoryEntry[] = []
  for (const root of roots.sort(byName)) {
    entries.push({ category: root, depth: 0 })
    for (const child of (childrenByParent.get(root.id) ?? []).sort(byName)) {
      entries.push({ category: child, depth: 1 })
    }
  }

  return entries
}

// Classificazione effettiva di una categoria per la modalità risparmio:
// una sottocategoria senza bucket proprio eredita quello del padre, mentre
// una categoria principale senza bucket resta non classificata (null).
// Unica implementazione della regola, condivisa da Dashboard, CategoryForm
// e CategoriesPage.
export function effectiveBucket(category: Category, categories: Category[]): SpendingBucket | null {
  if (category.spendingBucket) return category.spendingBucket
  if (!category.parentId) return null
  return categories.find((c) => c.id === category.parentId)?.spendingBucket ?? null
}

// Etichetta per i menu a tendina: le sottocategorie sono rientrate con un
// connettore, dato che <optgroup> non è utilizzabile (le sue intestazioni non
// sono selezionabili, mentre qui anche le categorie padre restano scegliibili).
export function categoryOptionLabel({ category, depth }: FlatCategoryEntry): string {
  return depth === 1 ? `    └ ${category.name}` : category.name
}
