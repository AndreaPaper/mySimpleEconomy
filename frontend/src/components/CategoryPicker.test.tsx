import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CategoryPicker from './CategoryPicker'
import type { Category, CategorySuggestion } from '../api/types'

// Le categorie che l'import propone di creare non esistono ancora e non hanno un
// id: viaggiano con un tempId e stanno nello stesso menu di quelle vere. Il
// prefisso "new:" è l'unica cosa che tiene distinte le due famiglie dentro un
// valore solo — e sbagliarlo non da' errore, assegna la spesa alla categoria
// sbagliata.

const esistenti: Category[] = [
  { id: 'cat-casa', name: 'Casa', type: 'EXPENSE', color: '#A8C7E7', icon: null, parentId: null } as Category,
  { id: 'cat-salute', name: 'Salute', type: 'EXPENSE', color: '#C5E1C5', icon: null, parentId: null } as Category,
]

const proposte: CategorySuggestion[] = [
  { tempId: 'tmp-1', name: 'Psicologa', type: 'EXPENSE', color: '#D9C7E8' },
]

// Il bottone che apre il menu non ha ruolo combobox: quello sta sull'input di
// ricerca dentro il pannello, perche' e' li' che si scrive. Il grilletto si
// trova quindi dal suo aria-haspopup.
const grilletto = () => document.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement

const rendi = (props: Partial<React.ComponentProps<typeof CategoryPicker>> = {}) => {
  const onChange = vi.fn()
  const onRequestNewCategory = vi.fn()
  render(
    <CategoryPicker
      existingCategories={esistenti}
      newCategorySuggestions={proposte}
      existingCategoryId={null}
      newCategoryTempId={null}
      onChange={onChange}
      onRequestNewCategory={onRequestNewCategory}
      {...props}
    />,
  )
  return { onChange, onRequestNewCategory }
}

describe('CategoryPicker', () => {
  it('mostra insieme le categorie esistenti e quelle proposte', async () => {
    rendi()

    await userEvent.click(grilletto())

    expect(screen.getByText('Casa')).toBeInTheDocument()
    expect(screen.getByText('Psicologa')).toBeInTheDocument()
    // Le proposte sono marcate, così si vede che verranno create.
    expect(screen.getByText('nuova')).toBeInTheDocument()
  })

  it('scegliendo una categoria esistente passa il suo id', async () => {
    const { onChange } = rendi()

    await userEvent.click(grilletto())
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))

    expect(onChange).toHaveBeenCalledWith({ existingCategoryId: 'cat-salute', newCategoryTempId: null })
  })

  /**
   * Il caso che il prefisso esiste per gestire: scegliendo una proposta, il
   * tempId va nel campo delle nuove e l'id di quelle esistenti resta vuoto.
   * Confondere i due campi manderebbe al backend un id che non esiste.
   */
  it('scegliendo una proposta passa il tempId, non un id', async () => {
    const { onChange } = rendi()

    await userEvent.click(grilletto())
    await userEvent.click(screen.getByRole('option', { name: /Psicologa/ }))

    expect(onChange).toHaveBeenCalledWith({ existingCategoryId: null, newCategoryTempId: 'tmp-1' })
  })

  // E il verso della lettura: una selezione su una proposta deve ricomparire
  // scelta, non vuota. È lo stesso prefisso, applicato al contrario.
  it('rilegge una proposta già scelta', () => {
    rendi({ newCategoryTempId: 'tmp-1' })

    expect(grilletto()).toHaveTextContent('Psicologa')
  })

  it('rilegge una categoria esistente già scelta', () => {
    rendi({ existingCategoryId: 'cat-casa' })

    expect(grilletto()).toHaveTextContent('Casa')
  })

  it('la voce per creare una categoria nuova avvisa chi sta sopra', async () => {
    const { onRequestNewCategory } = rendi()

    await userEvent.click(grilletto())
    await userEvent.click(screen.getByText('Nuova categoria'))

    expect(onRequestNewCategory).toHaveBeenCalledTimes(1)
  })
})
