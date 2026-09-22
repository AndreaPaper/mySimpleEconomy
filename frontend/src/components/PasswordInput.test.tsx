import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordInput from './PasswordInput'

// Il campo password con l'occhio. Piccolo, ma con due contratti che a occhio non
// si vedono: che il bottone non invii il form che lo contiene, e che dica a un
// lettore di schermo cosa fa e in che stato si trova.

function renderCampo(value = '') {
  const onChange = vi.fn()
  render(<PasswordInput id="password" value={value} onChange={onChange} />)
  return {
    onChange,
    campo: () => document.getElementById('password') as HTMLInputElement,
    bottone: () => screen.getByRole('button'),
  }
}

describe('PasswordInput', () => {
  it('parte con la password nascosta', () => {
    const { campo, bottone } = renderCampo('segreta')

    expect(campo().type).toBe('password')
    expect(bottone()).toHaveAttribute('aria-pressed', 'false')
    expect(bottone()).toHaveAccessibleName('Mostra la password')
  })

  it('l occhio la mostra e la rinasconde', async () => {
    const utente = userEvent.setup()
    const { campo, bottone } = renderCampo('segreta')

    await utente.click(bottone())

    expect(campo().type).toBe('text')
    expect(bottone()).toHaveAttribute('aria-pressed', 'true')
    expect(bottone()).toHaveAccessibleName('Nascondi la password')

    await utente.click(bottone())

    expect(campo().type).toBe('password')
  })

  it('mostrare la password non ne cambia il valore', async () => {
    const utente = userEvent.setup()
    const { campo, bottone, onChange } = renderCampo('segreta123')

    await utente.click(bottone())

    expect(campo().value).toBe('segreta123')
    expect(onChange).not.toHaveBeenCalled()
  })

  // Il campo vive dentro il form di accesso: un bottone senza type esplicito è
  // di tipo submit, quindi cliccare l'occhio tenterebbe di accedere.
  it('l occhio non invia il form che lo contiene', async () => {
    const utente = userEvent.setup()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <PasswordInput id="password" value="segreta" onChange={() => {}} />
      </form>,
    )

    await utente.click(screen.getByRole('button'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('inoltra quello che si scrive', async () => {
    const utente = userEvent.setup()
    const { campo, onChange } = renderCampo()

    await utente.type(campo(), 'ab')

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('riporta i vincoli del campo', () => {
    render(<PasswordInput id="password" value="" onChange={() => {}} required minLength={8} />)

    const campo = document.getElementById('password') as HTMLInputElement
    expect(campo.required).toBe(true)
    expect(campo.minLength).toBe(8)
  })
})
