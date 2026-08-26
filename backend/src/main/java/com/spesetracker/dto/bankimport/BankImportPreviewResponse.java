package com.spesetracker.dto.bankimport;

import java.util.List;

public record BankImportPreviewResponse(
        List<BankImportRowPreview> rows,
        // Categorie della banca senza corrispondenza: finché ce n'è una,
        // l'anteprima non può essere confermata.
        List<BankCategoryMappingDto> unmappedCategories,
        // Regole di esclusione già salvate, e quelle che l'app propone al primo
        // import guardando i dati (prelievi e giroconti verso sé stessi).
        List<BankImportExclusionDto> exclusions,
        List<BankImportExclusionDto> suggestedExclusions,
        BankImportSummary summary
) {
}
