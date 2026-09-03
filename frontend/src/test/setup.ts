import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installMatchMedia, resetMatchMedia } from './matchMedia'

// Lo stub di matchMedia sta in un file a parte perché i test lo pilotano:
// vedi src/test/matchMedia.ts per il perché non basta rispondere sempre "no".
installMatchMedia()

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
  // Ogni test parte da desktop e tema chiaro, che sono i valori predefiniti:
  // chi vuole il mobile lo chiede con setViewport('mobile').
  resetMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
