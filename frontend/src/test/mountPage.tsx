import type { ReactElement, ReactNode } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { Profile } from '../api/types'
import { AuthProvider } from '../context/AuthContext'
import { CaseStyleProvider } from '../context/CaseStyleContext'
import { OfflineSyncProvider } from '../context/OfflineSyncContext'
import { PaletteProvider } from '../context/PaletteContext'
import { ThemeProvider } from '../context/ThemeContext'
import { profileHandler } from './handlers'
import { setViewport } from './matchMedia'
import { server } from './server'

// Montare una pagina con la sua vera pila di provider e un router, contro la
// rete finta di server.ts.
//
// Si monta la PAGINA SOLA e non l'albero di rotte vero: `Layout` renderebbe
// tutta la navigazione, e ogni ricerca per testo in ogni test di pagina
// rischierebbe di trovare due volte "Risparmio". `ProtectedRoute` e `Layout`
// hanno i propri test, separati.

export interface MountPageOptions {
  /** Rotta iniziale, con eventuale query. Predefinita '/'. */
  route?: string
  /** Schema della rotta, se diverso dall'URL. */
  path?: string
  /** Predefinito true: scrive il token prima del montaggio. */
  authenticated?: boolean
  /** Campi del profilo che la pagina legge dal contesto (salaryDay, savings). */
  profile?: Partial<Profile>
  /**
   * Predefinito 'desktop'. Va deciso PRIMA del render: useIsMobile legge
   * matchMedia mentre calcola lo stato iniziale, non dentro un effetto.
   */
  viewport?: 'mobile' | 'desktop'
  /** Dimensioni finte per i grafici; false per lasciarli a zero. */
  chartSize?: { width: number; height: number } | false
  /** Altre rotte da montare: di solito la destinazione di un navigate(). */
  extraRoutes?: ReactNode
}

export interface MountPageResult extends RenderResult {
  /** Dove si trova il router adesso: per verificare che si sia navigato. */
  currentPath: () => string
}

function Providers({ children }: { children: ReactNode }) {
  // Stesso annidamento di App.tsx. Deliberatamente senza StrictMode: il doppio
  // montaggio degli effetti (e quindi le richieste doppie) è un comportamento
  // che in test non aggiunge nulla e rende illeggibili i conteggi.
  return (
    <ThemeProvider>
      <CaseStyleProvider>
        <PaletteProvider>
          <OfflineSyncProvider>
            <AuthProvider>{children}</AuthProvider>
          </OfflineSyncProvider>
        </PaletteProvider>
      </CaseStyleProvider>
    </ThemeProvider>
  )
}

export function mountPage(ui: ReactElement, options: MountPageOptions = {}): MountPageResult {
  const {
    route = '/',
    path = route.split('?')[0],
    authenticated = true,
    profile,
    viewport = 'desktop',
    chartSize = { width: 800, height: 260 },
    extraRoutes = null,
  } = options

  if (authenticated) {
    localStorage.setItem('token', 'tok-test')
    localStorage.setItem('email', 'utente@test.it')
  }
  if (profile) server.use(profileHandler(profile))
  if (viewport === 'mobile') setViewport('mobile')
  if (chartSize) stubChartSize(chartSize)

  const posizione = { current: route }
  function Sonda() {
    const l = useLocation()
    posizione.current = `${l.pathname}${l.search}`
    return null
  }

  const utils = render(
    <Providers>
      <MemoryRouter initialEntries={[route]}>
        <Sonda />
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes}
          <Route path="*" element={<div data-testid="altrove" />} />
        </Routes>
      </MemoryRouter>
    </Providers>,
  )

  return Object.assign(utils, { currentPath: () => posizione.current })
}

/**
 * L'albero di rotte vero, per i pochi test che riguardano la navigazione fra
 * pagine (il rimando al login, il catch-all su una rotta sconosciuta). Per tutto
 * il resto si usa `mountPage`, che monta la pagina sola.
 */
export function mountApp(
  options: Omit<MountPageOptions, 'path' | 'extraRoutes'> = {},
): MountPageResult {
  return mountPage(<AppRoutes />, { ...options, path: '*' })
}

/**
 * I grafici in jsdom.
 *
 * Recharts 3.9 misura il DOM in un punto solo: `ResponsiveContainer` legge
 * `getBoundingClientRect()` sul proprio div dentro un effetto al montaggio, e
 * se la larghezza è zero non rende <em>nulla</em> dei figli. Il grafico interno
 * riceve invece numeri dal contesto e non misura niente.
 *
 * Quindi si fa mentire `getBoundingClientRect` solo per quel div: `Modal` e
 * `CategoryCombobox`, che si posizionano misurando, continuano a vedere quello
 * che vedevano prima. Lo stub lo disfa il `vi.restoreAllMocks()` che setup.ts
 * fa già in `afterEach`.
 */
export function stubChartSize({ width, height }: { width: number; height: number }): void {
  const originale = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ): DOMRect {
    if (!this.classList?.contains('recharts-responsive-container')) return originale.call(this)
    return {
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
  })
}

/**
 * Recharts calcola l'etichetta attiva dal movimento del mouse, strozzato su
 * `requestAnimationFrame`. In jsdom scatta ~16 ms dopo, quando `userEvent` ha
 * già restituito: senza questo, al momento del click l'etichetta attiva non
 * c'è ancora. Va chiamato prima del render.
 */
export function runAnimationFramesSynchronously(): void {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(performance.now())
    return 0
  })
}
