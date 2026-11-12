import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { blobBytes } from './blobs'
import { toBase64 } from './storage'

/**
 * Sul telefono un file non si "scarica": lo si scrive nella cache dell'app e lo si
 * passa al foglio Condividi di Android, da cui finisce in Drive, in una email o nei
 * Download. Restituisce false fuori dall'app (nel browser), dove basta il download.
 */
export async function shareFileOnDevice(blob: Blob, filename: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const bytes = new Uint8Array(await blobBytes(blob))
  const { uri } = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: toBase64(bytes) })
  try {
    await Share.share({ title: filename, files: [uri] })
  } catch (error) {
    // Chiudere il foglio Condividi senza scegliere non è un errore.
    if (!String(error).toLowerCase().includes('cancel')) throw error
  }
  return true
}
