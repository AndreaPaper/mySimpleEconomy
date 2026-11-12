import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  categoriesApi,
  checkpointsApi,
  debtsApi,
  excelExportApi,
  excelImportApi,
  profileApi,
  recurringApi,
  transactionsApi,
} from '../../api/endpoints'
import type { ExcelImportPreviewResponse } from '../../api/types'
import { blobBytes } from '../blobs'
import { colorKeyOf, readDate, readNumeric, readString, roundToCents, themeColorsOf } from '../excel/cells'
import { parseDiary } from '../excel/diaryParser'
import { apiError, withFreshLocalBackend } from '../testing'
import {
  reload,
  setColoredBlank,
  setColoredText,
  setDate,
  setFormula,
  setNumeric,
  setText,
  toFile,
  workbook,
  type Sheet,
} from './xlsx'

// Parità della fase 4: gli scenari di ExcelSheetParserTest, PoiCellsTest,
// ExcelImportSmokeTest, ExcelImportCategoryGuessTest ed ExcelExportContentTest.

const backend = withFreshLocalBackend()

const ROSSO = 'FFFF7575'
const VERDE = 'FF8BF1BC'
const TODAY = '2026-11-12'

/** Le intestazioni delle due tabelle, "Fisse" a sinistra e "Non Fisse" a destra. */
function intestazioni(sheet: Sheet, riga: number) {
  setText(sheet, riga, 0, 'Data')
  setText(sheet, riga, 1, 'Nome')
  setText(sheet, riga, 2, 'Costo')
  setText(sheet, riga, 4, 'Data')
  setText(sheet, riga, 5, 'Nome')
  setText(sheet, riga, 6, 'Costo')
}

async function parse(wb: ExcelJS.Workbook) {
  return parseDiary(await reload(wb), TODAY)
}

describe('le letture di cella (PoiCells)', () => {
  it('readString legge solo le celle di testo', async () => {
    const wb = workbook('Foglio')
    const s = wb.worksheets[0]
    setText(s, 0, 0, 'Farmacia')
    setNumeric(s, 0, 1, 42)
    setText(s, 0, 2, '   ')
    const back = (await reload(wb)).worksheets[0]

    expect(readString(back.getCell(1, 1))).toBe('Farmacia')
    expect(readString(back.getCell(1, 2))).toBeNull()
    expect(readString(back.getCell(1, 3))).toBeNull()
    expect(readString(undefined)).toBeNull()
  })

  it('readDate riconosce una data dal formato della cella', async () => {
    const wb = workbook('Foglio')
    const s = wb.worksheets[0]
    setDate(s, 0, 0, '2026-03-02')
    // Il numero seriale del 2 marzo 2026, senza formato data.
    setNumeric(s, 0, 1, 46083)
    setText(s, 0, 2, '2026-03-02')
    const back = (await reload(wb)).worksheets[0]

    expect(readDate(back.getCell(1, 1))).toBe('2026-03-02')
    expect(readDate(back.getCell(1, 2))).toBeNull()
    expect(readDate(back.getCell(1, 3))).toBeNull()
    expect(readDate(undefined)).toBeNull()
  })

  it('readNumeric arrotonda al centesimo, e una data non è un importo', async () => {
    const wb = workbook('Foglio')
    const s = wb.worksheets[0]
    setNumeric(s, 0, 0, 42.456)
    setNumeric(s, 0, 1, 42.454)
    setDate(s, 0, 2, '2026-03-02')
    const back = (await reload(wb)).worksheets[0]

    expect(readNumeric(back.getCell(1, 1))).toBe(4246)
    expect(readNumeric(back.getCell(1, 2))).toBe(4245)
    expect(readNumeric(back.getCell(1, 3))).toBeNull()
  })

  // Come BigDecimal.valueOf: si arrotonda il numero come è scritto, non la sua
  // approssimazione binaria (1.005 in binario è un pelo sotto, e darebbe 1,00).
  it("l'arrotondamento segue la scrittura decimale, anche coi negativi", () => {
    expect(roundToCents(1.005)).toBe(101)
    expect(roundToCents(-1.005)).toBe(-101)
    expect(roundToCents(2.675)).toBe(268)
    expect(roundToCents(0.1 + 0.2)).toBe(30)
    expect(roundToCents(1e-7)).toBe(0)
  })

  // Una differenza voluta da POI, che ricalcola: qui vale il risultato salvato nel file.
  it('una formula vale il risultato salvato; senza risultato, o con un testo, è assente', async () => {
    const wb = workbook('Foglio')
    const s = wb.worksheets[0]
    setFormula(s, 0, 0, '35*2', 70)
    setFormula(s, 0, 1, '35*2')
    setFormula(s, 0, 2, '"totale"', 'totale')
    const back = (await reload(wb)).worksheets[0]

    expect(readNumeric(back.getCell(1, 1))).toBe(7000)
    expect(readNumeric(back.getCell(1, 2))).toBeNull()
    expect(readNumeric(back.getCell(1, 3))).toBeNull()
    // E il testo di una formula non è una cella di testo.
    expect(readString(back.getCell(1, 3))).toBeNull()
  })
})

describe('il parser del diario (ExcelSheetParser)', () => {
  it('legge le due tabelle di un foglio mensile', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setDate(s, 2, 0, '2026-03-05')
    setText(s, 2, 1, 'Affitto')
    setNumeric(s, 2, 2, 500)
    setDate(s, 2, 4, '2026-03-07')
    setText(s, 2, 5, 'Ekom')
    setNumeric(s, 2, 6, 42.5)

    const parsed = await parse(wb)

    expect(parsed.fisseRows).toEqual([
      { sheetName: 'Marzo', sheetIndex: 0, date: '2026-03-05', name: 'Affitto', amount: 50000 },
    ])
    expect(parsed.nonFisseRows).toEqual([
      { sheetName: 'Marzo', date: '2026-03-07', name: 'Ekom', amount: 4250, matchedCategoryLabel: null },
    ])
    expect(parsed.sheetsProcessed).toBe(1)
  })

  it('una voce fissa può non avere data, una non fissa no', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setText(s, 2, 1, 'Netflix')
    setNumeric(s, 2, 2, 12.99)
    setText(s, 2, 5, 'Spesa senza data')
    setNumeric(s, 2, 6, 30)

    const parsed = await parse(wb)

    expect(parsed.fisseRows.map((r) => r.date)).toEqual([null])
    expect(parsed.nonFisseRows).toEqual([])
  })

  // Come in Java, e documentato là: il foglio salta per intero ma viene contato.
  it("un foglio con l'intestazione oltre la quinta riga viene saltato, ma contato", async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 5)
    setDate(s, 6, 0, '2026-03-05')
    setText(s, 6, 1, 'Affitto')
    setNumeric(s, 6, 2, 500)

    const parsed = await parse(wb)

    expect(parsed.fisseRows).toEqual([])
    expect(parsed.sheetsProcessed).toBe(1)
  })

  it("l'intestazione alla quinta riga (indice 4) si trova ancora", async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 4)
    setText(s, 5, 1, 'Affitto')
    setNumeric(s, 5, 2, 500)

    expect((await parse(wb)).fisseRows.map((r) => r.name)).toEqual(['Affitto'])
  })

  it('la legenda dei colori assegna la categoria', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setDate(s, 2, 4, '2026-03-07')
    setColoredText(s, 2, 5, 'Ekom', ROSSO)
    setNumeric(s, 2, 6, 42.5)
    setDate(s, 3, 4, '2026-03-08')
    setColoredText(s, 3, 5, 'Farmacia', VERDE)
    setNumeric(s, 3, 6, 12)
    setColoredBlank(s, 2, 15, ROSSO)
    setText(s, 2, 16, 'Spese cibo')
    setColoredBlank(s, 3, 15, VERDE)
    setText(s, 3, 16, 'Salute')

    expect((await parse(wb)).nonFisseRows.map((r) => r.matchedCategoryLabel)).toEqual(['Spese cibo', 'Salute'])
  })

  // Lo stesso colore con due etichette: vale la prima trovata, riga per riga.
  it('a parità di colore in legenda vince la prima voce', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setDate(s, 2, 4, '2026-03-07')
    setColoredText(s, 2, 5, 'Ekom', ROSSO)
    setNumeric(s, 2, 6, 42.5)
    setColoredBlank(s, 2, 15, ROSSO)
    setText(s, 2, 16, 'Spese cibo')
    setColoredBlank(s, 3, 15, ROSSO)
    setText(s, 3, 16, 'Ristoranti')

    expect((await parse(wb)).nonFisseRows.map((r) => r.matchedCategoryLabel)).toEqual(['Spese cibo'])
  })

  it('un colore senza voce in legenda lascia la categoria vuota', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setDate(s, 2, 4, '2026-03-07')
    setColoredText(s, 2, 5, 'Ekom', ROSSO)
    setNumeric(s, 2, 6, 42.5)

    expect((await parse(wb)).nonFisseRows.map((r) => r.matchedCategoryLabel)).toEqual([null])
  })

  /**
   * I colori del tema. POI risolve l'indice del tema sul suo RGB e ignora la sfumatura
   * (getARGBHex non applica il tint): una cella "Blu, Colore 1" e la stessa più chiara
   * hanno la stessa chiave, ed è la stessa di una cella con quel blu scritto in RGB.
   */
  it('un colore del tema vale il suo RGB, sfumatura compresa', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    const accent1 = themeColorsOf(await reload(wb))[4]
    expect(accent1).toMatch(/^[0-9A-F]{6}$/i)
    intestazioni(s, 1)
    setDate(s, 2, 4, '2026-03-07')
    setColoredText(s, 2, 5, 'In RGB', `FF${accent1}`)
    setNumeric(s, 2, 6, 1)
    setDate(s, 3, 4, '2026-03-08')
    setColoredText(s, 3, 5, 'Dal tema', { theme: 4 })
    setNumeric(s, 3, 6, 2)
    setDate(s, 4, 4, '2026-03-09')
    setColoredText(s, 4, 5, 'Dal tema, più chiaro', { theme: 4, tint: 0.3999 })
    setNumeric(s, 4, 6, 3)
    setColoredBlank(s, 2, 15, { theme: 4 })
    setText(s, 2, 16, 'Casa')

    expect((await parse(wb)).nonFisseRows.map((r) => r.matchedCategoryLabel)).toEqual(['Casa', 'Casa', 'Casa'])
  })

  // L'ordine degli indici di POI scambia le prime due coppie del file: 0 è lt1 (lo sfondo
  // chiaro), 1 è dk1. Senza lo scambio "bianco" e "nero" si confonderebbero.
  it("gli indici del tema seguono l'ordine di POI (lt1, dk1, lt2, dk2, accent…)", async () => {
    const wb = await reload(workbook('Foglio'))
    const colors = themeColorsOf(wb)
    expect(colors).toHaveLength(12)
    const s = wb.worksheets[0]
    s.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 0 } as ExcelJS.Color }
    s.getCell(1, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 1 } as ExcelJS.Color }

    expect(colorKeyOf(s.getCell(1, 1), colors)).toBe('argb:FFFFFFFF')
    expect(colorKeyOf(s.getCell(1, 2), colors)).toBe('argb:FF000000')
  })

  it('legge saldo di inizio mese e stipendio, con la data dello stipendio', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setText(s, 8, 0, 'SALDO INIZIO MESE')
    setNumeric(s, 9, 0, 1200.5)
    setText(s, 10, 0, 'Stipendio')
    setDate(s, 11, 0, '2026-02-27')
    setNumeric(s, 11, 1, 1885.14)

    expect((await parse(wb)).periodStarts).toEqual([{ date: '2026-02-27', startBalance: 120050, salaryAmount: 188514 }])
  })

  it('un saldo senza la riga dello stipendio viene scartato', async () => {
    const wb = workbook('Marzo')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setText(s, 8, 0, 'SALDO INIZIO MESE')
    setNumeric(s, 9, 0, 1200.5)

    expect((await parse(wb)).periodStarts).toEqual([])
  })

  it('il foglio di stima dà il saldo (la riga più in basso) e resta fuori dal conteggio', async () => {
    const wb = workbook('Marzo', 'Stima 2025')
    intestazioni(wb.worksheets[0], 1)
    const stima = wb.worksheets[1]
    setText(stima, 0, 0, 'Mese')
    setText(stima, 1, 0, 'gennaio')
    setNumeric(stima, 1, 1, 1000)
    setText(stima, 2, 0, 'febbraio')
    setNumeric(stima, 2, 1, 1450.75)

    const parsed = await parse(wb)

    expect(parsed.checkpointDate).toBe('2025-02-01')
    expect(parsed.checkpointBalance).toBe(145075)
    expect(parsed.sheetsProcessed).toBe(1)
  })

  it("un foglio di stima senza anno nel nome ricade sull'anno corrente", async () => {
    const wb = workbook('Marzo', 'Stima')
    intestazioni(wb.worksheets[0], 1)
    const stima = wb.worksheets[1]
    setText(stima, 0, 0, 'Mese')
    setText(stima, 1, 0, 'gennaio')
    setNumeric(stima, 1, 1, 1000)

    expect((await parse(wb)).checkpointDate).toBe('2026-01-01')
  })

  // La prima riga presente si salta: è l'intestazione, anche se ha un mese valido.
  it('la prima riga del foglio di stima è sempre saltata', async () => {
    const wb = workbook('Marzo', 'Stima 2025')
    intestazioni(wb.worksheets[0], 1)
    const stima = wb.worksheets[1]
    setText(stima, 2, 0, 'marzo')
    setNumeric(stima, 2, 1, 500)

    expect((await parse(wb)).checkpointDate).toBeNull()
  })

  it('il foglio delle spese ricorrenti è escluso', async () => {
    const wb = workbook('Marzo', 'Spese ricorrenti')
    intestazioni(wb.worksheets[0], 1)
    intestazioni(wb.worksheets[1], 1)
    setText(wb.worksheets[1], 2, 1, 'Netflix')
    setNumeric(wb.worksheets[1], 2, 2, 12.99)

    const parsed = await parse(wb)

    expect(parsed.fisseRows).toEqual([])
    expect(parsed.sheetsProcessed).toBe(1)
  })

  it('una riga di stima con un mese irriconoscibile non contamina il saldo', async () => {
    const wb = workbook('Marzo', 'Stima 2025')
    intestazioni(wb.worksheets[0], 1)
    const stima = wb.worksheets[1]
    setText(stima, 0, 0, 'Mese')
    setText(stima, 1, 0, 'gennaio')
    setNumeric(stima, 1, 1, 1000)
    setText(stima, 2, 0, 'Totale')
    setNumeric(stima, 2, 1, 99999)

    const parsed = await parse(wb)

    expect(parsed.checkpointDate).toBe('2025-01-01')
    expect(parsed.checkpointBalance).toBe(100000)
  })

  it('un foglio senza tabelle non rompe nulla', async () => {
    const wb = workbook('Copertina')
    setText(wb.worksheets[0], 0, 0, 'Diario spese 2026')

    const parsed = await parse(wb)

    expect(parsed.fisseRows).toEqual([])
    expect(parsed.nonFisseRows).toEqual([])
    expect(parsed.checkpointDate).toBeNull()
  })
})

// --- Analisi e conferma, attraverso le API ------------------------------------------

/** Il diario di ExcelImportSmokeTest: due mesi, un foglio di stima e uno ignorato. */
function diarioCompleto(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  foglioMensile(wb, 'Gennaio', {
    spotifyDate: '2025-05-06',
    oneOff: ['2026-01-25', 'Gennaio', 300],
    ekom: ['2026-01-03', 18],
    farmacia: ['2026-01-05', 12],
    period: ['2025-12-27', 3550, 1659],
  })
  foglioMensile(wb, 'Febbraio', {
    spotifyDate: null,
    oneOff: ['2026-02-10', 'Bolletta enel', 172],
    ekom: ['2026-02-03', 20],
    farmacia: ['2026-02-06', 13],
    period: ['2026-01-27', 4390, 2042],
  })
  const stima = wb.addWorksheet('Stima 2026')
  setText(stima, 0, 0, 'Mese')
  setText(stima, 0, 1, 'START')
  setText(stima, 1, 0, 'Gennaio')
  setNumeric(stima, 1, 1, 3550)
  setText(stima, 2, 0, 'Febbraio')
  setNumeric(stima, 2, 1, 4390)
  setText(wb.addWorksheet('Spese ricorrenti'), 0, 0, "(ignorato dall'importer)")
  return wb
}

function foglioMensile(
  wb: ExcelJS.Workbook,
  name: string,
  m: {
    spotifyDate: string | null
    oneOff: [string, string, number]
    ekom: [string, number]
    farmacia: [string, number]
    period: [string, number, number]
  },
) {
  const s = wb.addWorksheet(name)
  intestazioni(s, 1)
  setDate(s, 2, 0, m.spotifyDate)
  setText(s, 2, 1, 'Spotify')
  setNumeric(s, 2, 2, 17)
  setText(s, 3, 1, 'Disney')
  setNumeric(s, 3, 2, 11)
  setText(s, 4, 0, 'Totale')
  setText(s, 5, 0, 'Debito papà')
  setDate(s, 6, 0, m.oneOff[0])
  setText(s, 6, 1, m.oneOff[1])
  setNumeric(s, 6, 2, m.oneOff[2])
  setDate(s, 2, 4, m.ekom[0])
  setColoredText(s, 2, 5, 'Ekom', ROSSO)
  setNumeric(s, 2, 6, m.ekom[1])
  setDate(s, 3, 4, m.farmacia[0])
  setColoredText(s, 3, 5, 'Farmacia', VERDE)
  setNumeric(s, 3, 6, m.farmacia[1])
  setColoredBlank(s, 2, 15, ROSSO)
  setText(s, 2, 16, 'Spese cibo')
  setColoredBlank(s, 3, 15, VERDE)
  setText(s, 3, 16, 'Farmacia')
  setText(s, 8, 0, 'SALDO INIZIO MESE')
  setNumeric(s, 9, 0, m.period[1])
  setText(s, 10, 0, 'Stipendio')
  setDate(s, 11, 0, m.period[0])
  setNumeric(s, 11, 1, m.period[2])
}

const analizza = async (wb: ExcelJS.Workbook) => excelImportApi.analyze(await toFile(wb))

describe("l'import del diario (ExcelImportSmokeTest)", () => {
  it("l'analisi propone regole, spese, categorie e saldi", async () => {
    const preview = await analizza(diarioCompleto())

    const nuova = (tempId: string) => ({ existingCategoryId: null, newCategoryTempId: tempId })
    const daAssegnare = { needsCategory: true, existingCategoryId: null, newCategoryTempId: null }
    expect(preview).toEqual({
      newCategorySuggestions: [
        { tempId: 'new-abbonamenti', name: 'Abbonamenti', type: 'EXPENSE', color: null },
        { tempId: 'new-spese-cibo', name: 'Spese cibo', type: 'EXPENSE', color: null },
        { tempId: 'new-farmacia', name: 'Farmacia', type: 'EXPENSE', color: null },
        { tempId: 'new-stipendio', name: 'Stipendio', type: 'INCOME', color: null },
      ],
      recurringTransactions: [
        // La data più vecchia del gruppo; senza date, il primo del mese del foglio.
        { name: 'Spotify', amount: 17, startDate: '2025-05-06', occurrenceCount: 2, ...nuova('new-abbonamenti') },
        { name: 'Disney', amount: 11, startDate: '2026-01-01', occurrenceCount: 2, ...nuova('new-abbonamenti') },
      ],
      oneOffTransactions: [
        { occurredOn: '2026-01-25', name: 'Gennaio', amount: 300, ...daAssegnare },
        { occurredOn: '2026-02-10', name: 'Bolletta enel', amount: 172, ...daAssegnare },
        { occurredOn: '2026-01-03', name: 'Ekom', amount: 18, needsCategory: false, ...nuova('new-spese-cibo') },
        { occurredOn: '2026-01-05', name: 'Farmacia', amount: 12, needsCategory: false, ...nuova('new-farmacia') },
        { occurredOn: '2026-02-03', name: 'Ekom', amount: 20, needsCategory: false, ...nuova('new-spese-cibo') },
        { occurredOn: '2026-02-06', name: 'Farmacia', amount: 13, needsCategory: false, ...nuova('new-farmacia') },
        { occurredOn: '2025-12-27', name: 'Stipendio', amount: 1659, needsCategory: false, ...nuova('new-stipendio') },
        { occurredOn: '2026-01-27', name: 'Stipendio', amount: 2042, needsCategory: false, ...nuova('new-stipendio') },
      ],
      balanceCheckpoints: [
        { checkpointDate: '2026-02-01', balance: 4390 },
        { checkpointDate: '2025-12-27', balance: 3550 },
        { checkpointDate: '2026-01-27', balance: 4390 },
      ],
      summary: {
        sheetsProcessed: 2,
        recurringDetected: 2,
        oneOffDetected: 8,
        categoriesToCreate: 4,
        itemsNeedingCategory: 2,
        checkpointsDetected: 3,
      },
    })
  })

  it('la conferma scrive tutto, e le regole recuperano subito lo storico', async () => {
    const preview = await analizza(diarioCompleto())
    preview.newCategorySuggestions.push({ tempId: 'new-varie', name: 'Varie', type: 'EXPENSE', color: null })
    for (const item of preview.oneOffTransactions) if (item.needsCategory) item.newCategoryTempId = 'new-varie'

    const result = await excelImportApi.commit(preview)

    const all = (await transactionsApi.list({ from: '1970-01-01', to: '2999-12-31' })).content
    const generated = all.filter((t) => t.recurringTransactionId !== null)
    expect(result).toEqual({
      categoriesCreated: 5,
      recurringTransactionsCreated: 2,
      transactionsCreated: 8 + generated.length,
      checkpointsCreated: 3,
    })
    expect(generated.length).toBeGreaterThan(2)
    const today = new Date().toLocaleDateString('sv-SE')
    const rules = await recurringApi.list()
    expect(rules).toHaveLength(2)
    for (const rule of rules) expect(rule.nextDueDate > today).toBe(true)
    // I saldi dell'import valgono a inizio giornata, e lo stipendio è un'entrata.
    expect((await checkpointsApi.list()).map((c) => c.checkpointDate)).toEqual(['2026-02-01', '2026-01-27', '2025-12-27'])
    const stipendi = all.filter((t) => t.description === 'Stipendio')
    expect(stipendi.map((t) => [t.type, t.categoryName])).toEqual([
      ['INCOME', 'Stipendio'],
      ['INCOME', 'Stipendio'],
    ])
  })

  it('un saldo già presente quel giorno si aggiorna invece di raddoppiare', async () => {
    await checkpointsApi.upsert({ checkpointDate: '2026-01-27', balance: 1 })
    const preview = await analizza(diarioCompleto())
    preview.oneOffTransactions = preview.oneOffTransactions.filter((i) => !i.needsCategory)

    await excelImportApi.commit(preview)

    const checkpoints = await checkpointsApi.list()
    expect(checkpoints.filter((c) => c.checkpointDate === '2026-01-27').map((c) => c.balance)).toEqual([4390])
    expect(checkpoints).toHaveLength(3)
    // Il saldo esistente tiene il suo momento di lettura; quelli nuovi valgono a inizio
    // giornata (counts_from vuoto), come i saldi scritti dall'import sul server.
    const countsFrom = backend()
      .db.all<{ checkpoint_date: string; counts_from: string | null }>(
        'SELECT checkpoint_date, counts_from FROM balance_checkpoints ORDER BY checkpoint_date',
      )
      .map((c) => [c.checkpoint_date, c.counts_from === null])
    expect(countsFrom).toEqual([
      ['2025-12-27', true],
      ['2026-01-27', false],
      ['2026-02-01', true],
    ])
  })

  it('una regola parte dalla data più vecchia fra i fogli, comunque siano ordinati', async () => {
    const wb = new ExcelJS.Workbook()
    for (const [nome, data] of [['Marzo', '2026-03-04'], ['Febbraio', '2026-02-04']]) {
      const s = wb.addWorksheet(nome)
      intestazioni(s, 1)
      setDate(s, 2, 0, data)
      setText(s, 2, 1, 'Palestra')
      setNumeric(s, 2, 2, 30)
    }

    expect((await analizza(wb)).recurringTransactions.map((r) => r.startDate)).toEqual(['2026-02-04'])
  })

  // Il saldo del foglio di stima e quello di inizio periodo nello stesso giorno: vince
  // quello del periodo, più preciso, ma resta al posto del primo (LinkedHashMap.put).
  it("a parità di giorno il saldo di inizio periodo sostituisce quello della stima", async () => {
    const wb = workbook('Marzo', 'Stima 2026')
    const s = wb.worksheets[0]
    intestazioni(s, 1)
    setText(s, 8, 0, 'SALDO INIZIO MESE')
    setNumeric(s, 9, 0, 1200)
    setText(s, 10, 0, 'Stipendio')
    setDate(s, 11, 0, '2026-02-01')
    const stima = wb.worksheets[1]
    setText(stima, 0, 0, 'Mese')
    setText(stima, 1, 0, 'febbraio')
    setNumeric(stima, 1, 1, 999)

    expect((await analizza(wb)).balanceCheckpoints).toEqual([{ checkpointDate: '2026-02-01', balance: 1200 }])
  })

  it('un file vuoto o illeggibile è un errore chiaro', async () => {
    expect(await apiError(excelImportApi.analyze(new File([], 'vuoto.xlsx')))).toEqual({
      status: 400,
      message: 'File mancante',
    })
    expect(await apiError(excelImportApi.analyze(new File(['non sono un excel'], 'finto.xlsx')))).toEqual({
      status: 400,
      message: 'Impossibile leggere il file Excel',
    })
  })
})

/** Un diario minimo con due mesi identici, come in ExcelImportCategoryGuessTest. */
function diarioConFisse(fisse: [string, number][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  for (const nome of ['Gennaio', 'Febbraio']) {
    const s = wb.addWorksheet(nome)
    intestazioni(s, 1)
    fisse.forEach(([voce, importo], i) => {
      setText(s, 2 + i, 1, voce)
      setNumeric(s, 2 + i, 2, importo)
    })
  }
  return wb
}

describe('le categorie proposte (ExcelImportCategoryGuessTest)', () => {
  it('smista gli abbonamenti, gli operatori e il resto', async () => {
    const preview = await analizza(
      diarioConFisse([
        ['Spotify', 11],
        ['Iliad', 9.99],
        ['Affitto garage', 60],
      ]),
    )

    expect(preview.newCategorySuggestions.map((c) => c.name)).toEqual(['Abbonamenti', 'Utenze', 'Fisso'])
  })

  // Anche con le maiuscole diverse, e solo fra quelle non archiviate.
  it('riusa una categoria esistente invece di proporne una nuova', async () => {
    const esistente = await categoriesApi.create({ name: 'abbonamenti', type: 'EXPENSE' })

    const preview = await analizza(diarioConFisse([['Spotify', 11]]))

    expect(preview.newCategorySuggestions).toEqual([])
    expect(preview.recurringTransactions[0].existingCategoryId).toBe(esistente.id)
    expect(preview.summary.itemsNeedingCategory).toBe(0)
  })

  it("una categoria archiviata non si propone, ma alla conferma si riusa invece di duplicarla", async () => {
    const archiviata = await categoriesApi.create({ name: 'Abbonamenti', type: 'EXPENSE' })
    await categoriesApi.archive(archiviata.id)

    const preview = await analizza(diarioConFisse([['Spotify', 11]]))
    expect(preview.newCategorySuggestions.map((c) => c.name)).toEqual(['Abbonamenti'])
    await excelImportApi.commit(preview)

    expect((await recurringApi.list())[0].categoryId).toBe(archiviata.id)
  })

  it('una voce senza categoria ferma la conferma', async () => {
    const carico: ExcelImportPreviewResponse = await analizza(diarioConFisse([['Spotify', 11]]))
    carico.recurringTransactions[0].existingCategoryId = null
    carico.recurringTransactions[0].newCategoryTempId = null

    expect(await apiError(excelImportApi.commit(carico))).toEqual({
      status: 400,
      message: "Ogni transazione deve avere una categoria assegnata prima di confermare l'importazione",
    })
    expect(await categoriesApi.list()).toEqual([])
  })

  it('un riferimento a una categoria che nessuno creerà ferma la conferma, senza scrivere nulla', async () => {
    const carico = await analizza(diarioConFisse([['Spotify', 11]]))
    carico.recurringTransactions[0].newCategoryTempId = 'mai-proposta'

    expect(await apiError(excelImportApi.commit(carico))).toEqual({
      status: 400,
      message: 'Riferimento a categoria sconosciuto: mai-proposta',
    })
    // Tutto o niente: la categoria proposta non resta creata a metà.
    expect(await categoriesApi.list()).toEqual([])
  })
})

// --- Export -------------------------------------------------------------------------

const MARZO = '2026-03-10'
const PERIOD_SHEETS_EXCLUDED = ['Riepilogo', 'Categorie', 'Ricorrenti e debiti', 'Andamento del saldo']

async function esporta(params?: { from?: string; to?: string; categoryId?: string }) {
  const blob = await excelExportApi.download(params)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blobBytes(blob))
  return wb
}

const sheet = (wb: ExcelJS.Workbook, name: string) => {
  const found = wb.getWorksheet(name)
  if (!found) throw new Error(`Foglio ${name} assente`)
  return found
}
const periodSheet = (wb: ExcelJS.Workbook) => wb.worksheets.find((s) => !PERIOD_SHEETS_EXCLUDED.includes(s.name))!

function rows(s: ExcelJS.Worksheet): ExcelJS.CellValue[][] {
  const out: ExcelJS.CellValue[][] = []
  s.eachRow({ includeEmpty: true }, (row, n) => {
    out[n - 1] = (row.values as ExcelJS.CellValue[]).slice(1)
  })
  return Array.from(out, (r) => r ?? [])
}
const labels = (s: ExcelJS.Worksheet) => rows(s).map((r) => r[0]).filter((v): v is string => typeof v === 'string')
const numbers = (s: ExcelJS.Worksheet) => rows(s).flat().filter((v): v is number => typeof v === 'number')
const valueOf = (s: ExcelJS.Worksheet, match: (label: string) => boolean) =>
  rows(s).find((r) => typeof r[0] === 'string' && match(r[0]))?.[1]
const rowAfter = (s: ExcelJS.Worksheet, header: string) => {
  const all = rows(s)
  return all[all.findIndex((r) => r[0] === header) + 1]
}
const rowNamed = (s: ExcelJS.Worksheet, name: string) => rows(s).find((r) => r[0] === name)!

const expenseCategory = async (name = `Uscite ${Math.random()}`) => (await categoriesApi.create({ name, type: 'EXPENSE' })).id
const incomeCategory = async () => (await categoriesApi.create({ name: 'Entrate', type: 'INCOME' })).id
const tx = (categoryId: string, occurredOn: string, amount: number, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') =>
  transactionsApi.create({ categoryId, occurredOn, amount, type, description: 'x' })

describe("l'export (ExcelExportContentTest)", () => {
  it("con l'obiettivo attivo il periodo porta obiettivo e scostamento", async () => {
    await profileApi.update({ savingsEnabled: true, savingsPercent: 20 })
    await tx(await incomeCategory(), MARZO, 1000, 'INCOME')
    await tx(await expenseCategory(), MARZO, 150)

    const periodo = periodSheet(await esporta())

    expect(valueOf(periodo, (l) => l.startsWith('Obiettivo del periodo'))).toBe(200)
    expect(labels(periodo)).toContain('Obiettivo del periodo (20% delle entrate)')
    expect(valueOf(periodo, (l) => l === 'Risparmiato (entrate − uscite)')).toBe(850)
    expect(valueOf(periodo, (l) => l === "Scarto dall'obiettivo")).toBe(650)
  })

  it('senza obiettivo il blocco del risparmio non compare', async () => {
    await tx(await incomeCategory(), MARZO, 1000, 'INCOME')

    expect(labels(periodSheet(await esporta())).some((l) => l.startsWith('Obiettivo del periodo'))).toBe(false)
  })

  it('il foglio Categorie somma le sottocategorie sotto la principale', async () => {
    const casa = await categoriesApi.create({ name: 'Casa', type: 'EXPENSE' })
    const bollette = await categoriesApi.create({ name: 'Bollette', type: 'EXPENSE', parentId: casa.id })
    const spesa = await categoriesApi.create({ name: 'Spesa', type: 'EXPENSE', parentId: casa.id })
    await tx(bollette.id, MARZO, 80)
    await tx(spesa.id, MARZO, 45)

    const categorie = sheet(await esporta(), 'Categorie')

    expect(labels(categorie)).toContain('Uscite')
    expect(rows(categorie).filter((r) => r.length > 0).slice(3)).toEqual([
      ['Casa', undefined, -125],
      [undefined, 'Bollette', -80, 1],
      [undefined, 'Spesa', -45, 1],
    ])
  })

  it('il foglio del periodo elenca le transazioni col segno e la categoria completa', async () => {
    const casa = await categoriesApi.create({ name: 'Casa', type: 'EXPENSE' })
    const bollette = await categoriesApi.create({ name: 'Bollette', type: 'EXPENSE', parentId: casa.id })
    await tx(bollette.id, MARZO, 80)

    const wb = await esporta()
    const periodo = periodSheet(wb)

    expect(periodo.name).toBe('Marzo 2026')
    expect(rowAfter(periodo, 'Data')).toEqual([new Date(Date.UTC(2026, 2, 10)), 'Casa › Bollette', 'Uscita', 'No', -80, 'x'])
    expect(periodo.autoFilter).toBeTruthy()
  })

  it('entrate e uscite hanno sezioni distinte', async () => {
    await tx(await incomeCategory(), MARZO, 1000, 'INCOME')
    await tx(await expenseCategory(), MARZO, 42.5)

    expect(labels(sheet(await esporta(), 'Categorie'))).toEqual(expect.arrayContaining(['Uscite', 'Entrate']))
  })

  it("l'andamento del saldo parte dal saldo registrato", async () => {
    await checkpointsApi.upsert({ checkpointDate: '2026-02-28', balance: 1000 })
    await tx(await expenseCategory(), MARZO, 150)

    const riga = rowAfter(sheet(await esporta(), 'Andamento del saldo'), 'Periodo')

    expect(riga[3]).toBe(1000)
    expect(riga[5]).toBe(-150)
    expect(riga[6]).toBe(850)
  })

  it('il filtro per data restringe il contenuto', async () => {
    const uscite = await expenseCategory()
    await tx(uscite, '2026-01-10', 10)
    await tx(uscite, MARZO, 42.5)

    const filtrato = await esporta({ from: '2026-03-01', to: '2026-03-31' })

    expect(filtrato.worksheets.map((s) => s.name)).not.toContain('Gennaio 2026')
    expect(numbers(sheet(filtrato, 'Categorie'))).toContain(-42.5)
    expect(numbers(sheet(filtrato, 'Categorie'))).not.toContain(-10)
  })

  it('il filtro per categoria tiene solo quella', async () => {
    const tenuta = await expenseCategory()
    const esclusa = await expenseCategory()
    await tx(tenuta, MARZO, 42.5)
    await tx(esclusa, MARZO, 99)

    const numeri = numbers(sheet(await esporta({ categoryId: tenuta }), 'Categorie'))

    expect(numeri).toContain(-42.5)
    expect(numeri).not.toContain(-99)
  })

  it('un file filtrato lo dichiara nel riepilogo, uno non filtrato no', async () => {
    await tx(await expenseCategory(), MARZO, 42.5)

    expect(labels(sheet(await esporta({ from: '2026-03-01' }), 'Riepilogo'))).toContain(
      'Contenuto filtrato: dal 01/03/2026.',
    )
    expect(labels(sheet(await esporta(), 'Riepilogo')).some((n) => n.includes('Contenuto filtrato'))).toBe(false)
  })

  it('il riepilogo ha una riga per periodo e il totale', async () => {
    await profileApi.update({ salaryDay: 27 })
    const uscite = await expenseCategory()
    await tx(uscite, '2026-02-26', 10)
    await tx(uscite, '2026-02-27', 20)
    await tx(await incomeCategory(), '2026-02-27', 1000, 'INCOME')

    const riepilogo = sheet(await esporta(), 'Riepilogo')

    expect(rowAfter(riepilogo, 'Periodo')).toEqual([
      'Febbraio 2026',
      new Date(Date.UTC(2026, 0, 27)),
      new Date(Date.UTC(2026, 1, 26)),
      0,
      -10,
      -10,
      1,
    ])
    expect(rowNamed(riepilogo, 'Totale')).toEqual(['Totale', undefined, undefined, 1000, -30, 970])
    expect(riepilogo.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 })
  })

  it('un utente senza dati ottiene un file valido', async () => {
    const vuoto = await esporta()

    expect(vuoto.worksheets.map((s) => s.name)).toEqual(PERIOD_SHEETS_EXCLUDED)
    expect(labels(sheet(vuoto, 'Ricorrenti e debiti'))).toEqual([
      'Regole ricorrenti attive',
      'Nessuna regola ricorrente attiva.',
      'Debiti e finanziamenti',
      'Nessun debito registrato.',
    ])
  })

  it('il foglio ricorrenti elenca le regole attive con cadenza e scadenza', async () => {
    const categoria = await expenseCategory()
    for (const [name, amount, unit, value] of [
      ['Affitto', 750, 'MONTH', 1],
      ['Spesa settimanale', 40, 'WEEK', 1],
      ['Assicurazione', 480, 'YEAR', 1],
      ['Manutenzione', 90, 'YEAR', 2],
    ] as const) {
      await recurringApi.create({
        categoryId: categoria,
        name,
        defaultAmount: amount,
        intervalUnit: unit,
        intervalValue: value,
        startDate: '2030-03-10',
        nextDueDate: '2030-03-10',
        endDate: null,
      })
    }

    const foglio = sheet(await esporta(), 'Ricorrenti e debiti')

    expect(rowNamed(foglio, 'Affitto').slice(2)).toEqual([750, 'ogni 1 mese', new Date(Date.UTC(2030, 2, 10))])
    expect(rows(foglio).map((r) => r[3])).toEqual(
      expect.arrayContaining(['ogni 1 settimana', 'ogni 1 anno', 'ogni 2 anni']),
    )
  })

  it('un debito senza rata lascia la cella vuota invece di scrivere zero', async () => {
    await debtsApi.create({ categoryId: await expenseCategory(), name: 'Prestito auto', totalAmount: 6000, monthlyPaymentAmount: 200 })
    await debtsApi.create({ categoryId: await expenseCategory(), name: 'Debito con un amico', totalAmount: 300 })

    const foglio = sheet(await esporta(), 'Ricorrenti e debiti')

    expect(rowNamed(foglio, 'Prestito auto')[5]).toBe(200)
    expect(rowNamed(foglio, 'Debito con un amico')[5]).toBeUndefined()
  })

  it('la nota di filtro nomina la categoria anche se non ha transazioni', async () => {
    const vuota = await expenseCategory('Categoria mai usata')

    expect(labels(sheet(await esporta({ categoryId: vuota }), 'Riepilogo'))).toContain(
      'Contenuto filtrato: solo Categoria mai usata.',
    )
  })
})
