/**
 * Salva un file generato dall'app (l'export Excel, il backup). Nel browser è un
 * download; nell'app per il telefono passa dal foglio Condividi di Android, perché lì
 * un link di download non porta da nessuna parte.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  // Il controllo sulla costante di build tiene Capacitor fuori dalla versione web.
  if (import.meta.env.VITE_DATA_MODE === 'local') {
    const { shareFileOnDevice } = await import('../local/share')
    if (await shareFileOnDevice(blob, filename)) return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
