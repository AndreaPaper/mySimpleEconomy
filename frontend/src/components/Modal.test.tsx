import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'

// Modal e ConfirmDialog sono piccoli e usati da quasi ogni pagina. Le due regole
// che contengono non sono estetiche: proteggono da due modi diversi di perdere
// lavoro — un form chiuso per sbaglio, e un'eliminazione mandata due volte.

// In jsdom getBoundingClientRect restituisce sempre zeri, quindi ogni punto
// risulterebbe "dentro" il pannello e la regola dei 24px non verrebbe mai
// esercitata: il pannello va messo in un rettangolo dichiarato.
//
// Il rettangolo comprende l'origine di proposito. userEvent riporta le
// coordinate del click a (0, 0), e con un pannello spostato più in là ogni
// click su un pulsante interno risulterebbe "lontano": la modale si
// chiuderebbe due volte, per un artefatto del finto e non per un comportamento
// vero. I click che devono cadere fuori usano quindi punti oltre il bordo.
const PANNELLO = { left: 0, right: 600, top: 0, bottom: 400 }

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // Solo il pannello ha un rettangolo: il fondo resta a zero, come in jsdom.
    return (this as HTMLElement).classList.contains('max-w-md')
      ? ({ ...PANNELLO, width: 600, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
      : ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  })
})

const fondo = () => document.querySelector('.fixed.inset-0')!

/** Una pressione e un rilascio nello stesso punto, come un click vero. */
const clickIn = (x: number, y: number) => {
  fireEvent.mouseDown(fondo(), { clientX: x, clientY: y })
  fireEvent.click(fondo(), { clientX: x, clientY: y })
}

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

  it('un click ben fuori dal pannello chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    clickIn(700, 500)

    expect(chiudi).toHaveBeenCalledTimes(1)
  })

  // Il margine di tolleranza: 24px oltre il bordo si è ancora "vicini", e il
  // click vale come un errore di mira, non come volontà di chiudere.
  it('un click di poco fuori dal bordo non chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    clickIn(PANNELLO.right + 10, 200)

    expect(chiudi).not.toHaveBeenCalled()
  })

  /**
   * La regola che vale il file. Selezionare del testo dentro un campo e
   * trascinare oltre il bordo produce un click sul fondo: guardando solo il
   * click, la modale si chiuderebbe e il form scritto a metà sparirebbe.
   * Servono quindi <em>entrambi</em> gli estremi lontani dal pannello.
   */
  it('trascinare una selezione da dentro a fuori non chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    fireEvent.mouseDown(fondo(), { clientX: 300, clientY: 200 }) // dentro
    fireEvent.click(fondo(), { clientX: 700, clientY: 500 }) // rilasciato fuori

    expect(chiudi).not.toHaveBeenCalled()
  })

  // E il verso opposto: pressione fuori, rilascio dentro. Stesso trattamento.
  it('premere fuori e rilasciare dentro non chiude', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    fireEvent.mouseDown(fondo(), { clientX: 700, clientY: 500 })
    fireEvent.click(fondo(), { clientX: 300, clientY: 200 })

    expect(chiudi).not.toHaveBeenCalled()
  })

  // Dopo un tentativo non riuscito lo stato va azzerato, altrimenti il click
  // successivo erediterebbe la pressione di quello prima.
  it('un tentativo non riuscito non lascia strascichi', () => {
    const chiudi = vi.fn()
    render(<Modal title="T" onClose={chiudi}>corpo</Modal>)

    fireEvent.mouseDown(fondo(), { clientX: 700, clientY: 500 })
    fireEvent.click(fondo(), { clientX: 300, clientY: 200 })
    // Ora un click tutto dentro: non deve chiudere per via del precedente.
    fireEvent.click(fondo(), { clientX: 300, clientY: 200 })

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
