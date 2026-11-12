import ExcelJS from 'exceljs'

// L'equivalente di XlsxFixtures dei test Java: celle scritte con righe e colonne
// contate da 0, come in POI, così gli scenari si copiano uguali.

export type Sheet = ExcelJS.Worksheet

const cell = (sheet: Sheet, r: number, c: number) => sheet.getCell(r + 1, c + 1)

export function workbook(...sheetNames: string[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  for (const name of sheetNames) wb.addWorksheet(name)
  return wb
}

export function setText(sheet: Sheet, r: number, c: number, value: string) {
  cell(sheet, r, c).value = value
}

export function setNumeric(sheet: Sheet, r: number, c: number, value: number) {
  cell(sheet, r, c).value = value
}

/** Una data vera: un numero col formato data, come la scrive Excel. */
export function setDate(sheet: Sheet, r: number, c: number, iso: string | null) {
  if (iso === null) return
  const [y, m, d] = iso.split('-').map(Number)
  const target = cell(sheet, r, c)
  target.value = new Date(Date.UTC(y, m - 1, d))
  target.numFmt = 'yyyy-mm-dd'
}

export function setFormula(sheet: Sheet, r: number, c: number, formula: string, result?: number | string) {
  cell(sheet, r, c).value = (result === undefined ? { formula } : { formula, result }) as ExcelJS.CellValue
}

type Fill = { argb: string } | { theme: number; tint?: number }

export function setColoredText(sheet: Sheet, r: number, c: number, value: string, color: string | Fill) {
  setText(sheet, r, c, value)
  applyFill(sheet, r, c, color)
}

export function setColoredBlank(sheet: Sheet, r: number, c: number, color: string | Fill) {
  applyFill(sheet, r, c, color)
}

function applyFill(sheet: Sheet, r: number, c: number, color: string | Fill) {
  const fgColor = typeof color === 'string' ? { argb: color } : color
  cell(sheet, r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: fgColor as ExcelJS.Color }
}

/** Il file come lo riceverebbe l'app: scritto su byte e riletto. */
export async function toFile(wb: ExcelJS.Workbook, name = 'diario.xlsx'): Promise<File> {
  const buffer = await wb.xlsx.writeBuffer()
  return new File([buffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const copy = new ExcelJS.Workbook()
  await copy.xlsx.load(await wb.xlsx.writeBuffer())
  return copy
}
