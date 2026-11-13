import type { Category, CategorySuggestion } from '../api/types'
import CategoryCombobox from './CategoryCombobox'

// Le categorie che l'import propone di creare non esistono ancora, quindi non
// hanno un id: viaggiano con un tempId, e nel menu stanno accanto a quelle
// vere. Il prefisso tiene distinte le due famiglie in un unico valore.
const NEW_PREFIX = 'new:'

interface CategoryPickerProps {
  existingCategories: Category[]
  newCategorySuggestions: CategorySuggestion[]
  existingCategoryId: string | null
  newCategoryTempId: string | null
  onChange: (value: { existingCategoryId: string | null; newCategoryTempId: string | null }) => void
  onRequestNewCategory: () => void
}

export default function CategoryPicker({
  existingCategories,
  newCategorySuggestions,
  existingCategoryId,
  newCategoryTempId,
  onChange,
  onRequestNewCategory,
}: CategoryPickerProps) {
  const value = existingCategoryId ?? (newCategoryTempId ? `${NEW_PREFIX}${newCategoryTempId}` : '')

  const handleChange = (next: string) => {
    if (next.startsWith(NEW_PREFIX)) {
      onChange({ existingCategoryId: null, newCategoryTempId: next.slice(NEW_PREFIX.length) })
      return
    }
    onChange({ existingCategoryId: next || null, newCategoryTempId: null })
  }

  // Le righe del diario sono spese: proporre Stipendio o Regali trasformerebbe la spesa
  // in un'entrata, perché alla conferma il tipo viene dalla categoria. Resta visibile
  // solo la categoria già scelta, anche se di entrata: è lo stipendio, che l'analisi
  // risolve da sé.
  const expenseCategories = existingCategories.filter((c) => c.type === 'EXPENSE' || c.id === existingCategoryId)
  const expenseSuggestions = newCategorySuggestions.filter((c) => c.type === 'EXPENSE' || c.tempId === newCategoryTempId)

  return (
    <div className="w-56 shrink-0">
      <CategoryCombobox
        categories={expenseCategories}
        value={value}
        onChange={handleChange}
        onCreateNew={onRequestNewCategory}
        placeholder="Seleziona categoria..."
        extraOptions={expenseSuggestions.map((c) => ({
          value: `${NEW_PREFIX}${c.tempId}`,
          label: c.name,
          color: c.color,
          hint: 'nuova',
        }))}
      />
    </div>
  )
}
