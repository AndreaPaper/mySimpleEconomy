import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom non implementa alcune cose che questa app usa *in fase di
// inizializzazione*, non dentro un effetto: ThemeContext e useIsMobile chiamano
// matchMedia mentre calcolano lo stato iniziale, quindi senza lo stub qualunque
// test che monta un componente esplode prima di arrivare alle asserzioni.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// Usato dai grafici Recharts.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// CategoryCombobox lo chiama per tenere in vista la voce attiva mentre si
// scorre con le frecce.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

beforeEach(() => {
  // Otto file leggono localStorage, diversi a livello di modulo: senza pulirlo
  // lo stato di un test finisce in quello dopo.
  localStorage.clear()
  // Le palette e il tema scrivono su <html>: stessa storia.
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-palette')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
