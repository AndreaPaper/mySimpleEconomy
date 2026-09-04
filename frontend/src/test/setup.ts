import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installLocationStub, resetLocation } from './location'
import { installMatchMedia, resetMatchMedia } from './matchMedia'

// Lo stub di matchMedia sta in un file a parte perché i test lo pilotano:
// vedi src/test/matchMedia.ts per il perché non basta rispondere sempre "no".
installMatchMedia()

// Il redirect su 401 assegna window.location.href, e in jsdom quella è una
// navigazione non implementata: uno stack trace per ogni 401. Registrarla
// invece che tentarla la rende anche asseribile — vedi src/test/location.ts.
installLocationStub()

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
  // Un redirect lasciato in eredità cambierebbe il pathname che legge il test
  // dopo, e la guardia del 401 si comporta diversamente se è già su /login.
  resetLocation()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
