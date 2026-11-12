/**
 * I byte di un Blob o di un File. Con FileReader invece di blob.arrayBuffer(): il
 * secondo manca nel Blob di jsdom, dove girano i test, e il primo c'è ovunque.
 */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
