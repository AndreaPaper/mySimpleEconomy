import type { Cell, Workbook } from 'exceljs'
import type { IsoDate } from '../dates'
import type { Cents } from '../money'

// Le letture di cella di PoiCells, sopra ExcelJS invece che sopra Apache POI.

/** Una cella di testo (readString): testo semplice, ricco o di un link. Non un numero, non una formula. */
export function readString(cell: Cell | undefined): string | null {
  const value = cell?.value
  let text: string | null = null
  if (typeof value === 'string') text = value
  else if (value && typeof value === 'object') {
    if ('richText' in value) text = value.richText.map((r) => r.text).join('')
    else if ('hyperlink' in value && typeof value.text === 'string') text = value.text
  }
  return text === null || text.trim() === '' ? null : text
}

/**
 * Una cella data (readDate): un numero con formato data, che ExcelJS restituisce già
 * come Date. Le date di ExcelJS sono in UTC (il numero seriale di Excel non ha fuso),
 * quindi si leggono le componenti UTC: con quelle locali, su un telefono con un fuso a
 * ovest di Greenwich, la mezzanotte diventerebbe il giorno prima.
 */
export function readDate(cell: Cell | undefined): IsoDate | null {
  const value = cell?.value
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

/**
 * Un importo (readNumeric): un numero che non sia una data, o il risultato numerico di
 * una formula, arrotondato al centesimo come BigDecimal.valueOf(x).setScale(2, HALF_UP).
 *
 * Una differenza da POI: POI ricalcola le formule, qui si usa il risultato che Excel ha
 * salvato nel file. Per un file salvato da Excel è lo stesso numero; un file mai aperto
 * in Excel (generato da un programma) può non averlo, e la cella vale assente.
 */
export function readNumeric(cell: Cell | undefined): Cents | null {
  const value = cell?.value
  if (typeof value === 'number') return roundToCents(value)
  if (value && typeof value === 'object' && !(value instanceof Date) && 'result' in value) {
    const result = (value as { result?: unknown }).result
    if (typeof result === 'number') return roundToCents(result)
  }
  return null
}

/**
 * Arrotonda al centesimo "half up" sulla rappresentazione decimale del numero, come
 * BigDecimal.valueOf(double): 1.005 diventa 1,01. Moltiplicare per cento e arrotondare
 * darebbe 1,00, perché in binario 1.005 è un pelo sotto.
 */
export function roundToCents(value: number): Cents {
  const negative = value < 0
  const text = Math.abs(value).toString().includes('e') ? Math.abs(value).toFixed(12) : Math.abs(value).toString()
  const [intPart, fracPart = ''] = text.split('.')
  const digits = (fracPart + '000').slice(0, 3)
  let cents = Number(intPart) * 100 + Number(digits.slice(0, 2))
  if (Number(digits[2]) >= 5) cents += 1
  return negative ? -cents : cents
}

/**
 * La chiave di colore del riempimento di una cella, come colorKeyOf del parser Java:
 * il colore ARGB che POI restituisce con getARGBHex().
 *
 * Per un colore del tema POI mette nella cella l'RGB del tema (inheritFromThemeAsRequired)
 * e getARGBHex lo restituisce senza applicare la sfumatura (tint). Qui si fa lo stesso,
 * risolvendo l'indice del tema sul file del tema: due celle con lo stesso colore, una in
 * RGB e una come colore del tema, devono avere la stessa chiave anche qui. I colori
 * indicizzati (rari nei riempimenti) restano con l'indice: la chiave serve solo a
 * confrontare celle dello stesso file.
 */
export function colorKeyOf(cell: Cell | undefined, themeColors: string[]): string | null {
  const fill = cell?.style?.fill
  if (!fill || fill.type !== 'pattern') return null
  const color = fill.fgColor as { argb?: string; theme?: number; indexed?: number } | undefined
  if (!color) return null
  if (color.argb) {
    const argb = color.argb.toUpperCase()
    return `argb:${argb.length === 6 ? 'FF' + argb : argb}`
  }
  if (color.theme !== undefined) {
    const rgb = themeColors[color.theme]
    return rgb ? `argb:FF${rgb.toUpperCase()}` : null
  }
  if (color.indexed !== undefined) return `indexed:${color.indexed}`
  return null
}

/**
 * I colori del tema del file, nell'ordine degli indici di POI (ThemesTable.ThemeElement):
 * lt1, dk1, lt2, dk2, accent1…accent6, hlink, folHlink. Nel file l'ordine è dk1, lt1,
 * dk2, lt2: POI scambia le prime due coppie, e chi scrive l'indice nel file pure.
 */
export function themeColorsOf(workbook: Workbook): string[] {
  const xml = (workbook as unknown as { _themes?: Record<string, string> })._themes?.theme1
  if (!xml) return []
  const scheme = /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(xml)?.[1] ?? ''
  const read = (tag: string): string => {
    const element = new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`).exec(scheme)?.[1] ?? ''
    return (
      /<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/.exec(element)?.[1] ??
      /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(element)?.[1] ??
      ''
    )
  }
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(
    read,
  )
}
