package com.spesetracker.dto.bankimport;

import com.spesetracker.model.enums.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// Una riga dell'estratto conto come la vede l'utente nell'anteprima: già
// interpretata (tipo, descrizione, categoria) ma non ancora salvata.
public record BankImportRowPreview(
        int rowNumber,
        LocalDate occurredOn,
        String description,
        // Grezzi, rimandati indietro al commit: il fingerprint si ricalcola lì
        // da questi invece di fidarsi di quello che torna dal browser.
        String rawOperation,
        String rawDetails,
        String bankCategory,
        // Sempre positivo: il verso lo dice `type`, come per tutte le altre
        // transazioni dell'app.
        BigDecimal amount,
        TransactionType type,
        boolean provisional,
        BankImportOutcome outcome,
        // Null se la categoria della banca non è ancora mappata.
        UUID categoryId,
        // Valorizzato su AGGIORNA_PROVVISORIA, e su SOSTITUISCE_RICORRENTE quando la
        // regola l'ha già generata: la transazione da aggiornare.
        UUID matchedTransactionId,
        // Valorizzato su SOSTITUISCE_RICORRENTE quando la regola non ha ancora
        // generato la sua transazione: la regola di cui la riga prende il posto.
        UUID matchedRecurringId,
        // Per i due SOSPETTO_*: cosa cozza con questa riga, da mostrare accanto
        // così la decisione si prende avendo il confronto sotto gli occhi.
        String conflictDescription,
        // Proposta di partenza per la spunta nell'anteprima.
        boolean selectedByDefault
) {
}
