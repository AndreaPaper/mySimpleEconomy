import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CaseStyleProvider, useCaseStyle } from './CaseStyleContext'
import { PaletteProvider, usePalette } from './PaletteContext'
import { ThemeProvider, useTheme } from './ThemeContext'
import { DEFAULT_PALETTE_KEY, UI_PALETTES } from '../constants/uiPalettes'
import { setSystemTheme } from '../test/matchMedia'

// Le tre preferenze d'aspetto. Sono context leggeri, ma condividono uno schema
// che sbaglia in modo silenzioso: leggono da localStorage all'avvio e scrivono
// su <html>. Un valore letto male non da' errore — l'app si apre con l'aspetto
// sbagliato, e chi la usa pensa che la sua scelta non sia stata salvata.
//
// Il ripiego sul tema di sistema, in particolare, non era verificabile finche'
// lo stub di matchMedia rispondeva sempre "no": era il ramo predefinito per
// chiunque non avesse ancora scelto, cioe' per ogni nuovo utente.

function SpiaTema() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="tema">{theme}</span>
      <button onClick={toggleTheme}>Cambia</button>
    </div>
  )
}

function SpiaMaiuscole() {
  const { caseStyle, toggleCaseStyle } = useCaseStyle()
  return (
    <div>
      <span data-testid="stile">{caseStyle}</span>
      <button onClick={toggleCaseStyle}>Cambia</button>
    </div>
  )
}

function SpiaPalette() {
  const { paletteKey, setPaletteKey } = usePalette()
  return (
    <div>
      <span data-testid="palette">{paletteKey}</span>
      <button onClick={() => setPaletteKey(UI_PALETTES[1].key)}>Cambia</button>
    </div>
  )
}

describe('tema', () => {
  it('senza scelta salvata segue le preferenze di sistema', () => {
    act(() => setSystemTheme('dark'))

    render(<ThemeProvider><SpiaTema /></ThemeProvider>)

    expect(screen.getByTestId('tema')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('con sistema chiaro resta chiaro', () => {
    render(<ThemeProvider><SpiaTema /></ThemeProvider>)

    expect(screen.getByTestId('tema')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  // Una scelta esplicita batte il sistema: è tutto il punto di averla salvata.
  it('una scelta salvata batte le preferenze di sistema', () => {
    act(() => setSystemTheme('dark'))
    localStorage.setItem('theme', 'light')

    render(<ThemeProvider><SpiaTema /></ThemeProvider>)

    expect(screen.getByTestId('tema')).toHaveTextContent('light')
  })

  // Un valore illeggibile in memoria (una vecchia versione, un'altra scheda)
  // non deve impedire l'avvio: si ricade sul sistema.
  it('un valore salvato senza senso ricade sul sistema', () => {
    localStorage.setItem('theme', 'fucsia')
    act(() => setSystemTheme('dark'))

    render(<ThemeProvider><SpiaTema /></ThemeProvider>)

    expect(screen.getByTestId('tema')).toHaveTextContent('dark')
  })

  it('cambiarlo lo scrive su html e lo ricorda', async () => {
    render(<ThemeProvider><SpiaTema /></ThemeProvider>)

    await userEvent.click(screen.getByText('Cambia'))

    expect(screen.getByTestId('tema')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

describe('stile del testo', () => {
  /**
   * Il predefinito e' "mixed", cioe' niente maiuscolo: e' stata una scelta
   * esplicita, e la lettura in memoria e' scritta al contrario di come ci si
   * aspetterebbe (solo un "uppercase" esatto accende il maiuscolo). Chiunque la
   * riscrivesse "normalizzandola" invertirebbe il predefinito per tutti.
   */
  it('senza scelta salvata il testo non e maiuscolo', () => {
    render(<CaseStyleProvider><SpiaMaiuscole /></CaseStyleProvider>)

    expect(screen.getByTestId('stile')).toHaveTextContent('mixed')
    expect(document.documentElement).toHaveClass('mixed-case')
  })

  it('qualunque valore diverso da "uppercase" vale come non maiuscolo', () => {
    localStorage.setItem('caseStyle', 'UPPERCASE')

    render(<CaseStyleProvider><SpiaMaiuscole /></CaseStyleProvider>)

    expect(screen.getByTestId('stile')).toHaveTextContent('mixed')
  })

  it('la scelta del maiuscolo viene ricordata', () => {
    localStorage.setItem('caseStyle', 'uppercase')

    render(<CaseStyleProvider><SpiaMaiuscole /></CaseStyleProvider>)

    expect(screen.getByTestId('stile')).toHaveTextContent('uppercase')
    expect(document.documentElement).not.toHaveClass('mixed-case')
  })
})

describe('palette', () => {
  it('senza scelta salvata usa quella predefinita', () => {
    render(<PaletteProvider><SpiaPalette /></PaletteProvider>)

    expect(screen.getByTestId('palette')).toHaveTextContent(DEFAULT_PALETTE_KEY)
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE_KEY)
  })

  /**
   * L'unica logica vera di questo context: una palette salvata che non esiste
   * piu' — rinominata, rimossa — deve ricadere sulla predefinita. Senza il
   * controllo, {@code data-palette} porterebbe un nome sconosciuto, nessuna
   * regola CSS attaccherebbe e l'app si aprirebbe senza colori.
   */
  it('una palette salvata che non esiste piu ricade sulla predefinita', () => {
    localStorage.setItem('palette', 'palette-cancellata')

    render(<PaletteProvider><SpiaPalette /></PaletteProvider>)

    expect(screen.getByTestId('palette')).toHaveTextContent(DEFAULT_PALETTE_KEY)
  })

  it('una palette valida viene ripresa', () => {
    localStorage.setItem('palette', UI_PALETTES[1].key)

    render(<PaletteProvider><SpiaPalette /></PaletteProvider>)

    expect(screen.getByTestId('palette')).toHaveTextContent(UI_PALETTES[1].key)
  })

  it('cambiarla la scrive su html e la ricorda', async () => {
    render(<PaletteProvider><SpiaPalette /></PaletteProvider>)

    await userEvent.click(screen.getByText('Cambia'))

    expect(document.documentElement.dataset.palette).toBe(UI_PALETTES[1].key)
    expect(localStorage.getItem('palette')).toBe(UI_PALETTES[1].key)
  })
})
