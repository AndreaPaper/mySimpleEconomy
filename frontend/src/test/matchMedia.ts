// Uno stub di matchMedia che sa dire anche di sì.
//
// jsdom non implementa matchMedia, e ThemeContext e useIsMobile lo chiamano
// mentre calcolano lo stato iniziale — non dentro un effetto — quindi senza
// stub qualunque test che monta un componente esplode prima delle asserzioni.
//
// La prima versione di questo file rispondeva sempre `matches: false`. Andava
// bene per non far esplodere i test, ma significava che *ogni* test rendeva il
// ramo desktop: i rami mobile dell'app erano irraggiungibili, e i test sul tema
// non potevano provare il ripiego sulle preferenze di sistema. Da cui questa
// versione, che tiene uno stato interrogabile e notifica i propri ascoltatori
// quando cambia, come farebbe un browser vero.

type Ascoltatore = (event: MediaQueryListEvent) => void

// Le query a cui rispondere `true`. Si confrontano per contenuto: i due usi
// nell'app sono `(max-width: 767px)` e `(prefers-color-scheme: dark)`.
const attive = new Set<string>()
const registrati: { query: string; listener: Ascoltatore }[] = []

function corrisponde(query: string): boolean {
  return [...attive].some((a) => query.includes(a))
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return corrisponde(query)
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Ascoltatore) => {
        registrati.push({ query, listener })
      },
      removeEventListener: (_: string, listener: Ascoltatore) => {
        const i = registrati.findIndex((r) => r.listener === listener)
        if (i >= 0) registrati.splice(i, 1)
      },
      // Le due forme vecchie: Recharts e alcune librerie le usano ancora.
      addListener: (listener: Ascoltatore) => {
        registrati.push({ query, listener })
      },
      removeListener: (listener: Ascoltatore) => {
        const i = registrati.findIndex((r) => r.listener === listener)
        if (i >= 0) registrati.splice(i, 1)
      },
      dispatchEvent: () => false,
    }),
  })
}

/** Riporta ogni query a `false`: chiamato fra un test e l'altro. */
export function resetMatchMedia(): void {
  attive.clear()
  registrati.length = 0
}

/**
 * Accende o spegne una media query e avvisa chi la stava ascoltando, come fa il
 * browser quando si attraversa la soglia. Va chiamato dentro `act(...)` quando
 * la notifica deve aggiornare un componente già montato.
 */
export function setMediaQuery(query: string, matches: boolean): void {
  if (matches) attive.add(query)
  else attive.delete(query)

  for (const { query: q, listener } of [...registrati]) {
    if (q.includes(query)) {
      listener({ matches, media: q } as MediaQueryListEvent)
    }
  }
}

/** Le due scorciatoie che servono davvero, per non ripetere la stringa. */
export function setViewport(viewport: 'mobile' | 'desktop'): void {
  setMediaQuery('max-width: 767px', viewport === 'mobile')
}

export function setSystemTheme(theme: 'dark' | 'light'): void {
  setMediaQuery('prefers-color-scheme: dark', theme === 'dark')
}
