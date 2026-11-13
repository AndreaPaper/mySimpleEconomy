import { blobBytes } from '../blobs'
import type { LocalDatabase } from '../db/database'
import { today as todayDate, type IsoDate } from '../dates'
import { parseDiary, type FisseRow, type NonFisseRow } from '../excel/diaryParser'
import { newId, nowIso } from '../ids'
import { toCents, toEuros } from '../money'
import { badRequest } from '../router'
import { bodyOf, optionalString, requiredDate, requiredEnum, requiredNumber, requiredString, type Body } from '../validate'
import { findCategory, findCategoryByName, insertCategory, type CategoryRow, type CategoryType } from './categories'
import { processDueRule } from './recurringGeneration'
import { CATEGORY_COLORS } from '../../constants/colors'

// Porting di ExcelImportAnalysisService ed ExcelImportCommitService: l'import del diario
// spese. L'analisi propone, la conferma scrive.

const MIN_SHEETS_FOR_RECURRING = 2

interface CategorySuggestion {
  tempId: string
  name: string
  type: CategoryType
  color: string | null
  icon: string | null
}

interface CategoryRef {
  existingCategoryId: string | null
  newCategoryTempId: string | null
}

/**
 * Un colore e un'icona per ogni categoria proposta (withColorsAndIcons del backend). Prima
 * restavano senza, e nel grafico a torta finivano grigie una accanto all'altra (D3 del test
 * end-to-end del 13/11/2026). Il colore è il primo della palette non ancora usato; finita
 * la palette si ricomincia dal primo. L'icona è generica, una per tipo.
 */
function withColorsAndIcons(suggestions: CategorySuggestion[], existing: CategoryRow[]): CategorySuggestion[] {
  const used = new Set(existing.flatMap((c) => (c.color ? [c.color.toUpperCase()] : [])))
  return suggestions.map((s, i) => {
    const color = CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]
    used.add(color)
    return { ...s, color, icon: s.type === 'INCOME' ? 'Wallet' : 'Tag' }
  })
}

/** Legge il file arrivato come FormData ('file'), come il @RequestParam del controller. */
async function fileBytes(body: unknown): Promise<ArrayBuffer> {
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof Blob) || file.size === 0) throw badRequest('File mancante')
  return blobBytes(file)
}

export async function analyzeExcelImport(db: LocalDatabase, body: unknown, today: IsoDate = todayDate()) {
  const bytes = await fileBytes(body)
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch {
    throw badRequest('Impossibile leggere il file Excel')
  }
  const parsed = parseDiary(workbook, today)

  // Come Collectors.toMap con (a, b) -> a: a parità di nome vince la prima.
  const existingByName = new Map<string, string>()
  for (const c of db.all<CategoryRow>('SELECT * FROM categories WHERE archived = 0 ORDER BY created_at, rowid')) {
    const key = c.name.toLocaleLowerCase('it')
    if (!existingByName.has(key)) existingByName.set(key, c.id)
  }
  const newCategoriesByName = new Map<string, CategorySuggestion>()
  const resolveCategory = (categoryName: string, type: CategoryType): CategoryRef => {
    const key = categoryName.trim().toLocaleLowerCase('it')
    const existingId = existingByName.get(key)
    if (existingId) return { existingCategoryId: existingId, newCategoryTempId: null }
    let suggestion = newCategoriesByName.get(key)
    if (!suggestion) {
      suggestion = { tempId: 'new-' + key.replace(/[^a-z0-9]+/g, '-'), name: categoryName.trim(), type, color: null, icon: null }
      newCategoriesByName.set(key, suggestion)
    }
    return { existingCategoryId: null, newCategoryTempId: suggestion.tempId }
  }

  const representativeMonth = representativeMonths(parsed.nonFisseRows)
  const recurringTransactions: unknown[] = []
  const oneOff: ({ occurredOn: IsoDate; name: string; amount: number; needsCategory: boolean } & CategoryRef)[] = []
  const unresolved: CategoryRef = { existingCategoryId: null, newCategoryTempId: null }

  for (const group of groupFisseRows(parsed.fisseRows)) {
    const distinctSheets = new Set(group.map((r) => r.sheetName)).size
    if (distinctSheets >= MIN_SHEETS_FOR_RECURRING) {
      const representative = group[0]
      const dates = group.map((r) => r.date).filter((d): d is IsoDate => d !== null)
      const anchor = dates.length > 0 ? dates.reduce((a, b) => (b < a ? b : a)) : fallbackAnchor(group, representativeMonth, today)
      recurringTransactions.push({
        name: representative.name,
        amount: toEuros(representative.amount),
        startDate: anchor,
        occurrenceCount: distinctSheets,
        ...resolveCategory(guessRecurringCategoryName(representative.name), 'EXPENSE'),
      })
    } else {
      for (const row of group) {
        oneOff.push({ occurredOn: row.date ?? today, name: row.name, amount: toEuros(row.amount), needsCategory: true, ...unresolved })
      }
    }
  }

  for (const row of parsed.nonFisseRows) {
    if (row.matchedCategoryLabel !== null) {
      oneOff.push({
        occurredOn: row.date,
        name: row.name,
        amount: toEuros(row.amount),
        needsCategory: false,
        ...resolveCategory(row.matchedCategoryLabel, 'EXPENSE'),
      })
    } else {
      oneOff.push({ occurredOn: row.date, name: row.name, amount: toEuros(row.amount), needsCategory: true, ...unresolved })
    }
  }

  // Saldo di inizio periodo e stipendio: un saldo per periodo dà una cronologia più
  // precisa del solo valore del foglio "Stima". A parità di giorno vince l'ultimo, ma
  // resta al posto del primo (LinkedHashMap.put).
  const checkpointsByDate = new Map<IsoDate, { checkpointDate: IsoDate; balance: number }>()
  if (parsed.checkpointDate !== null && parsed.checkpointBalance !== null) {
    checkpointsByDate.set(parsed.checkpointDate, {
      checkpointDate: parsed.checkpointDate,
      balance: toEuros(parsed.checkpointBalance),
    })
  }
  for (const start of parsed.periodStarts) {
    if (start.startBalance !== null) {
      checkpointsByDate.set(start.date, { checkpointDate: start.date, balance: toEuros(start.startBalance) })
    }
    if (start.salaryAmount !== null) {
      oneOff.push({
        occurredOn: start.date,
        name: 'Stipendio',
        amount: toEuros(start.salaryAmount),
        needsCategory: false,
        ...resolveCategory('Stipendio', 'INCOME'),
      })
    }
  }
  const balanceCheckpoints = [...checkpointsByDate.values()]

  return {
    newCategorySuggestions: withColorsAndIcons(
      [...newCategoriesByName.values()],
      db.all<CategoryRow>('SELECT * FROM categories WHERE archived = 0'),
    ),
    recurringTransactions,
    oneOffTransactions: oneOff,
    balanceCheckpoints,
    summary: {
      sheetsProcessed: parsed.sheetsProcessed,
      recurringDetected: recurringTransactions.length,
      oneOffDetected: oneOff.length,
      categoriesToCreate: newCategoriesByName.size,
      itemsNeedingCategory: oneOff.filter((i) => i.needsCategory).length,
      checkpointsDetected: balanceCheckpoints.length,
    },
  }
}

/** Le righe "Fisse" raggruppate per nome (senza maiuscole) e importo, nell'ordine in cui compaiono. */
function groupFisseRows(rows: FisseRow[]): FisseRow[][] {
  const groups = new Map<string, FisseRow[]>()
  for (const row of rows) {
    const key = `${row.name.trim().toLocaleLowerCase('it')}|${row.amount}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.values()]
}

// Senza date, la regola parte dal primo del mese del foglio più vecchio, riconosciuto
// dalle date delle sue spese "Non Fisse".
function fallbackAnchor(group: FisseRow[], representativeMonth: Map<string, string>, today: IsoDate): IsoDate {
  const earliest = group.reduce((a, b) => (b.sheetIndex < a.sheetIndex ? b : a))
  return `${representativeMonth.get(earliest.sheetName) ?? today.slice(0, 7)}-01`
}

/**
 * Il mese più frequente fra le date "Non Fisse" di ogni foglio. A parità vince il primo
 * incontrato: in Java decide l'ordine di una HashMap, che per i mesi dello stesso anno
 * è quello di inserimento.
 */
function representativeMonths(rows: NonFisseRow[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const bySheet = counts.get(row.sheetName) ?? new Map<string, number>()
    const month = row.date.slice(0, 7)
    bySheet.set(month, (bySheet.get(month) ?? 0) + 1)
    counts.set(row.sheetName, bySheet)
  }
  const result = new Map<string, string>()
  for (const [sheet, monthCounts] of counts) {
    let best: [string, number] | null = null
    for (const entry of monthCounts) if (best === null || entry[1] > best[1]) best = entry
    if (best) result.set(sheet, best[0])
  }
  return result
}

function guessRecurringCategoryName(itemName: string): string {
  const lower = itemName.toLocaleLowerCase('it')
  const containsAny = (...needles: string[]) => needles.some((n) => lower.includes(n))
  if (containsAny('spotify', 'netflix', 'disney', 'apple tv', 'prime video', 'dazn')) return 'Abbonamenti'
  if (containsAny('iliad', 'vodafone', 'wind', 'fastweb', 'tim')) return 'Utenze'
  return 'Fisso'
}

// --- Conferma -----------------------------------------------------------------------

function list(body: Body, field: string): Body[] {
  const value = body[field]
  if (!Array.isArray(value)) throw badRequest(`Il campo ${field} è obbligatorio`)
  return value.map(bodyOf)
}

function categoryRef(item: Body): CategoryRef {
  return {
    existingCategoryId: optionalString(item, 'existingCategoryId'),
    newCategoryTempId: optionalString(item, 'newCategoryTempId'),
  }
}

const resolved = (ref: CategoryRef) => ref.existingCategoryId !== null || ref.newCategoryTempId !== null

export function commitExcelImport(db: LocalDatabase, raw: unknown, today: IsoDate = todayDate()) {
  const body = bodyOf(raw)
  const suggestions = list(body, 'newCategorySuggestions').map((s) => ({
    tempId: requiredString(s, 'tempId'),
    name: requiredString(s, 'name'),
    type: requiredEnum(s, 'type', ['INCOME', 'EXPENSE'] as const),
    color: optionalString(s, 'color'),
    icon: optionalString(s, 'icon'),
  }))
  const recurring = list(body, 'recurringTransactions').map((i) => ({
    name: requiredString(i, 'name'),
    amount: toCents(requiredNumber(i, 'amount')),
    startDate: requiredDate(i, 'startDate'),
    ...categoryRef(i),
  }))
  const oneOff = list(body, 'oneOffTransactions').map((i) => ({
    occurredOn: requiredDate(i, 'occurredOn'),
    name: requiredString(i, 'name'),
    amount: toCents(requiredNumber(i, 'amount')),
    ...categoryRef(i),
  }))
  const checkpoints = list(body, 'balanceCheckpoints').map((c) => ({
    checkpointDate: requiredDate(c, 'checkpointDate'),
    balance: toCents(requiredNumber(c, 'balance')),
  }))

  if (!recurring.every(resolved) || !oneOff.every(resolved)) {
    throw badRequest("Ogni transazione deve avere una categoria assegnata prima di confermare l'importazione")
  }

  return db.transaction(() => {
    // Una categoria con quel nome che c'è già (anche archiviata) si riusa.
    const tempIdToCategoryId = new Map<string, string>()
    for (const s of suggestions) {
      const category =
        findCategoryByName(db, s.name) ??
        insertCategory(db, { name: s.name, type: s.type, color: s.color, icon: s.icon, parentId: null })
      tempIdToCategoryId.set(s.tempId, category.id)
    }
    const resolveCategoryId = (ref: CategoryRef): CategoryRow => {
      if (ref.existingCategoryId !== null) return findCategory(db, ref.existingCategoryId)
      const id = tempIdToCategoryId.get(ref.newCategoryTempId!)
      if (!id) throw badRequest('Riferimento a categoria sconosciuto: ' + ref.newCategoryTempId)
      return findCategory(db, id)
    }

    for (const item of recurring) {
      const category = resolveCategoryId(item)
      const id = newId()
      db.run(
        `INSERT INTO recurring_transactions (id, category_id, name, default_amount, interval_unit, interval_value,
           start_date, next_due_date, end_date, active, created_at)
         VALUES (:id, :categoryId, :name, :amount, 'MONTH', 1, :startDate, :startDate, NULL, 1, :now)`,
        { id, categoryId: category.id, name: item.name, amount: item.amount, startDate: item.startDate, now: nowIso() },
      )
      // Lo storico arretrato si genera subito, senza aspettare il prossimo giro dei job.
      processDueRule(db, id, today)
    }

    for (const item of oneOff) {
      const category = resolveCategoryId(item)
      db.run(
        `INSERT INTO transactions (id, category_id, amount, type, occurred_on, description, import_provisional, created_at)
         VALUES (:id, :categoryId, :amount, :type, :occurredOn, :name, 0, :now)`,
        {
          id: newId(),
          categoryId: category.id,
          amount: item.amount,
          type: category.type,
          occurredOn: item.occurredOn,
          name: item.name,
          now: nowIso(),
        },
      )
    }

    // I saldi dell'import valgono a inizio giornata: counts_from resta vuoto (vedi
    // countsAfterCheckpoint). Su un saldo esistente cambia solo l'importo.
    for (const c of checkpoints) {
      const existing = db.get<{ id: string }>('SELECT id FROM balance_checkpoints WHERE checkpoint_date = :date', {
        date: c.checkpointDate,
      })
      if (existing) {
        db.run('UPDATE balance_checkpoints SET balance = :balance WHERE id = :id', { id: existing.id, balance: c.balance })
      } else {
        db.run(
          `INSERT INTO balance_checkpoints (id, checkpoint_date, balance, counts_from, created_at)
           VALUES (:id, :date, :balance, NULL, :now)`,
          { id: newId(), date: c.checkpointDate, balance: c.balance, now: nowIso() },
        )
      }
    }

    // Come il backend: le transazioni di tutte le regole, non solo di quelle appena
    // create (se l'import ne ha create).
    const backfilled =
      recurring.length === 0
        ? 0
        : db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE recurring_transaction_id IS NOT NULL')!.n

    return {
      categoriesCreated: tempIdToCategoryId.size,
      recurringTransactionsCreated: recurring.length,
      transactionsCreated: oneOff.length + backfilled,
      checkpointsCreated: checkpoints.length,
    }
  })
}
