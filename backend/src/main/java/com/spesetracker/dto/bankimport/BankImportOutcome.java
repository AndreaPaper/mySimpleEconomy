package com.spesetracker.dto.bankimport;

// Cosa succede a una riga dell'estratto conto. Riguarda solo i doppioni e le
// esclusioni: la categoria è un'informazione a parte, perché una riga può
// benissimo essere nuova e avere una categoria ancora da mappare.
public enum BankImportOutcome {
    // Da importare: nessun riscontro con quello che c'è già.
    NUOVA,
    // Impronta identica già presente: era in un import precedente.
    GIA_IMPORTATA,
    // È la versione definitiva di un movimento importato quando era ancora
    // provvisorio: si aggiorna quello invece di crearne un altro.
    AGGIORNA_PROVVISORIA,
    // Somiglia a una transazione scritta a mano, o a più di una provvisoria:
    // decide l'utente, perché due spese uguali lo stesso giorno esistono.
    SOSPETTO_MANUALE,
    // Cade nel periodo di una regola ricorrente attiva che genera già la sua
    // transazione: importarla vorrebbe dire contarla due volte.
    SOSPETTO_RICORRENTE,
    // Presa da una regola di esclusione o da una categoria "non importare".
    ESCLUSA
}
