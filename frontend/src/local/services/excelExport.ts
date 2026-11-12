import type { Cell, Style, Workbook, Worksheet } from 'exceljs'
import { periodKeyOf, periodRangeOf } from '../../utils/period'
import type { LocalDatabase } from '../db/database'
import { plusDays, today as todayDate, type IsoDate } from '../dates'
import { divideHalfUp, toEuros, type Cents } from '../money'
import { requiredDate } from '../validate'
import { countsAfterCheckpoint, latestCheckpointOnOrBefore } from './checkpoints'
import { listDebts } from './debts'
import { loadProfile } from './profile'
import type { TransactionRow } from './transactions'

// Porting di ExcelExportService: le transazioni in un .xlsx, con un foglio per periodo
// da stipendio a stipendio (come Dashboard, Risparmio e Budget), i totali per
// categoria, ricorrenti e debiti, e l'andamento del saldo.

const DEFAULT_FROM = '1970-01-01'
const TRANSACTION_HEADERS = ['Data', 'Categoria', 'Tipo', 'Ricorrente', 'Importo', 'Descrizione']
const ITALIAN_MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
// Le uscite sono negative, e in rosso si distinguono senza leggere il segno.
const CURRENCY_FORMAT = '#,##0.00 €;[RED]-#,##0.00 €'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface ExportTransaction extends TransactionRow {
  category_name: string
  parent_name: string | null
}

interface Styles {
  date: Partial<Style>
  currency: Partial<Style>
  bold: Partial<Style>
  boldCurrency: Partial<Style>
  title: Partial<Style>
  header: Partial<Style>
  note: Partial<Style>
}

const STYLES: Styles = {
  date: { numFmt: 'dd/mm/yyyy' },
  currency: { numFmt: CURRENCY_FORMAT },
  bold: { font: { bold: true } },
  boldCurrency: { font: { bold: true }, numFmt: CURRENCY_FORMAT },
  title: { font: { bold: true, size: 13 } },
  // La riga sotto l'intestazione separa i titoli dai dati mentre si scorre.
  header: { font: { bold: true }, border: { bottom: { style: 'thin' } } },
  note: { font: { italic: true } },
}

const signed = (t: TransactionRow): Cents => (t.type === 'EXPENSE' ? -t.amount : t.amount)
const sumByType = (ts: TransactionRow[], type: TransactionRow['type']) =>
  ts.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0)
const categoryPath = (t: { category_name: string; parent_name: string | null }) =>
  t.parent_name !== null ? `${t.parent_name} › ${t.category_name}` : t.category_name
const dayFormat = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`

/** "Novembre 2026": il periodo prende il nome dal mese in cui finisce. */
function sheetName(period: string): string {
  const month = ITALIAN_MONTHS[Number(period.slice(5, 7)) - 1]
  return `${month[0].toUpperCase()}${month.slice(1)} ${period.slice(0, 4)}`
}

function cadence(value: number | null, unit: string): string {
  const v = value ?? 1
  const labels: Record<string, [string, string]> = {
    DAY: ['giorno', 'giorni'],
    WEEK: ['settimana', 'settimane'],
    MONTH: ['mese', 'mesi'],
    YEAR: ['anno', 'anni'],
  }
  return `ogni ${v} ${labels[unit][v === 1 ? 0 : 1]}`
}

/** Il file .xlsx, come Blob: è ciò che la pagina riceve con responseType 'blob'. */
export async function exportExcel(
  db: LocalDatabase,
  query: Record<string, string | undefined>,
  today: IsoDate = todayDate(),
): Promise<Blob> {
  const from = query.from ? requiredDate({ from: query.from }, 'from') : null
  const to = query.to ? requiredDate({ to: query.to }, 'to') : null
  const categoryId = query.categoryId || null

  const transactions = db.all<ExportTransaction>(
    `SELECT t.*, c.name AS category_name, p.name AS parent_name
     FROM transactions t JOIN categories c ON c.id = t.category_id LEFT JOIN categories p ON p.id = c.parent_id
     WHERE t.occurred_on BETWEEN :from AND :to ${categoryId ? 'AND t.category_id = :categoryId' : ''}
     ORDER BY t.occurred_on, t.created_at, t.rowid`,
    { from: from ?? DEFAULT_FROM, to: to ?? today, categoryId },
  )

  const profile = loadProfile(db)
  const salaryDay = profile.salary_day
  const savingsOn = profile.savings_enabled === 1 && profile.savings_percent !== null
  const savingsPercent = savingsOn ? profile.savings_percent! : 0

  // In ordine di periodo, come la TreeMap.
  const byPeriod = new Map<string, ExportTransaction[]>()
  for (const t of transactions) {
    const key = periodKeyOf(t.occurred_on, salaryDay)
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), t])
  }
  const periods = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b))

  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  writeSummarySheet(workbook, periods, salaryDay, describeFilters(db, from, to, categoryId, transactions))
  for (const [period, list] of periods) writePeriodSheet(workbook, period, list, salaryDay, savingsOn, savingsPercent)
  writeCategoriesSheet(workbook, transactions)
  writeRecurringAndDebtsSheet(workbook, db)
  writeBalanceTrendSheet(workbook, db, periods, salaryDay)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

// --- Riepilogo ----------------------------------------------------------------------

function writeSummarySheet(
  workbook: Workbook,
  periods: [string, ExportTransaction[]][],
  salaryDay: number | null,
  filterNote: string | null,
) {
  const sheet = new SheetWriter(workbook.addWorksheet('Riepilogo'))
  let r = sheet.title(0, 'Riepilogo per periodo')
  if (filterNote !== null) r = sheet.note(r, filterNote)
  r++

  const headerRow = r
  sheet.header(r++, 'Periodo', 'Dal', 'Al', 'Entrate', 'Uscite', 'Netto', 'Transazioni')
  let totalIncome = 0
  let totalExpense = 0
  for (const [period, list] of periods) {
    const income = sumByType(list, 'INCOME')
    const expense = sumByType(list, 'EXPENSE')
    totalIncome += income
    totalExpense += expense
    const range = periodRangeOf(period, salaryDay)
    sheet.text(r, 0, sheetName(period))
    sheet.date(r, 1, range.start)
    sheet.date(r, 2, range.end)
    sheet.money(r, 3, income)
    sheet.money(r, 4, -expense)
    sheet.money(r, 5, income - expense)
    sheet.number(r, 6, list.length)
    r++
  }
  sheet.text(r, 0, 'Totale', STYLES.bold)
  sheet.money(r, 3, totalIncome, STYLES.boldCurrency)
  sheet.money(r, 4, -totalExpense, STYLES.boldCurrency)
  sheet.money(r, 5, totalIncome - totalExpense, STYLES.boldCurrency)

  sheet.freeze(headerRow + 1)
  sheet.autoSize(7)
}

// --- Un foglio per periodo ----------------------------------------------------------

function writePeriodSheet(
  workbook: Workbook,
  period: string,
  transactions: ExportTransaction[],
  salaryDay: number | null,
  savingsOn: boolean,
  savingsPercent: number,
) {
  const sheet = new SheetWriter(workbook.addWorksheet(sheetName(period)))
  const { start, end } = periodRangeOf(period, salaryDay)
  let r = sheet.title(0, `${sheetName(period)} · dal ${dayFormat(start)} al ${dayFormat(end)}`)
  r++

  const income = sumByType(transactions, 'INCOME')
  const expense = sumByType(transactions, 'EXPENSE')
  const net = income - expense
  r = sheet.keyValue(r, 'Entrate', income)
  r = sheet.keyValue(r, 'Uscite', -expense)
  r = sheet.keyValue(r, 'Risparmiato (entrate − uscite)', net)
  if (savingsOn) {
    const goal = divideHalfUp(income * savingsPercent, 100)
    r = sheet.keyValue(r, `Obiettivo del periodo (${savingsPercent}% delle entrate)`, goal)
    r = sheet.keyValue(r, "Scarto dall'obiettivo", net - goal)
  }

  r++
  const headerRow = r
  sheet.header(r++, ...TRANSACTION_HEADERS)
  for (const t of transactions) {
    sheet.date(r, 0, t.occurred_on)
    sheet.text(r, 1, categoryPath(t))
    sheet.text(r, 2, t.type === 'INCOME' ? 'Entrata' : 'Uscita')
    sheet.text(r, 3, t.recurring_transaction_id !== null ? 'Sì' : 'No')
    // Con il segno la colonna si somma: Excel mostra il netto selezionandola.
    sheet.money(r, 4, signed(t))
    sheet.text(r, 5, t.description ?? '')
    r++
  }
  const lastTransactionRow = r - 1

  r++
  r = writeCategoryTotals(sheet, r, transactions, 'EXPENSE', 'Totali per categoria — Uscite')
  r++
  writeCategoryTotals(sheet, r, transactions, 'INCOME', 'Totali per categoria — Entrate')

  sheet.freeze(headerRow + 1)
  if (lastTransactionRow > headerRow) sheet.autoFilter(headerRow, lastTransactionRow, TRANSACTION_HEADERS.length - 1)
  sheet.autoSize(TRANSACTION_HEADERS.length)
}

/** Ordinati dal più grande; a parità, nell'ordine in cui compaiono (sort stabile, come Java). */
function sortedByValueDesc(totals: Map<string, Cents>): [string, Cents][] {
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

function writeCategoryTotals(
  sheet: SheetWriter,
  r: number,
  transactions: ExportTransaction[],
  type: TransactionRow['type'],
  heading: string,
): number {
  const totals = new Map<string, Cents>()
  for (const t of transactions) {
    if (t.type !== type) continue
    totals.set(categoryPath(t), (totals.get(categoryPath(t)) ?? 0) + t.amount)
  }
  if (totals.size === 0) return r
  sheet.text(r++, 0, heading, STYLES.bold)
  for (const [name, total] of sortedByValueDesc(totals)) {
    sheet.text(r, 0, name)
    sheet.money(r, 1, type === 'EXPENSE' ? -total : total)
    r++
  }
  return r
}

// --- Categorie ----------------------------------------------------------------------

function writeCategoriesSheet(workbook: Workbook, transactions: ExportTransaction[]) {
  const sheet = new SheetWriter(workbook.addWorksheet('Categorie'))
  let r = sheet.title(0, "Totali per categoria su tutto l'esportato")
  r++
  for (const type of ['EXPENSE', 'INCOME'] as const) {
    r = writeCategoryTree(sheet, r, transactions, type)
    r++
  }
  sheet.freeze(2)
  sheet.autoSize(4)
}

// Una riga per categoria principale, col totale che comprende le sottocategorie, poi
// le sottocategorie rientrate.
function writeCategoryTree(
  sheet: SheetWriter,
  r: number,
  transactions: ExportTransaction[],
  type: TransactionRow['type'],
): number {
  const byLeaf = new Map<string, Cents>()
  const countByLeaf = new Map<string, number>()
  const parentOfLeaf = new Map<string, string>()
  for (const t of transactions) {
    if (t.type !== type) continue
    const leaf = t.category_name
    byLeaf.set(leaf, (byLeaf.get(leaf) ?? 0) + t.amount)
    countByLeaf.set(leaf, (countByLeaf.get(leaf) ?? 0) + 1)
    if (!parentOfLeaf.has(leaf)) parentOfLeaf.set(leaf, t.parent_name ?? leaf)
  }
  if (byLeaf.size === 0) return r

  sheet.text(r++, 0, type === 'EXPENSE' ? 'Uscite' : 'Entrate', STYLES.title)
  sheet.header(r++, 'Categoria', 'Sottocategoria', 'Totale', 'Transazioni')

  const byParent = new Map<string, Cents>()
  for (const [leaf, total] of byLeaf) {
    const parent = parentOfLeaf.get(leaf)!
    byParent.set(parent, (byParent.get(parent) ?? 0) + total)
  }
  const signedTotal = (amount: Cents) => (type === 'EXPENSE' ? -amount : amount)

  for (const [parent, parentTotal] of sortedByValueDesc(byParent)) {
    const parentRow = r++
    sheet.text(parentRow, 0, parent, STYLES.bold)
    sheet.money(parentRow, 2, signedTotal(parentTotal), STYLES.boldCurrency)
    const children = sortedByValueDesc(
      new Map([...byLeaf].filter(([leaf]) => parentOfLeaf.get(leaf) === parent && leaf !== parent)),
    )
    for (const [child, total] of children) {
      sheet.text(r, 1, child)
      sheet.money(r, 2, signedTotal(total))
      sheet.number(r, 3, countByLeaf.get(child)!)
      r++
    }
    if (byLeaf.has(parent)) sheet.number(parentRow, 3, countByLeaf.get(parent)!)
  }
  return r
}

// --- Ricorrenti e debiti ------------------------------------------------------------

function writeRecurringAndDebtsSheet(workbook: Workbook, db: LocalDatabase) {
  const sheet = new SheetWriter(workbook.addWorksheet('Ricorrenti e debiti'))
  let r = sheet.title(0, 'Regole ricorrenti attive')

  const recurring = db.all<{
    name: string
    category_name: string
    parent_name: string | null
    default_amount: number
    interval_unit: string
    interval_value: number
    next_due_date: IsoDate
  }>(
    `SELECT r.*, c.name AS category_name, p.name AS parent_name
     FROM recurring_transactions r JOIN categories c ON c.id = r.category_id LEFT JOIN categories p ON p.id = c.parent_id
     WHERE r.active = 1 ORDER BY r.created_at, r.rowid`,
  )
  if (recurring.length === 0) {
    r = sheet.note(r, 'Nessuna regola ricorrente attiva.')
  } else {
    sheet.header(r++, 'Nome', 'Categoria', 'Importo', 'Cadenza', 'Prossima scadenza')
    for (const rule of recurring) {
      sheet.text(r, 0, rule.name)
      sheet.text(r, 1, categoryPath(rule))
      sheet.money(r, 2, rule.default_amount)
      sheet.text(r, 3, cadence(rule.interval_value, rule.interval_unit))
      sheet.date(r, 4, rule.next_due_date)
      r++
    }
  }

  r += 2
  r = sheet.title(r, 'Debiti e finanziamenti')
  const debts = listDebts(db)
  if (debts.length === 0) {
    sheet.note(r, 'Nessun debito registrato.')
  } else {
    sheet.header(r++, 'Nome', 'Categoria', 'Totale', 'Pagato', 'Residuo', 'Rata mensile')
    for (const debt of debts) {
      sheet.text(r, 0, debt.name)
      sheet.text(r, 1, debt.categoryName ?? '')
      sheet.euros(r, 2, debt.totalAmount)
      sheet.euros(r, 3, debt.paidAmount)
      sheet.euros(r, 4, debt.remainingAmount)
      if (debt.monthlyPaymentAmount !== null) sheet.euros(r, 5, debt.monthlyPaymentAmount)
      r++
    }
  }
  sheet.autoSize(6)
}

// --- Andamento del saldo ------------------------------------------------------------

function writeBalanceTrendSheet(
  workbook: Workbook,
  db: LocalDatabase,
  periods: [string, ExportTransaction[]][],
  salaryDay: number | null,
) {
  const sheet = new SheetWriter(workbook.addWorksheet('Andamento del saldo'))
  let r = sheet.title(0, 'Andamento del saldo per periodo')
  r = sheet.note(
    r,
    'Il saldo iniziale del primo periodo viene dal saldo registrato più recente non successivo al suo ' +
      "inizio, piu' tutto quello che e' stato registrato da li' in avanti: e' lo stesso " +
      'calcolo del saldo che vedi in Dashboard, valutato alla fine di ogni periodo.',
  )
  r++

  const headerRow = r
  sheet.header(r++, 'Periodo', 'Dal', 'Al', 'Saldo iniziale', 'Entrate', 'Uscite', 'Saldo finale')
  for (const [period, list] of periods) {
    const { start, end } = periodRangeOf(period, salaryDay)
    // Ogni riga si ancora al saldo registrato più vicino, invece di sommare a catena.
    sheet.text(r, 0, sheetName(period))
    sheet.date(r, 1, start)
    sheet.date(r, 2, end)
    sheet.money(r, 3, balanceAt(db, plusDays(start, -1)))
    sheet.money(r, 4, sumByType(list, 'INCOME'))
    sheet.money(r, 5, -sumByType(list, 'EXPENSE'))
    sheet.money(r, 6, balanceAt(db, end), STYLES.boldCurrency)
    r++
  }
  sheet.freeze(headerRow + 1)
  sheet.autoSize(7)
}

/** Il saldo a una data, come la Dashboard: l'ultimo saldo registrato più quello che conta dopo. */
function balanceAt(db: LocalDatabase, date: IsoDate): Cents {
  const checkpoint = latestCheckpointOnOrBefore(db, date)
  const rows = db.all<TransactionRow>('SELECT * FROM transactions WHERE occurred_on BETWEEN :from AND :to', {
    from: checkpoint?.checkpoint_date ?? DEFAULT_FROM,
    to: date,
  })
  return rows.filter((t) => countsAfterCheckpoint(t, checkpoint)).reduce((s, t) => s + signed(t), checkpoint?.balance ?? 0)
}

function describeFilters(
  db: LocalDatabase,
  from: IsoDate | null,
  to: IsoDate | null,
  categoryId: string | null,
  transactions: ExportTransaction[],
): string | null {
  const parts: string[] = []
  if (from !== null) parts.push(`dal ${dayFormat(from)}`)
  if (to !== null) parts.push(`al ${dayFormat(to)}`)
  if (categoryId !== null) {
    let name = transactions.length > 0 ? categoryPath(transactions[0]) : null
    if (name === null) {
      const category = db.get<{ category_name: string; parent_name: string | null }>(
        `SELECT c.name AS category_name, p.name AS parent_name
         FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.id = :id`,
        { id: categoryId },
      )
      name = category ? categoryPath(category) : 'categoria selezionata'
    }
    parts.push(`solo ${name}`)
  }
  return parts.length === 0 ? null : `Contenuto filtrato: ${parts.join(', ')}.`
}

// --- Scrittura delle celle ----------------------------------------------------------

/**
 * Le celle con righe e colonne contate da 0, come in POI (ExcelJS conta da 1), e la
 * larghezza delle colonne calcolata sul testo più lungo: ExcelJS non ha autoSizeColumn.
 */
class SheetWriter {
  private readonly sheet: Worksheet
  private readonly widths = new Map<number, number>()

  constructor(sheet: Worksheet) {
    this.sheet = sheet
  }

  private cell(r: number, c: number, display: string, style?: Partial<Style>): Cell {
    const cell = this.sheet.getCell(r + 1, c + 1)
    if (style) cell.style = style
    this.widths.set(c, Math.max(this.widths.get(c) ?? 0, display.length))
    return cell
  }

  text(r: number, c: number, value: string, style?: Partial<Style>) {
    this.cell(r, c, value, style).value = value
  }

  number(r: number, c: number, value: number) {
    this.cell(r, c, String(value)).value = value
  }

  money(r: number, c: number, cents: Cents, style: Partial<Style> = STYLES.currency) {
    this.euros(r, c, toEuros(cents), style)
  }

  euros(r: number, c: number, euros: number, style: Partial<Style> = STYLES.currency) {
    // "-1.234,56 €": la lunghezza del numero formattato.
    this.cell(r, c, `${euros.toFixed(2)}xxxx`, style).value = euros
  }

  date(r: number, c: number, date: IsoDate) {
    const [y, m, d] = date.split('-').map(Number)
    // Le date di ExcelJS sono in UTC: a mezzanotte UTC il giorno resta quello.
    this.cell(r, c, '00/00/0000', STYLES.date).value = new Date(Date.UTC(y, m - 1, d))
  }

  title(r: number, value: string): number {
    // Un titolo è lungo e sta nella prima colonna: non deve allargarla.
    const cell = this.sheet.getCell(r + 1, 1)
    cell.value = value
    cell.style = STYLES.title
    return r + 1
  }

  note(r: number, value: string): number {
    const cell = this.sheet.getCell(r + 1, 1)
    cell.value = value
    cell.style = STYLES.note
    return r + 1
  }

  header(r: number, ...headers: string[]) {
    headers.forEach((h, c) => this.text(r, c, h, STYLES.header))
  }

  keyValue(r: number, label: string, cents: Cents): number {
    this.text(r, 0, label, STYLES.bold)
    this.money(r, 1, cents, STYLES.boldCurrency)
    return r + 1
  }

  freeze(rows: number) {
    this.sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: rows }]
  }

  autoFilter(fromRow: number, toRow: number, lastCol: number) {
    this.sheet.autoFilter = { from: { row: fromRow + 1, column: 1 }, to: { row: toRow + 1, column: lastCol + 1 } }
  }

  autoSize(columns: number) {
    for (let c = 0; c < columns; c++) {
      this.sheet.getColumn(c + 1).width = Math.min(60, Math.max(8, (this.widths.get(c) ?? 0) + 2))
    }
  }
}
