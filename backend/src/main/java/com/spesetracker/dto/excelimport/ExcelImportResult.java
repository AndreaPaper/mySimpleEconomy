package com.spesetracker.dto.excelimport;

public record ExcelImportResult(
        int categoriesCreated,
        int recurringTransactionsCreated,
        int transactionsCreated,
        boolean checkpointSet
) {
}
