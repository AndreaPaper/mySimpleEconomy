import type { Category, CategorySuggestion } from '../api/types'

const NEW_CATEGORY_VALUE = '__new__'

interface CategoryPickerProps {
  existingCategories: Category[]
  newCategorySuggestions: CategorySuggestion[]
  existingCategoryId: string | null
  newCategoryTempId: string | null
  onChange: (value: { existingCategoryId: string | null; newCategoryTempId: string | null }) => void
  onRequestNewCategory: () => void
}

function encode(existingCategoryId: string | null, newCategoryTempId: string | null): string {
  if (existingCategoryId) return `existing:${existingCategoryId}`
  if (newCategoryTempId) return `new:${newCategoryTempId}`
  return ''
}

export default function CategoryPicker({
  existingCategories,
  newCategorySuggestions,
  existingCategoryId,
  newCategoryTempId,
  onChange,
  onRequestNewCategory,
}: CategoryPickerProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === NEW_CATEGORY_VALUE) {
      onRequestNewCategory()
      return
    }
    if (value.startsWith('existing:')) {
      onChange({ existingCategoryId: value.slice('existing:'.length), newCategoryTempId: null })
    } else if (value.startsWith('new:')) {
      onChange({ existingCategoryId: null, newCategoryTempId: value.slice('new:'.length) })
    } else {
      onChange({ existingCategoryId: null, newCategoryTempId: null })
    }
  }

  return (
    <select
      value={encode(existingCategoryId, newCategoryTempId)}
      onChange={handleChange}
      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-2 py-1 text-sm text-slate-900 dark:text-white"
    >
      <option value="">Seleziona categoria...</option>
      {existingCategories.length > 0 && (
        <optgroup label="Categorie esistenti">
          {existingCategories.map((c) => (
            <option key={c.id} value={`existing:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {newCategorySuggestions.length > 0 && (
        <optgroup label="Nuove categorie (da questa importazione)">
          {newCategorySuggestions.map((c) => (
            <option key={c.tempId} value={`new:${c.tempId}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      <option value={NEW_CATEGORY_VALUE}>+ Nuova categoria...</option>
    </select>
  )
}
