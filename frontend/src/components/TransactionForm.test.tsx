import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TransactionForm from './TransactionForm'
import type { Category, Transaction } from '../api/types'

// Il form delle transazioni. Nessun test di pagina apriva mai una modale, quindi
// fino a ieri questo file era importato ma mai reso: 0 funzioni eseguite su 20.
//
// Non serve MSW né contesti: tutta l'I/O passa da props. Quello che si prova è
// la logica che, sbagliata, salva il dato sbagliato senza dare errore.

const categoria = (over: Partial<Category> = {}): Category => ({
  id: 'c-1',
  name: 'Alimentari',
  type: 'EXPENSE',
  color: '#F6C9C0',
  icon: null,
  parentId: null,
  archived: false,
  ...over,
})

const CATEGORIE: Category[] = [
  categoria({ id: 'c-usc1', name: 'Alimentari', type: 'EXPENSE' }),
  categoria({ id: 'c-usc2', name: 'Casa', type: 'EXPENSE' }),
  categoria({ id: 'c-ent1', name: 'Stipendio', type: 'INCOME' }),
]

/**
 * La voce "Nuova categoria" sta nel piè di lista del combobox, non è un pulsante a sé:
 * va aperto il menu e scelta la voce, come fa chi usa l'app.
 */
async function apriCreazioneCategoria(utente: ReturnType<typeof userEvent.setup>) {
  await utente.click(document.getElementById('category')!)
  await utente.click(screen.getByText(/nuova categoria/i))
}

function monta(props: Partial<React.ComponentProps<typeof TransactionForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onCreateCategory = vi.fn()
  const onCancel = vi.fn()
  render(
    <TransactionForm
      categories={CATEGORIE}
      onSubmit={onSubmit}
      onCreateCategory={onCreateCategory}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCreateCategory, onCancel }
}

describe('valori di partenza', () => {
  it('in creazione parte dalla prima categoria di uscita e da oggi', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Importo'), '42.50')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const dati = onSubmit.mock.calls[0][0]
    expect(dati.categoryId).toBe('c-usc1')
    expect(dati.type).toBe('EXPENSE')
    expect(dati.occurredOn).toBe(new Date().toISOString().slice(0, 10))
  })

  it('in modifica riprende i valori della transazione', async () => {
    const iniziale: Transaction = {
      id: 't-1',
      categoryId: 'c-usc2',
      categoryName: 'Casa',
      categoryIcon: null,
      categoryColor: null,
      amount: 500,
      type: 'EXPENSE',
      occurredOn: '2026-03-02',
      description: 'Affitto',
      recurringTransactionId: null,
    }
    const utente = userEvent.setup()
    const { onSubmit } = monta({ initial: iniziale })

    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      categoryId: 'c-usc2',
      amount: 500,
      occurredOn: '2026-03-02',
      description: 'Affitto',
    })
  })
})

describe('il cambio di tipo', () => {
  /**
   * Cambiando da uscita a entrata la categoria scelta va ri-scelta: quella di prima è di un
   * altro tipo. Senza questo, si salverebbe una spesa dentro "Stipendio" — il backend la
   * rifiuterebbe, o peggio la accetterebbe e i totali smetterebbero di tornare.
   */
  it('ri-sceglie la prima categoria del nuovo tipo', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.click(screen.getByRole('button', { name: 'Entrata' }))
    await utente.type(screen.getByLabelText('Importo'), '1800')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryId: 'c-ent1', type: 'INCOME' })
  })

  // Se per il nuovo tipo non ci sono categorie, non se ne inventa una: il salvataggio
  // resta bloccato finché non se ne crea una.
  it('senza categorie del nuovo tipo il salvataggio resta bloccato', async () => {
    const utente = userEvent.setup()
    monta({ categories: [categoria({ id: 'c-usc1', type: 'EXPENSE' })] })

    await utente.click(screen.getByRole('button', { name: 'Entrata' }))

    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })
})

describe('le coercizioni al salvataggio', () => {
  it('l importo esce come numero, non come stringa', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Importo'), '42.50')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].amount).toBe(42.5)
  })

  // Una descrizione di soli spazi è come non averla: deve uscire null, non "  ",
  // altrimenti l'elenco mostrerebbe una riga con un titolo invisibile.
  it('una descrizione vuota o di soli spazi esce come null', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Importo'), '10')
    await utente.type(screen.getByLabelText('Descrizione (opzionale)'), '   ')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].description).toBeNull()
  })
})

describe('errori', () => {
  it('un salvataggio fallito lo dice e non lascia il form bloccato', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()
    onSubmit.mockRejectedValueOnce(new Error('boom'))

    await utente.type(screen.getByLabelText('Importo'), '10')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Salvataggio non riuscito')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeEnabled()
  })

  it('Annulla non salva niente', async () => {
    const utente = userEvent.setup()
    const { onSubmit, onCancel } = monta()

    await utente.click(screen.getByRole('button', { name: 'Annulla' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('la creazione di una categoria al volo', () => {
  /**
   * Creata la categoria, il form la <em>adotta</em>: chi l'ha appena creata la voleva usare
   * adesso. Senza, resterebbe selezionata quella di prima e la spesa finirebbe nella categoria
   * sbagliata — con l'utente convinto del contrario.
   */
  it('adotta la categoria appena creata', async () => {
    const utente = userEvent.setup()
    const { onSubmit, onCreateCategory } = monta()
    onCreateCategory.mockResolvedValue(categoria({ id: 'c-nuova', name: 'Farmacia' }))

    await apriCreazioneCategoria(utente)
    await utente.type(screen.getByLabelText('Nome nuova categoria'), 'Farmacia')
    await utente.click(screen.getByRole('button', { name: 'Crea categoria' }))

    await waitFor(() => expect(onCreateCategory).toHaveBeenCalled())
    // Il tipo passato è quello corrente del form, non un valore fisso.
    expect(onCreateCategory.mock.calls[0][0]).toMatchObject({ name: 'Farmacia', type: 'EXPENSE' })

    await utente.type(screen.getByLabelText('Importo'), '12')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].categoryId).toBe('c-nuova')
  })

  it('un nome già in uso lo dice e lascia riprovare', async () => {
    const utente = userEvent.setup()
    const { onCreateCategory } = monta()
    onCreateCategory.mockRejectedValue(new Error('409'))

    await apriCreazioneCategoria(utente)
    await utente.type(screen.getByLabelText('Nome nuova categoria'), 'Alimentari')
    await utente.click(screen.getByRole('button', { name: 'Crea categoria' }))

    expect(await screen.findByText(/nome non sia già in uso/)).toBeInTheDocument()
  })

  // Mentre si crea una categoria il salvataggio della transazione è bloccato: sono due
  // form annidati, e salvare la transazione a metà creazione perderebbe la categoria.
  it('durante la creazione il salvataggio della transazione è bloccato', async () => {
    const utente = userEvent.setup()
    monta()

    await apriCreazioneCategoria(utente)

    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })
})
