import type { CategoryAmount, CategoryAmountNode } from '../api/types'

// La suddivisione in fette del grafico a ciambella su mobile, estratta da
// MobileCategoryChart. Sta qui perché non ha nulla a che vedere con il disegno:
// decide quali categorie restano distinte e quali confluiscono in "Altro".
//
// Tenendola separata i suoi casi si provano senza montare Recharts, che nei
// test misura sempre zero pixel e non disegnerebbe comunque nessuna fetta.

// Sotto questa quota una fetta è troppo sottile perché il donut resti leggibile:
// le minori confluiscono in "Altro", che resta selezionabile per vedere cosa
// contiene invece di sparire.
export const MINOR_SHARE = 0.05

export const OTHER_ID = '__altro__'
export const OTHER_COLOR = '#94a3b8'

export interface Slice {
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string | null
  amount: number
  children: CategoryAmount[]
}

const sliceOf = (c: CategoryAmountNode): Slice => ({
  categoryId: c.categoryId,
  categoryName: c.categoryName,
  categoryColor: c.categoryColor ?? OTHER_COLOR,
  categoryIcon: c.categoryIcon,
  amount: c.amount,
  children: c.children,
})

export function buildCategorySlices(breakdown: CategoryAmountNode[]): { slices: Slice[]; total: number } {
  const sum = breakdown.reduce((acc, c) => acc + c.amount, 0)
  const major: Slice[] = []
  const minor: CategoryAmountNode[] = []

  for (const c of breakdown) {
    if (sum > 0 && c.amount / sum < MINOR_SHARE) minor.push(c)
    else major.push(sliceOf(c))
  }

  // Una sola categoria minore non guadagna niente a chiamarsi "Altro": si
  // perderebbe il suo nome per raggrupparla con nessun altro.
  if (minor.length === 1) {
    major.push(sliceOf(minor[0]))
  } else if (minor.length > 1) {
    major.push({
      categoryId: OTHER_ID,
      categoryName: 'Altro',
      categoryColor: OTHER_COLOR,
      categoryIcon: null,
      amount: minor.reduce((acc, c) => acc + c.amount, 0),
      children: minor,
    })
  }

  return { slices: major, total: sum }
}
