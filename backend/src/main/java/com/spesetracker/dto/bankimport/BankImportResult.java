package com.spesetracker.dto.bankimport;

public record BankImportResult(
        int importate,
        int aggiornate,
        int saltate,
        int mappatureSalvate,
        int esclusioniSalvate
) {
}
