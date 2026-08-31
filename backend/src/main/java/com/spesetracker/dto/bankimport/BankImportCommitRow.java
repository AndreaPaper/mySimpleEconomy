package com.spesetracker.dto.bankimport;

import com.spesetracker.model.enums.TransactionType;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// Una riga rimandata indietro dall'anteprima con la decisione presa. Porta con
// sé i campi grezzi perché il fingerprint viene ricalcolato qui: quello
// arrivato dal browser non è una fonte attendibile.
public record BankImportCommitRow(
        @NotNull LocalDate occurredOn,
        String rawOperation,
        String rawDetails,
        String bankCategory,
        @NotNull BigDecimal amount,
        @NotNull TransactionType type,
        boolean provisional,
        String description,
        UUID categoryId,
        // Valorizzato solo per aggiornare una provvisoria già importata.
        UUID updateTransactionId
) {
}
