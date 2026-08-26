package com.spesetracker.service.bankimport;

import java.math.BigDecimal;
import java.time.LocalDate;

// Una riga dell'estratto conto, così com'è nel file. Nessuna interpretazione:
// il segno dell'importo è quello della banca e la categoria è la sua.
public record BankStatementRow(
        int rowNumber,
        LocalDate date,
        String operation,
        String details,
        String account,
        // Contabilizzazione = SI. Le righe non contabilizzate sono provvisorie:
        // la banca le riscrive quando diventano definitive.
        boolean booked,
        String bankCategory,
        BigDecimal amount
) {
    // Testo su cui si applicano le regole di esclusione e da cui si ricava la
    // descrizione: operazione e dettagli sono due metà della stessa frase.
    public String searchableText() {
        return ((operation == null ? "" : operation) + " " + (details == null ? "" : details)).trim();
    }
}
