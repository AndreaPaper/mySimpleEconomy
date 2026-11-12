// Identificativi e istanti, come li genera il backend.

/** Un UUID nuovo: gli id sono stringhe UUID come sul server. */
export function newId(): string {
  return crypto.randomUUID()
}

/**
 * L'istante attuale, in ISO-8601 con i millisecondi. Sempre nello stesso formato,
 * così le stringhe si confrontano in ordine di tempo: CheckpointRules confronta
 * l'istante di creazione di una transazione con quello di un saldo.
 */
export function nowIso(): string {
  return new Date().toISOString()
}
