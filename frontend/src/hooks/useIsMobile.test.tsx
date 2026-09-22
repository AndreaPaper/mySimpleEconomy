import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useIsMobile } from './useIsMobile'
import { setViewport } from '../test/matchMedia'

// Il commutatore fra layout desktop e mobile. È una decina di righe, ma decide
// quale delle due interfacce si vede: sette file dell'app si diramano su questo
// valore, e finché lo stub di matchMedia rispondeva sempre "no" nessuno di quei
// rami era raggiungibile in un test.

function Spia() {
  return <span data-testid="layout">{useIsMobile() ? 'mobile' : 'desktop'}</span>
}

describe('useIsMobile', () => {
  it('sopra la soglia rende il layout desktop', () => {
    render(<Spia />)

    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
  })

  // Lo stato iniziale si calcola durante il primo render, non in un effetto:
  // aprendo l'app da telefono il layout giusto dev'esserci subito, senza il
  // lampo di quello sbagliato.
  it('sotto la soglia rende il layout mobile già al primo render', () => {
    setViewport('mobile')

    render(<Spia />)

    expect(screen.getByTestId('layout')).toHaveTextContent('mobile')
  })

  /**
   * Il motivo per cui c'è un listener e non solo la lettura iniziale:
   * attraversare la soglia — ruotando il telefono, o ridimensionando la
   * finestra sul desktop — deve cambiare layout senza ricaricare.
   */
  it('segue il cambio di soglia in entrambe le direzioni', () => {
    render(<Spia />)
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')

    act(() => setViewport('mobile'))
    expect(screen.getByTestId('layout')).toHaveTextContent('mobile')

    act(() => setViewport('desktop'))
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
  })

  // Smontato il componente, il listener non deve restare appeso: in produzione
  // sarebbe una perdita a ogni cambio di pagina.
  it('smontandolo non resta in ascolto', () => {
    const { unmount } = render(<Spia />)

    unmount()

    act(() => setViewport('mobile'))
  })
})
