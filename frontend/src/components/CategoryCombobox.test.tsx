import { describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryCombobox from './CategoryCombobox'
import type { Category } from '../api/types'

// Il selettore di categoria, usato in tutti e nove i menu dell'app. Quasi tutto
// quello che fa è invisibile finché non si rompe: il filtro che guarda anche il
// nome del padre, le frecce, l'Invio che non deve inviare il form, e soprattutto
// l'Esc che deve chiudere il menu senza chiudere la modale che lo contiene.

function categoria(id: string, name: string, parentId: string | null = null): Category {
  return { id, name, type: 'EXPENSE', color: '#A6CFEA', icon: null, parentId, archived: false }
}

const CATEGORIE = [
  categoria('alimentari', 'Alimentari'),
  categoria('supermercato', 'Supermercato', 'alimentari'),
  categoria('bar', 'Bar e caffè', 'alimentari'),
  categoria('casa', 'Casa'),
  categoria('trasporti', 'Trasporti'),
]

function renderCombobox(props: Partial<Parameters<typeof CategoryCombobox>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <CategoryCombobox
      id="categoria"
      categories={CATEGORIE}
      value=""
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange }
}

// Per id e non per nome accessibile: il nome del selettore è la categoria
// scelta, quindi cambia da un test all'altro.
const trigger = () => document.getElementById('categoria') as HTMLButtonElement
const apri = async (utente: ReturnType<typeof userEvent.setup>) => {
  await utente.click(trigger())
}
const voci = () => screen.queryAllByRole('option').map((o) => o.textContent?.trim())

describe('apertura e scelta', () => {
  it('il menu è chiuso finché non si tocca il selettore', () => {
    renderCombobox()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('aperto elenca le categorie ad albero', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(voci()).toEqual(['Alimentari', 'Bar e caffè', 'Supermercato', 'Casa', 'Trasporti'])
  })

  it('scegliere una voce la comunica e chiude il menu', async () => {
    const utente = userEvent.setup()
    const { onChange } = renderCombobox()

    await apri(utente)
    await utente.click(screen.getByRole('option', { name: 'Casa' }))

    expect(onChange).toHaveBeenCalledWith('casa')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('la categoria scelta compare sul selettore', () => {
    renderCombobox({ value: 'casa' })

    expect(trigger()).toHaveTextContent('Casa')
  })

  it('le voci extra stanno in cima, sopra le categorie', async () => {
    const utente = userEvent.setup()
    renderCombobox({ extraOptions: [{ value: '', label: 'Tutte le categorie' }] })

    await apri(utente)

    expect(voci()[0]).toBe('Tutte le categorie')
  })
})

describe('filtro', () => {
  it('cercando si restringe l elenco', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)
    await utente.type(screen.getByRole('combobox'), 'tras')

    expect(voci()).toEqual(['Trasporti'])
  })

  // Il caso per cui il filtro guarda anche il padre: cercando "alimentari" ci si
  // aspetta di trovare anche quello che ci sta dentro, non solo la riga del
  // padre.
  it('cercando il nome di una principale compaiono anche le sue sottocategorie', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)
    await utente.type(screen.getByRole('combobox'), 'aliment')

    expect(voci()).toEqual(['Alimentari', 'Bar e caffè', 'Supermercato'])
  })

  it('senza risultati lo dice invece di restare vuoto', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)
    await utente.type(screen.getByRole('combobox'), 'qqq')

    expect(voci()).toEqual([])
    expect(screen.getByText(/nessuna categoria trovata/i)).toBeInTheDocument()
  })

  it('il contatore dice quante se ne vedono su quante', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)
    expect(screen.getByText('5/5')).toBeInTheDocument()

    await utente.type(screen.getByRole('combobox'), 'casa')
    expect(screen.getByText('1/5')).toBeInTheDocument()
  })
})

describe('tastiera', () => {
  it('le frecce scorrono le voci e Invio sceglie quella attiva', async () => {
    const utente = userEvent.setup()
    const { onChange } = renderCombobox()

    await apri(utente)
    await utente.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('supermercato')
  })

  it('le frecce tornano in cima dopo l ultima voce', async () => {
    const utente = userEvent.setup()
    const { onChange } = renderCombobox()

    await apri(utente)
    await utente.keyboard('{ArrowUp}{Enter}')

    expect(onChange).toHaveBeenCalledWith('trasporti')
  })

  // Il selettore vive dentro i form dell'app: senza il preventDefault, Invio
  // salverebbe la transazione invece di scegliere la categoria.
  it('Invio sceglie senza inviare il form che lo contiene', async () => {
    const utente = userEvent.setup()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const onChange = vi.fn()

    render(
      <form onSubmit={onSubmit}>
        <CategoryCombobox id="categoria" categories={CATEGORIE} value="" onChange={onChange} />
      </form>,
    )

    await utente.click(document.getElementById("categoria") as HTMLButtonElement)
    await utente.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// Il caso per cui esiste l'intercettazione in fase di cattura, ed è invisibile a
// occhio: Modal ascolta Escape sulla stessa finestra ma in risalita, quindi
// senza fermarlo chiudere il menu chiuderebbe anche il form, buttando via quel
// che si stava scrivendo.
describe('Escape', () => {
  function ModaleFinta({ onClose }: { onClose: () => void }) {
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    return <CategoryCombobox id="categoria" categories={CATEGORIE} value="" onChange={() => {}} />
  }

  it('chiude il menu senza chiudere la modale che lo contiene', async () => {
    const utente = userEvent.setup()
    const chiudiModale = vi.fn()
    render(<ModaleFinta onClose={chiudiModale} />)

    await utente.click(document.getElementById("categoria") as HTMLButtonElement)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await utente.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(chiudiModale).not.toHaveBeenCalled()
  })

  it('col menu già chiuso Escape torna alla modale', async () => {
    const utente = userEvent.setup()
    const chiudiModale = vi.fn()
    render(<ModaleFinta onClose={chiudiModale} />)

    await utente.keyboard('{Escape}')

    expect(chiudiModale).toHaveBeenCalled()
  })
})

describe('creazione al volo', () => {
  it('senza la richiamata il piè di lista non compare', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)

    expect(screen.queryByText(/nuova categoria/i)).not.toBeInTheDocument()
  })

  it('con la richiamata la voce compare e chiude il menu', async () => {
    const utente = userEvent.setup()
    const onCreateNew = vi.fn()
    renderCombobox({ onCreateNew })

    await apri(utente)
    await utente.click(screen.getByText(/nuova categoria/i))

    expect(onCreateNew).toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('accessibilità', () => {
  it('l elenco è annunciato come tale e la voce attiva è collegata al campo', async () => {
    const utente = userEvent.setup()
    renderCombobox()

    await apri(utente)

    const listbox = screen.getByRole('listbox')
    const campo = screen.getByRole('combobox')
    const attiva = campo.getAttribute('aria-activedescendant')

    expect(attiva).toBeTruthy()
    expect(within(listbox).getByRole('option', { name: 'Alimentari' }).id).toBe(attiva)
  })

  it('la voce scelta è marcata come selezionata', async () => {
    const utente = userEvent.setup()
    renderCombobox({ value: 'casa' })

    await apri(utente)

    expect(screen.getByRole('option', { name: 'Casa' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Trasporti' })).toHaveAttribute('aria-selected', 'false')
  })
})
