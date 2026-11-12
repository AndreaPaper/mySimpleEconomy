import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { DatabaseStorage } from './db/database'

const FILE = 'myeconomy.sqlite'
const NEW_FILE = 'myeconomy.sqlite.new'

/**
 * Il database sul telefono: un file nella cartella privata dell'app, che nessun'altra
 * app può leggere e che Android cancella solo disinstallando.
 *
 * La scrittura passa da un file nuovo: si scrive myeconomy.sqlite.new, poi si
 * sostituisce il vecchio. Se l'app viene chiusa a metà, all'apertura c'è sempre un
 * file intero — il vecchio, o il nuovo già completo — e mai uno scritto a metà.
 */
export const androidStorage: DatabaseStorage = {
  async load() {
    for (const path of [FILE, NEW_FILE]) {
      try {
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
        return fromBase64(data as string)
      } catch {
        // non c'è: si prova il prossimo, e alla fine si parte da un database vuoto
      }
    }
    return null
  },

  async save(bytes) {
    await Filesystem.writeFile({ path: NEW_FILE, directory: Directory.Data, data: toBase64(bytes) })
    try {
      await Filesystem.deleteFile({ path: FILE, directory: Directory.Data })
    } catch {
      // primo salvataggio: non c'era ancora
    }
    await Filesystem.rename({ from: NEW_FILE, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
  },
}

const DB_NAME = 'myeconomy-local'
const STORE = 'files'

/**
 * Il database nel browser, per provare la modalità locale senza il telefono: lo
 * stesso file, in IndexedDB invece che sul disco del telefono.
 */
export const browserStorage: DatabaseStorage = {
  async load() {
    const db = await openIndexedDb()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(FILE)
      request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  },

  async save(bytes) {
    const db = await openIndexedDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(bytes, FILE)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}

export function platformStorage(): DatabaseStorage {
  return Capacitor.isNativePlatform() ? androidStorage : browserStorage
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Il plugin Filesystem lavora con stringhe base64. A blocchi: String.fromCharCode con
// milioni di argomenti supererebbe il limite dello stack.
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
