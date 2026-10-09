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
        // Valorizzato per aggiornare una provvisoria già importata, o la transazione
        // generata da una regola ricorrente di cui la riga prende il posto.
        UUID updateTransactionId,
        // Valorizzato quando la riga prende il posto di un'occorrenza che la regola
        // non ha ancora generato: la regola, che passa alla scadenza dopo.
        UUID recurringTransactionId
) {
}
