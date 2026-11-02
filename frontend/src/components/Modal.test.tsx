import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'

// Modal e ConfirmDialog sono piccoli e usati da quasi ogni pagina. Le due regole
// che contengono non sono estetiche: proteggono da due modi diversi di perdere
// lavoro — un form chiuso per sbaglio, e un'eliminazione mandata due volte.

const fondo = () => document.querySelector('.fixed.inset-0')!

describe('Modal', () => {
  it('mostra titolo e contenuto', () => {
    render(<Modal title="Nuova transazione" onClose={vi.fn()}>corpo</Modal>)

    expect(screen.getByText('Nuova transazione')).toBeInTheDocument()
    expect(screen.getByText('corpo')).toBeInTheDocument()
  })

  it('la X chiude', async () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    await userEvent.click(screen.getByLabelText('Chiudi'))

    expect(chiudi).toHaveBeenCalledTimes(1)
  })

  it('Escape chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(chiudi).toHaveBeenCalledTimes(1)
  })

  /**
   * La regola che vale il file: le modali contengono form, e un tocco sul fondo
   * (su un telefono basta sfiorare il bordo) butterebbe via quello che si stava
   * scrivendo. Si chiudono solo dalla X, dai pulsanti o con Escape.
   */
  it('un click sul fondo non chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    fireEvent.mouseDown(fondo())
    fireEvent.click(fondo())

    expect(chiudi).not.toHaveBeenCalled()
  })
})

describe('ConfirmDialog', () => {
  const props = {
    title: 'Elimina transazione',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('mostra cosa sta per succedere', () => {
    render(<ConfirmDialog {...props}>Affitto, 500,00 €</ConfirmDialog>)

    // È il motivo per cui esiste al posto del confirm() del browser, che non
    // poteva mostrare i dati e chiedeva conferma alla cieca.
    expect(screen.getByText('Affitto, 500,00 €')).toBeInTheDocument()
  })

  /**
   * Il fuoco parte da "Annulla", non dalla conferma: chi tira via un Invio per
   * abitudine non deve trovarsi con qualcosa di cancellato.
   */
  it('il fuoco parte da Annulla', () => {
    render(<ConfirmDialog {...props}>corpo</ConfirmDialog>)

    expect(screen.getByText('Annulla')).toHaveFocus()
  })

  it('conferma e annulla chiamano ciascuno il proprio', async () => {
    const conferma = vi.fn()
    const annulla = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={conferma} onCancel={annulla}>corpo</ConfirmDialog>)

    await userEvent.click(screen.getByText('Elimina'))
    expect(conferma).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByText('Annulla'))
    expect(annulla).toHaveBeenCalledTimes(1)
  })

  /**
   * Con l'operazione in corso <em>entrambi</em> i pulsanti sono bloccati. La
   * conferma per non mandare due richieste di eliminazione; l'annulla perché
   * chiudere a metà lascerebbe l'elenco a schermo che non corrisponde più a
   * quello in archivio.
   */
  it('mentre lavora blocca tutti e due i pulsanti', () => {
    render(<ConfirmDialog {...props} busy>corpo</ConfirmDialog>)

    expect(screen.getByText('Attendere...')).toBeDisabled()
    expect(screen.getByText('Annulla')).toBeDisabled()
  })

  it('mostra l errore senza chiudersi', () => {
    render(<ConfirmDialog {...props} error="Non riesco a eliminarla">corpo</ConfirmDialog>)

    expect(screen.getByText('Non riesco a eliminarla')).toBeInTheDocument()
    expect(screen.getByText('Elimina')).toBeInTheDocument()
  })

  it('Escape equivale ad annullare', () => {
    const annulla = vi.fn()
    render(<ConfirmDialog {...props} onCancel={annulla}>corpo</ConfirmDialog>)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(annulla).toHaveBeenCalledTimes(1)
  })
})
