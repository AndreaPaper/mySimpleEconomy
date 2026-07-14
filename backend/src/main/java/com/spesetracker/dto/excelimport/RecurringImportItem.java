package com.spesetracker.dto.excelimport;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// Un elemento "Fisse" ricorrente in 2+ fogli mensili con lo stesso nome/importo
// (es. Spotify, Iliad, Disney): proposto come regola recurring_transaction.
public record RecurringImportItem(
        @NotBlank String name,
        @NotNull BigDecimal amount,
        @NotNull LocalDate startDate,
        int occurrenceCount,
        UUID existingCategoryId,
        String newCategoryTempId
) {
    public boolean hasCategoryResolved() {
        return existingCategoryId != null || newCategoryTempId != null;
    }
}
