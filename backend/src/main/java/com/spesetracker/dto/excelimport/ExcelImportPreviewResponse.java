package com.spesetracker.dto.excelimport;

import java.util.List;

public record ExcelImportPreviewResponse(
        List<CategorySuggestion> newCategorySuggestions,
        List<RecurringImportItem> recurringTransactions,
        List<OneOffImportItem> oneOffTransactions,
        BalanceCheckpointImportItem balanceCheckpoint,
        ImportSummary summary
) {
}
