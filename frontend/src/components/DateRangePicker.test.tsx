import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DateRangePicker from './DateRangePicker'

// Il selettore di intervallo date. L'aritmetica pura sta già in utils/dateRange
// ed è coperta al 100%; qui manca il cablaggio, e in particolare la macchina a
// stati di handleDayClick — che decide se un click apre un nuovo intervallo o
// ne chiude uno aperto. Sbagliarla non dà errore: filtra le transazioni su un
// periodo diverso da quello che si è cliccato.

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-03-15T12:00:00'))
})
afterEach(() => vi.useRealTimers())

function monta(from = '', to = '') {
  const onApply = vi.fn()
  render(<DateRangePicker from={from} to={to} onApply={onApply} />)
  return { onApply }
}

const utenteConTimer = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

/** Apre il pannello cliccando il pulsante con l'etichetta dell'intervallo. */
const apri = async (utente: ReturnType<typeof userEvent.setup>) => {
  await utente.click(screen.getByRole('button', { name: /Tutte le date|–|Dal |Fino al/ }))
}

/** Il giorno indicato nella griglia del mese corrente (marzo 2026). */
const giorno = (n: string) => {
  const celle = screen.getAllByRole('button', { name: n })
  // Due mesi sono in vista: si prende l'ultima, cioè quella del mese corrente.
  return celle[celle.length - 1]
}

describe('apertura', () => {
  it('il pannello si apre e si chiude', async () => {
    const utente = utenteConTimer()
    monta()

    await apri(utente)
    expect(screen.getByRole('button', { name: 'Applica' })).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('button', { name: 'Applica' })).not.toBeInTheDocument()
  })

  it('Annulla non applica niente', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(giorno('10'))
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))

    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('la macchina a stati dell intervallo', () => {
  it('il primo click apre l intervallo, il secondo lo chiude', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(giorno('10'))
    await utente.click(giorno('20'))
    await utente.click(screen.getByRole('button', { name: 'Applica' }))

    expect(onApply).toHaveBeenCalledWith('2026-03-10', '2026-03-20')
  })

  /**
   * Cliccando prima dell'inizio non si costruisce un intervallo alla rovescia: si ricomincia
   * da lì. Senza, l'intervallo avrebbe la fine prima dell'inizio e la ricerca non
   * restituirebbe nulla, senza spiegare perché.
   */
  it('un click prima dell inizio fa ripartire da quel giorno', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(giorno('20'))
    await utente.click(giorno('10')) // prima dell'inizio: riparte
    await utente.click(giorno('25'))
    await utente.click(screen.getByRole('button', { name: 'Applica' }))

    expect(onApply).toHaveBeenCalledWith('2026-03-10', '2026-03-25')
  })

  // Con un intervallo già completo, il click successivo ne apre uno nuovo invece di
  // allargare quello vecchio.
  it('con un intervallo completo il click successivo ne apre uno nuovo', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(giorno('10'))
    await utente.click(giorno('20'))
    await utente.click(giorno('5')) // nuovo inizio
    await utente.click(giorno('8'))
    await utente.click(screen.getByRole('button', { name: 'Applica' }))

    expect(onApply).toHaveBeenCalledWith('2026-03-05', '2026-03-08')
  })

  // Lo stesso giorno due volte è un intervallo di un giorno solo, non un errore.
  it('lo stesso giorno cliccato due volte è un intervallo di un giorno', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(giorno('12'))
    await utente.click(giorno('12'))
    await utente.click(screen.getByRole('button', { name: 'Applica' }))

    expect(onApply).toHaveBeenCalledWith('2026-03-12', '2026-03-12')
  })
})

describe('le scorciatoie', () => {
  it('"Questo mese" riempie l intervallo del mese corrente', async () => {
    const utente = utenteConTimer()
    const { onApply } = monta()

    await apri(utente)
    await utente.click(screen.getByRole('button', { name: 'Questo mese' }))
    await utente.click(screen.getByRole('button', { name: 'Applica' }))

    expect(onApply).toHaveBeenCalledWith('2026-03-01', '2026-03-31')
  })

  /**
   * "Personalizzato" non calcola niente: si accende da solo quando l'intervallo scelto a mano
   * non coincide con nessuna delle quattro scorciatoie. È l'unica indicazione a schermo che
   * quello che si vede è una scelta propria e non una proposta.
   */
  it('"Personalizzato" si accende con un intervallo scelto a mano', async () => {
    const utente = utenteConTimer()
    monta()

    await apri(utente)
    await utente.click(screen.getByRole('button', { name: 'Questo mese' }))
    // Non e' un pulsante ma un'etichetta: non si sceglie, si accende da se'.
    const personalizzato = screen.getByText('Personalizzato')
    const conScorciatoia = personalizzato.className

    await utente.click(giorno('10'))
    await utente.click(giorno('20'))

    expect(screen.getByText('Personalizzato').className).not.toBe(conScorciatoia)
  })
})

describe('etichetta del pulsante', () => {
  it('senza date lo dice', () => {
    monta()

    expect(screen.getByRole('button', { name: 'Tutte le date' })).toBeInTheDocument()
  })

  it('con un intervallo mostra le due date', () => {
    monta('2026-03-02', '2026-03-31')

    const pulsante = screen.getByRole('button', { name: /mar/ })
    expect(within(pulsante).queryByText(/2026/) ?? pulsante).toHaveTextContent('2026')
  })
})
