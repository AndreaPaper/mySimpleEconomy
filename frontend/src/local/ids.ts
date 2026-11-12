// Identificativi e istanti, come li genera il backend.

/** Un UUID nuovo: gli id sono stringhe UUID come sul server. */
export function newId(): string {
  return crypto.randomUUID()
}

let lastIssued = 0

/**
 * L'istante attuale, in ISO-8601 con i millisecondi, sempre nello stesso formato: le
 * stringhe si confrontano in ordine di tempo. CheckpointRules confronta l'istante di
 * creazione di una spesa con quello di un saldo, per sapere se la spesa era già dentro
 * il numero.
 *
 * Strettamente crescente: due eventi nello stesso millisecondo avrebbero lo stesso
 * istante, e una spesa registrata appena prima di un saldo risulterebbe "nello stesso
 * momento", cioè dopo. Il secondo prende un millisecondo in più.
 */
export function nowIso(): string {
  lastIssued = Math.max(Date.now(), lastIssued + 1)
  return new Date(lastIssued).toISOString()
}
