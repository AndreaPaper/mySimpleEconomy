import type { Cell, Row, Workbook, Worksheet } from 'exceljs'
import type { IsoDate } from '../dates'
import type { Cents } from '../money'
import { colorKeyOf, readDate, readNumeric, readString, themeColorsOf } from './cells'

// Porting di ExcelSheetParser: estrae i dati grezzi dal diario spese (un foglio per
// mese con le tabelle "Fisse" e "Non Fisse", un foglio "Spese ricorrenti" ignorato e
// un foglio "Stima <anno>" col saldo). Nessuna interpretazione: quella sta nell'analisi.
//
// Righe e colonne qui sono contate da 0 come in POI; ExcelJS le conta da 1, e la
// conversione sta tutta in cellAt/rowAt.

export interface FisseRow {
  sheetName: string
  sheetIndex: number
  date: IsoDate | null
  name: string
  amount: Cents
}

export interface NonFisseRow {
  sheetName: string
  date: IsoDate
  name: string
  amount: Cents
  matchedCategoryLabel: string | null
}

export interface PeriodStart {
  date: IsoDate
  startBalance: Cents | null
  salaryAmount: Cents | null
}

export interface ParsedWorkbook {
  fisseRows: FisseRow[]
  nonFisseRows: NonFisseRow[]
  checkpointDate: IsoDate | null
  checkpointBalance: Cents | null
  periodStarts: PeriodStart[]
  sheetsProcessed: number
}

const EXCLUDED_SHEETS = new Set(['Spese ricorrenti', 'Stima 2026'])
const STIMA_SHEET_PREFIX = 'Stima'
const ITALIAN_MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

interface TableHeader {
  headerRow: number
  dataCol: number
  nomeCol: number
  costoCol: number
}

const rowAt = (sheet: Worksheet, r: number): Row | undefined => sheet.findRow(r + 1)
const cellAt = (row: Row | undefined, c: number): Cell | undefined => (c < 0 ? undefined : row?.findCell(c + 1))
// L'ultima riga (getLastRowNum) e la prima esistente (getFirstRowNum) di POI.
const lastRowOf = (sheet: Worksheet) => sheet.rowCount - 1
function firstRowOf(sheet: Worksheet): number {
  for (let r = 0; r <= lastRowOf(sheet); r++) if (rowAt(sheet, r)) return r
  return 0
}
// getLastCellNum: uno oltre l'ultima colonna presente.
const lastCellOf = (row: Row) => row.cellCount

export function parseDiary(workbook: Workbook, today: IsoDate): ParsedWorkbook {
  const themeColors = themeColorsOf(workbook)
  const fisseRows: FisseRow[] = []
  const nonFisseRows: NonFisseRow[] = []
  const periodStarts: PeriodStart[] = []
  let sheetsProcessed = 0

  workbook.worksheets.forEach((sheet, sheetIndex) => {
    const sheetName = sheet.name
    if (EXCLUDED_SHEETS.has(sheetName) || sheetName.startsWith(STIMA_SHEET_PREFIX)) return
    sheetsProcessed++

    const headers = findTableHeaders(sheet).sort((a, b) => a.dataCol - b.dataCol)
    if (headers.length === 0) return

    const legend = readLegend(sheet, themeColors)
    fisseRows.push(...readFisseTable(sheet, sheetName, sheetIndex, headers[0]))
    if (headers.length > 1) nonFisseRows.push(...readNonFisseTable(sheet, sheetName, headers[1], legend, themeColors))

    const periodStart = readPeriodStart(sheet)
    if (periodStart) periodStarts.push(periodStart)
  })

  let checkpointDate: IsoDate | null = null
  let checkpointBalance: Cents | null = null
  const stimaSheet = workbook.worksheets.find((s) => s.name.startsWith(STIMA_SHEET_PREFIX))
  if (stimaSheet) {
    const latest = readLatestBalance(stimaSheet, today)
    if (latest) {
      checkpointDate = latest.date
      checkpointBalance = latest.balance
    }
  }

  return { fisseRows, nonFisseRows, checkpointDate, checkpointBalance, periodStarts, sheetsProcessed }
}

// Le etichette "SALDO INIZIO MESE" e "Stipendio" in colonna A, col valore nella riga
// sotto: il saldo nella stessa colonna, lo stipendio in A/B (data/importo). La data
// dello stipendio è l'inizio del "mese" dell'utente e ancora entrambi i valori.
function readPeriodStart(sheet: Worksheet): PeriodStart | null {
  let startBalance: Cents | null = null
  let salaryDate: IsoDate | null = null
  let salaryAmount: Cents | null = null

  for (let r = firstRowOf(sheet); r <= lastRowOf(sheet); r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    const label = readString(cellAt(row, 0))
    if (label === null) continue
    const normalized = label.trim().toLocaleLowerCase('it')

    if (normalized === 'saldo inizio mese') {
      const valueRow = rowAt(sheet, r + 1)
      if (valueRow) startBalance = readNumeric(cellAt(valueRow, 0))
    } else if (normalized === 'stipendio') {
      const valueRow = rowAt(sheet, r + 1)
      if (valueRow) {
        salaryDate = readDate(cellAt(valueRow, 0))
        salaryAmount = readNumeric(cellAt(valueRow, 1))
      }
    }
  }

  return salaryDate === null ? null : { date: salaryDate, startBalance, salaryAmount }
}

const equalsIgnoreCase = (a: string | null, b: string) => a !== null && a.toLowerCase() === b.toLowerCase()

// "Data" seguita da "Nome" e "Costo" nelle due colonne dopo, nelle prime cinque righe.
function findTableHeaders(sheet: Worksheet): TableHeader[] {
  const found: TableHeader[] = []
  const maxScanRow = Math.min(lastRowOf(sheet), 4)
  for (let r = firstRowOf(sheet); r <= maxScanRow; r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    for (let c = 0; c < lastCellOf(row); c++) {
      if (!equalsIgnoreCase(readString(cellAt(row, c)), 'Data')) continue
      if (equalsIgnoreCase(readString(cellAt(row, c + 1)), 'Nome') && equalsIgnoreCase(readString(cellAt(row, c + 2)), 'Costo')) {
        found.push({ headerRow: r, dataCol: c, nomeCol: c + 1, costoCol: c + 2 })
      }
    }
  }
  return found
}

function readFisseTable(sheet: Worksheet, sheetName: string, sheetIndex: number, header: TableHeader): FisseRow[] {
  const rows: FisseRow[] = []
  for (let r = header.headerRow + 1; r <= lastRowOf(sheet); r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    const date = readDate(cellAt(row, header.dataCol))
    const name = readString(cellAt(row, header.nomeCol))
    const amount = readNumeric(cellAt(row, header.costoCol))
    if (name !== null && amount !== null) rows.push({ sheetName, sheetIndex, date, name: name.trim(), amount })
  }
  return rows
}

function readNonFisseTable(
  sheet: Worksheet,
  sheetName: string,
  header: TableHeader,
  legend: Map<string, string>,
  themeColors: string[],
): NonFisseRow[] {
  const rows: NonFisseRow[] = []
  for (let r = header.headerRow + 1; r <= lastRowOf(sheet); r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    const nomeCell = cellAt(row, header.nomeCol)
    const date = readDate(cellAt(row, header.dataCol))
    const name = readString(nomeCell)
    const amount = readNumeric(cellAt(row, header.costoCol))
    if (date !== null && name !== null && amount !== null) {
      const colorKey = colorKeyOf(nomeCell, themeColors)
      const category = colorKey !== null ? (legend.get(colorKey) ?? null) : null
      rows.push({ sheetName, date, name: name.trim(), amount, matchedCategoryLabel: category })
    }
  }
  return rows
}

// La legenda colore → categoria: una cella colorata seguita dalla sua etichetta, in
// qualunque punto del foglio. Vince la prima trovata per ogni colore.
function readLegend(sheet: Worksheet, themeColors: string[]): Map<string, string> {
  const legend = new Map<string, string>()
  for (let r = firstRowOf(sheet); r <= lastRowOf(sheet); r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    for (let c = 0; c < lastCellOf(row) - 1; c++) {
      const swatchCell = cellAt(row, c)
      const labelCell = cellAt(row, c + 1)
      if (!swatchCell || !labelCell) continue
      const colorKey = colorKeyOf(swatchCell, themeColors)
      const label = readString(labelCell)
      if (colorKey !== null && label !== null && !legend.has(colorKey)) legend.set(colorKey, label.trim())
    }
  }
  return legend
}

// L'ultimo saldo del foglio di stima: colonna A il mese (in italiano), B il saldo di
// partenza. Vince la riga più in basso con entrambi. Si salta la prima riga presente
// (l'intestazione).
function readLatestBalance(sheet: Worksheet, today: IsoDate): { date: IsoDate; balance: Cents } | null {
  const year = /(\d{4})/.exec(sheet.name)?.[1] ?? today.slice(0, 4)
  let latest: { date: IsoDate; balance: Cents } | null = null
  for (let r = firstRowOf(sheet) + 1; r <= lastRowOf(sheet); r++) {
    const row = rowAt(sheet, r)
    if (!row) continue
    const monthName = readString(cellAt(row, 0))
    const balance = readNumeric(cellAt(row, 1))
    if (monthName === null || balance === null) continue
    const month = ITALIAN_MONTHS.indexOf(monthName.trim().toLocaleLowerCase('it')) + 1
    if (month === 0) continue
    latest = { date: `${year}-${String(month).padStart(2, '0')}-01`, balance }
  }
  return latest
}
