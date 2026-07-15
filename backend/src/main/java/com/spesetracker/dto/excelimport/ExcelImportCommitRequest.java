package com.spesetracker.dto.excelimport;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

// Stesso payload restituito da /analyze, riportato indietro dal frontend con le
// categorie mancanti risolte (existingCategoryId o newCategoryTempId valorizzati).
public record ExcelImportCommitRequest(
        @Valid @NotNull List<CategorySuggestion> newCategorySuggestions,
        @Valid @NotNull List<RecurringImportItem> recurringTransactions,
        @Valid @NotNull List<OneOffImportItem> oneOffTransactions,
        @Valid @NotNull List<BalanceCheckpointImportItem> balanceCheckpoints
) {
}
