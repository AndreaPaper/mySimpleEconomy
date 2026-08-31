package com.spesetracker.dto.bankimport;

import java.time.LocalDate;

public record BankImportSummary(
        int rowsInFile,
        LocalDate firstDate,
        LocalDate lastDate,
        int nuove,
        int giaImportate,
        int daAggiornare,
        int sospettiManuali,
        int sospettiRicorrenti,
        int escluse,
        int categorieDaMappare
) {
}
