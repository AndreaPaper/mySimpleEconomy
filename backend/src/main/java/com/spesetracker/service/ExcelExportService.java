package com.spesetracker.service;

import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

// Esporta le transazioni dell'utente (con filtri opzionali periodo/categoria) in un
// file .xlsx: backup personale e via di fuga verso un'analisi manuale in Excel.
// Un foglio "Riepilogo" con i totali per mese, poi un foglio per ogni mese con le
// singole transazioni e i totali (entrate/uscite/netto + per categoria) in coda.
@Service
@RequiredArgsConstructor
public class ExcelExportService {

    private static final LocalDate DEFAULT_FROM = LocalDate.of(1970, 1, 1);
    private static final String[] TRANSACTION_HEADERS = {"Data", "Categoria", "Tipo", "Ricorrente", "Importo", "Descrizione"};
    private static final DateTimeFormatter SHEET_NAME_FORMAT = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ITALIAN);

    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public byte[] export(UUID userId, LocalDate from, LocalDate to, UUID categoryId) {
        LocalDate effectiveFrom = from != null ? from : DEFAULT_FROM;
        LocalDate effectiveTo = to != null ? to : LocalDate.now();

        List<Transaction> transactions = categoryId != null
                ? transactionRepository.findByUserIdAndCategoryIdAndOccurredOnBetween(userId, categoryId, effectiveFrom, effectiveTo)
                : transactionRepository.findByUserIdAndOccurredOnBetween(userId, effectiveFrom, effectiveTo);

        transactions = transactions.stream()
                .sorted(Comparator.comparing(Transaction::getOccurredOn))
                .toList();

        Map<YearMonth, List<Transaction>> byMonth = new TreeMap<>();
        for (Transaction t : transactions) {
            byMonth.computeIfAbsent(YearMonth.from(t.getOccurredOn()), k -> new ArrayList<>()).add(t);
        }

        try (Workbook workbook = new XSSFWorkbook()) {
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));

            CellStyle currencyStyle = workbook.createCellStyle();
            currencyStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("#,##0.00 €"));

            Font boldFont = workbook.createFont();
            boldFont.setBold(true);

            CellStyle boldStyle = workbook.createCellStyle();
            boldStyle.setFont(boldFont);

            CellStyle boldCurrencyStyle = workbook.createCellStyle();
            boldCurrencyStyle.setFont(boldFont);
            boldCurrencyStyle.setDataFormat(currencyStyle.getDataFormat());

            writeSummarySheet(workbook, byMonth, boldStyle, currencyStyle);

            for (Map.Entry<YearMonth, List<Transaction>> entry : byMonth.entrySet()) {
                writeMonthSheet(workbook, entry.getKey(), entry.getValue(), dateStyle, currencyStyle, boldStyle, boldCurrencyStyle);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private String sheetName(YearMonth month) {
        String raw = SHEET_NAME_FORMAT.format(month.atDay(1));
        return Character.toUpperCase(raw.charAt(0)) + raw.substring(1);
    }

    private void writeSummarySheet(Workbook workbook, Map<YearMonth, List<Transaction>> byMonth, CellStyle boldStyle, CellStyle currencyStyle) {
        Sheet sheet = workbook.createSheet("Riepilogo");
        String[] headers = {"Mese", "Entrate", "Uscite", "Netto"};

        Row header = sheet.createRow(0);
        for (int i = 0; i < headers.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(boldStyle);
        }

        int rowIndex = 1;
        for (Map.Entry<YearMonth, List<Transaction>> entry : byMonth.entrySet()) {
            BigDecimal income = sumByType(entry.getValue(), TransactionType.INCOME);
            BigDecimal expense = sumByType(entry.getValue(), TransactionType.EXPENSE);

            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(sheetName(entry.getKey()));
            writeCurrency(row.createCell(1), income, currencyStyle);
            writeCurrency(row.createCell(2), expense, currencyStyle);
            writeCurrency(row.createCell(3), income.subtract(expense), currencyStyle);
        }

        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private void writeMonthSheet(
            Workbook workbook,
            YearMonth month,
            List<Transaction> transactions,
            CellStyle dateStyle,
            CellStyle currencyStyle,
            CellStyle boldStyle,
            CellStyle boldCurrencyStyle
    ) {
        Sheet sheet = workbook.createSheet(sheetName(month));

        Row header = sheet.createRow(0);
        for (int i = 0; i < TRANSACTION_HEADERS.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(TRANSACTION_HEADERS[i]);
            cell.setCellStyle(boldStyle);
        }

        int rowIndex = 1;
        for (Transaction t : transactions) {
            Row row = sheet.createRow(rowIndex++);

            Cell dateCell = row.createCell(0);
            dateCell.setCellValue(t.getOccurredOn());
            dateCell.setCellStyle(dateStyle);

            row.createCell(1).setCellValue(t.getCategory().getName());
            row.createCell(2).setCellValue(t.getType().name());
            row.createCell(3).setCellValue(t.getRecurringTransaction() != null ? "Sì" : "No");
            writeCurrency(row.createCell(4), t.getAmount(), currencyStyle);
            row.createCell(5).setCellValue(t.getDescription() != null ? t.getDescription() : "");
        }

        rowIndex++;

        BigDecimal income = sumByType(transactions, TransactionType.INCOME);
        BigDecimal expense = sumByType(transactions, TransactionType.EXPENSE);

        rowIndex = writeTotalRow(sheet, rowIndex, "Totale entrate", income, boldStyle, boldCurrencyStyle);
        rowIndex = writeTotalRow(sheet, rowIndex, "Totale uscite", expense, boldStyle, boldCurrencyStyle);
        rowIndex = writeTotalRow(sheet, rowIndex, "Saldo netto", income.subtract(expense), boldStyle, boldCurrencyStyle);

        rowIndex++;

        Cell categoryHeaderCell = sheet.createRow(rowIndex++).createCell(0);
        categoryHeaderCell.setCellValue("Totali per categoria");
        categoryHeaderCell.setCellStyle(boldStyle);

        Map<String, BigDecimal> totalByCategory = new LinkedHashMap<>();
        Map<String, TransactionType> typeByCategory = new LinkedHashMap<>();
        for (Transaction t : transactions) {
            String name = t.getCategory().getName();
            totalByCategory.merge(name, t.getAmount(), BigDecimal::add);
            typeByCategory.putIfAbsent(name, t.getType());
        }

        List<String> categoriesByAmountDesc = totalByCategory.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .map(Map.Entry::getKey)
                .toList();

        for (String categoryName : categoriesByAmountDesc) {
            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(categoryName + " (" + typeByCategory.get(categoryName).name() + ")");
            writeCurrency(row.createCell(1), totalByCategory.get(categoryName), currencyStyle);
        }

        for (int i = 0; i < TRANSACTION_HEADERS.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private int writeTotalRow(Sheet sheet, int rowIndex, String label, BigDecimal amount, CellStyle boldStyle, CellStyle boldCurrencyStyle) {
        Row row = sheet.createRow(rowIndex++);

        Cell labelCell = row.createCell(0);
        labelCell.setCellValue(label);
        labelCell.setCellStyle(boldStyle);

        writeCurrency(row.createCell(1), amount, boldCurrencyStyle);
        return rowIndex;
    }

    private void writeCurrency(Cell cell, BigDecimal amount, CellStyle style) {
        cell.setCellValue(amount.doubleValue());
        cell.setCellStyle(style);
    }

    private BigDecimal sumByType(List<Transaction> transactions, TransactionType type) {
        return transactions.stream()
                .filter(t -> t.getType() == type)
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
