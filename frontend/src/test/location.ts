/**
 * Una `window.location` finta, pilotabile.
 *
 * Serve per una riga sola di produzione: il redirect su 401 in
 * `api/client.ts`, che assegna `window.location.href`. jsdom non sa navigare, e
 * a ogni 401 sputa uno stack trace "Not implemented: navigation" — non un
 * fallimento, ma una quarantina di stack trace che in un log di CI seppelliscono
 * l'unico errore vero quando c'è. Qui la navigazione viene registrata invece che
 * tentata, e i test possono asserirla.
 *
 * La finta DEVE esporre un URL completo e coerente: axios risolve la baseURL
 * relativa contro `location.href`, e una location monca (solo `pathname`) fa
 * fallire ogni richiesta come errore di rete — cosa che una volta ha reso muto
 * un test che credevo stesse provando qualcosa.
 */
const PARTENZA = 'http://localhost:3000/'

let corrente = new URL(PARTENZA)
let navigazioni: string[] = []
let ricariche = 0

function vaiA(destinazione: string): void {
  corrente = new URL(destinazione, corrente.href)
  navigazioni.push(corrente.href)
}

export function installLocationStub(): void {
  const finta = {
    assign: vaiA,
    replace: vaiA,
    reload: () => {
      ricariche++
    },
    toString: () => corrente.href,
  }
  // I campi sono getter sul URL corrente: così `pathname` cambia insieme a
  // `href`, che è quello che la guardia `pathname !== '/login'` legge.
  for (const campo of ['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'] as const) {
    Object.defineProperty(finta, campo, {
      enumerable: true,
      get: () => corrente[campo],
      set: (valore: string) => vaiA(campo === 'href' ? valore : corrente.href),
    })
  }
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: finta })
}

export function resetLocation(): void {
  corrente = new URL(PARTENZA)
  navigazioni = []
  ricariche = 0
}

/**
 * Mette la pagina a un certo indirizzo *senza* contarlo come navigazione: è il
 * punto di partenza del test, non qualcosa che il codice ha deciso.
 */
export function setLocation(pathname: string): void {
  corrente = new URL(pathname, PARTENZA)
}

/** Dove il codice ha chiesto di andare, in ordine. Vuoto se non ha navigato. */
export function navigazioniRichieste(): string[] {
  return [...navigazioni]
}

/** Quante volte il codice ha chiesto di ricaricare (lo fa OfflineSyncContext). */
export function ricaricheRichieste(): number {
  return ricariche
}
