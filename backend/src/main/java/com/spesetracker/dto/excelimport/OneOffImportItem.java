package com.spesetracker.dto.excelimport;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// Una spesa puntuale: o una riga "Non Fisse" colorata, o una riga del blocco
// "Debito papà"/bollette (nessun colore disponibile, categoria da assegnare).
public record OneOffImportItem(
        @NotNull LocalDate occurredOn,
        @NotBlank String name,
        @NotNull BigDecimal amount,
        boolean needsCategory,
        UUID existingCategoryId,
        String newCategoryTempId
) {
    public boolean hasCategoryResolved() {
        return existingCategoryId != null || newCategoryTempId != null;
    }
}
