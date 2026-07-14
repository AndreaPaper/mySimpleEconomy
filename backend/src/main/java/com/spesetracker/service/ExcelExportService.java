package com.spesetracker.service;

import com.spesetracker.model.Transaction;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

// Esporta le transazioni dell'utente (con filtri opzionali periodo/categoria) in un
// file .xlsx: backup personale e via di fuga verso un'analisi manuale in Excel.
@Service
@RequiredArgsConstructor
public class ExcelExportService {

    private static final LocalDate DEFAULT_FROM = LocalDate.of(1970, 1, 1);
    private static final String[] HEADERS = {"Data", "Categoria", "Tipo", "Importo", "Descrizione"};

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

        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Transazioni");

            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));

            Row header = sheet.createRow(0);
            for (int i = 0; i < HEADERS.length; i++) {
                header.createCell(i).setCellValue(HEADERS[i]);
            }

            int rowIndex = 1;
            for (Transaction transaction : transactions) {
                Row row = sheet.createRow(rowIndex++);

                Cell dateCell = row.createCell(0);
                dateCell.setCellValue(transaction.getOccurredOn());
                dateCell.setCellStyle(dateStyle);

                row.createCell(1).setCellValue(transaction.getCategory().getName());
                row.createCell(2).setCellValue(transaction.getType().name());
                row.createCell(3).setCellValue(transaction.getAmount().doubleValue());
                row.createCell(4).setCellValue(transaction.getDescription() != null ? transaction.getDescription() : "");
            }

            for (int i = 0; i < HEADERS.length; i++) {
                sheet.autoSizeColumn(i);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
