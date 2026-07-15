package com.spesetracker.service.excelimport;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Estrae i dati grezzi dal file Excel dell'utente (struttura scoperta manualmente:
// un foglio per mese con tabelle "Fisse"/"Non Fisse", un foglio "Spese ricorrenti"
// (ignorato: solo date, nessun importo) e un foglio "Stima <anno>" col saldo).
// Non fa alcuna interpretazione di business (ricorrenza, categorie): quello è
// compito di ExcelImportAnalysisService.
@Component
public class ExcelSheetParser {

    private static final Set<String> EXCLUDED_SHEETS = Set.of("Spese ricorrenti", "Stima 2026");
    private static final String STIMA_SHEET_PREFIX = "Stima";
    private static final Pattern YEAR_PATTERN = Pattern.compile("(\\d{4})");
    private static final List<String> ITALIAN_MONTHS = List.of(
            "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
            "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre");

    public ParsedWorkbook parse(InputStream inputStream) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(inputStream)) {
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();

            List<ParsedWorkbook.FisseRow> fisseRows = new ArrayList<>();
            List<ParsedWorkbook.NonFisseRow> nonFisseRows = new ArrayList<>();
            List<ParsedWorkbook.PeriodStart> periodStarts = new ArrayList<>();
            int sheetsProcessed = 0;

            for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
                Sheet sheet = workbook.getSheetAt(sheetIndex);
                String sheetName = sheet.getSheetName();
                if (EXCLUDED_SHEETS.contains(sheetName) || sheetName.startsWith(STIMA_SHEET_PREFIX)) {
                    continue;
                }
                sheetsProcessed++;

                List<TableHeader> headers = findTableHeaders(sheet);
                if (headers.isEmpty()) {
                    continue;
                }
                headers.sort(Comparator.comparingInt(h -> h.dataCol));

                Map<String, String> legend = readLegend(sheet, evaluator);

                TableHeader fisseHeader = headers.get(0);
                fisseRows.addAll(readFisseTable(sheet, sheetName, sheetIndex, fisseHeader, evaluator));

                if (headers.size() > 1) {
                    TableHeader nonFisseHeader = headers.get(1);
                    nonFisseRows.addAll(readNonFisseTable(sheet, sheetName, nonFisseHeader, evaluator, legend));
                }

                readPeriodStart(sheet, evaluator).ifPresent(periodStarts::add);
            }

            LocalDate checkpointDate = null;
            BigDecimal checkpointBalance = null;
            Sheet stimaSheet = findStimaSheet(workbook);
            if (stimaSheet != null) {
                var latest = readLatestBalance(stimaSheet, evaluator);
                if (latest != null) {
                    checkpointDate = latest.date();
                    checkpointBalance = latest.balance();
                }
            }

            return new ParsedWorkbook(fisseRows, nonFisseRows, checkpointDate, checkpointBalance, periodStarts, sheetsProcessed);
        }
    }

    // Cerca le etichette "SALDO INIZIO MESE" e "Stipendio" in colonna A (in qualunque
    // riga): per l'utente il valore si trova sempre nella riga subito sotto l'etichetta,
    // stessa colonna per il saldo, colonna A/B (data/importo) per lo stipendio. La data
    // dello stipendio è anche la data di inizio del "mese" dell'utente (parte il 27 del
    // mese precedente), quindi è la data che ancora entrambi i valori.
    private Optional<ParsedWorkbook.PeriodStart> readPeriodStart(Sheet sheet, FormulaEvaluator evaluator) {
        BigDecimal startBalance = null;
        LocalDate salaryDate = null;
        BigDecimal salaryAmount = null;

        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            String label = readString(row.getCell(0));
            if (label == null) continue;
            String normalized = label.trim().toLowerCase(Locale.ITALIAN);

            if (normalized.equals("saldo inizio mese")) {
                Row valueRow = sheet.getRow(r + 1);
                if (valueRow != null) {
                    startBalance = readNumeric(valueRow.getCell(0), evaluator);
                }
            } else if (normalized.equals("stipendio")) {
                Row valueRow = sheet.getRow(r + 1);
                if (valueRow != null) {
                    salaryDate = readDate(valueRow.getCell(0));
                    salaryAmount = readNumeric(valueRow.getCell(1), evaluator);
                }
            }
        }

        if (salaryDate == null) {
            return Optional.empty();
        }
        return Optional.of(new ParsedWorkbook.PeriodStart(salaryDate, startBalance, salaryAmount));
    }

    private record TableHeader(int headerRow, int dataCol, int nomeCol, int costoCol) {
    }

    private record LatestBalance(LocalDate date, BigDecimal balance) {
    }

    // Cerca celle di testo "Data" seguite da "Nome"/"Costo" nelle due colonne successive,
    // nelle prime righe del foglio. Una tabella per gruppo di colonne trovato.
    private List<TableHeader> findTableHeaders(Sheet sheet) {
        List<TableHeader> found = new ArrayList<>();
        int maxScanRow = Math.min(sheet.getLastRowNum(), 4);
        for (int r = sheet.getFirstRowNum(); r <= maxScanRow; r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            for (int c = row.getFirstCellNum(); c >= 0 && c < row.getLastCellNum(); c++) {
                String text = readString(row.getCell(c));
                if (text == null || !text.equalsIgnoreCase("Data")) continue;

                String nomeText = readString(row.getCell(c + 1));
                String costoText = readString(row.getCell(c + 2));
                if ("Nome".equalsIgnoreCase(nomeText) && "Costo".equalsIgnoreCase(costoText)) {
                    found.add(new TableHeader(r, c, c + 1, c + 2));
                }
            }
        }
        return found;
    }

    private List<ParsedWorkbook.FisseRow> readFisseTable(
            Sheet sheet, String sheetName, int sheetIndex, TableHeader header, FormulaEvaluator evaluator) {
        List<ParsedWorkbook.FisseRow> rows = new ArrayList<>();
        for (int r = header.headerRow() + 1; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;

            LocalDate date = readDate(row.getCell(header.dataCol()));
            String name = readString(row.getCell(header.nomeCol()));
            BigDecimal amount = readNumeric(row.getCell(header.costoCol()), evaluator);

            if (name != null && amount != null) {
                rows.add(new ParsedWorkbook.FisseRow(sheetName, sheetIndex, date, name.trim(), amount));
            }
        }
        return rows;
    }

    private List<ParsedWorkbook.NonFisseRow> readNonFisseTable(
            Sheet sheet, String sheetName, TableHeader header, FormulaEvaluator evaluator, Map<String, String> legend) {
        List<ParsedWorkbook.NonFisseRow> rows = new ArrayList<>();
        for (int r = header.headerRow() + 1; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;

            Cell nomeCell = row.getCell(header.nomeCol());
            LocalDate date = readDate(row.getCell(header.dataCol()));
            String name = readString(nomeCell);
            BigDecimal amount = readNumeric(row.getCell(header.costoCol()), evaluator);

            if (date != null && name != null && amount != null) {
                String colorKey = colorKeyOf(nomeCell);
                String category = colorKey != null ? legend.get(colorKey) : null;
                rows.add(new ParsedWorkbook.NonFisseRow(sheetName, date, name.trim(), amount, category));
            }
        }
        return rows;
    }

    // Legenda colore->categoria: colonna con lo swatch colorato (senza testo) seguita
    // dalla colonna con l'etichetta testuale, in qualunque punto del foglio.
    private Map<String, String> readLegend(Sheet sheet, FormulaEvaluator evaluator) {
        Map<String, String> legend = new HashMap<>();
        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            for (int c = row.getFirstCellNum(); c >= 0 && c < row.getLastCellNum() - 1; c++) {
                Cell swatchCell = row.getCell(c);
                Cell labelCell = row.getCell(c + 1);
                if (swatchCell == null || labelCell == null) continue;

                String colorKey = colorKeyOf(swatchCell);
                String label = readString(labelCell);
                if (colorKey != null && label != null && !label.isBlank()) {
                    legend.putIfAbsent(colorKey, label.trim());
                }
            }
        }
        return legend;
    }

    private Sheet findStimaSheet(Workbook workbook) {
        for (Sheet sheet : workbook) {
            if (sheet.getSheetName().startsWith(STIMA_SHEET_PREFIX)) {
                return sheet;
            }
        }
        return null;
    }

    // Ultimo saldo disponibile nel foglio di stima: colonna A = nome mese (italiano),
    // colonna B = saldo di partenza. Prende la riga più in basso con un valore B risolvibile.
    private LatestBalance readLatestBalance(Sheet sheet, FormulaEvaluator evaluator) {
        int year = extractYear(sheet.getSheetName());
        LatestBalance latest = null;

        for (int r = sheet.getFirstRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;

            String monthName = readString(row.getCell(0));
            BigDecimal balance = readNumeric(row.getCell(1), evaluator);
            if (monthName == null || balance == null) continue;

            int monthNumber = ITALIAN_MONTHS.indexOf(monthName.trim().toLowerCase(Locale.ITALIAN)) + 1;
            if (monthNumber == 0) continue;

            latest = new LatestBalance(LocalDate.of(year, monthNumber, 1), balance);
        }
        return latest;
    }

    private int extractYear(String sheetName) {
        Matcher matcher = YEAR_PATTERN.matcher(sheetName);
        if (matcher.find()) {
            return Integer.parseInt(matcher.group(1));
        }
        return LocalDate.now().getYear();
    }

    private String readString(Cell cell) {
        if (cell == null || cell.getCellType() != CellType.STRING) return null;
        String value = cell.getStringCellValue();
        return value.isBlank() ? null : value;
    }

    private LocalDate readDate(Cell cell) {
        if (cell == null || cell.getCellType() != CellType.NUMERIC) return null;
        if (!DateUtil.isCellDateFormatted(cell)) return null;
        return cell.getLocalDateTimeCellValue().toLocalDate();
    }

    private BigDecimal readNumeric(Cell cell, FormulaEvaluator evaluator) {
        if (cell == null) return null;
        try {
            CellType type = cell.getCellType();
            if (type == CellType.NUMERIC && !DateUtil.isCellDateFormatted(cell)) {
                return BigDecimal.valueOf(cell.getNumericCellValue()).setScale(2, java.math.RoundingMode.HALF_UP);
            }
            if (type == CellType.FORMULA) {
                CellValue value = evaluator.evaluate(cell);
                if (value != null && value.getCellType() == CellType.NUMERIC) {
                    return BigDecimal.valueOf(value.getNumberValue()).setScale(2, java.math.RoundingMode.HALF_UP);
                }
            }
        } catch (Exception ignored) {
            // cella non numerica/non valutabile: trattata come assente
        }
        return null;
    }

    // XSSFColor.getTheme() ritorna 0 (non null) anche per colori RGB diretti senza
    // alcun tema impostato, quindi non è affidabile per distinguere i colori. getARGBHex()
    // invece risolve sempre al colore finale effettivo, sia per RGB diretti sia per
    // colori tema con tint applicato: è l'unica chiave di cui serve.
    private String colorKeyOf(Cell cell) {
        CellStyle style = cell.getCellStyle();
        if (style == null) return null;
        Color fg = style.getFillForegroundColorColor();
        if (!(fg instanceof XSSFColor xssfColor)) return null;

        String argb = xssfColor.getARGBHex();
        return argb != null ? "argb:" + argb : null;
    }
}
