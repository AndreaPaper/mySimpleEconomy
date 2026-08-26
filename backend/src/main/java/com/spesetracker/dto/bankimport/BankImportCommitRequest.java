package com.spesetracker.dto.bankimport;

import com.spesetracker.model.enums.BankSource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

// Solo le righe che l'utente ha effettivamente spuntato: quelle scartate non
// vengono nemmeno rimandate indietro.
public record BankImportCommitRequest(
        @NotNull BankSource source,
        @Valid @NotNull List<BankImportCommitRow> rows,
        // Mappature ed esclusioni da salvare per gli import successivi.
        @Valid @NotNull List<BankCategoryMappingDto> mappings,
        @Valid @NotNull List<BankImportExclusionDto> exclusions
) {
}
