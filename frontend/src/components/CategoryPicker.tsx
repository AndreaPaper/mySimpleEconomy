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

  return (
    <div className="w-56 shrink-0">
      <CategoryCombobox
        categories={existingCategories}
        value={value}
        onChange={handleChange}
        onCreateNew={onRequestNewCategory}
        placeholder="Seleziona categoria..."
        extraOptions={newCategorySuggestions.map((c) => ({
          value: `${NEW_PREFIX}${c.tempId}`,
          label: c.name,
          color: c.color,
          hint: 'nuova',
        }))}
      />
    </div>
  )
}
