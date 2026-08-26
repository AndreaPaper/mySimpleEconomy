package com.spesetracker.dto.bankimport;

import com.spesetracker.model.enums.TransactionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// Corrispondenza fra una categoria della banca e una dell'utente.
// `categoryId` null con `doNotImport` true significa "scarta queste righe";
// null con `doNotImport` false significa "ancora da decidere".
public record BankCategoryMappingDto(
        @NotBlank String bankCategory,
        @NotNull TransactionType transactionType,
        UUID categoryId,
        boolean doNotImport,
        // Solo informativi, per la schermata di mappatura.
        int rowCount,
        String sampleDescription
) {
    public boolean isResolved() {
        return doNotImport || categoryId != null;
    }
}
