package com.spesetracker.service.excelimport;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ParsedWorkbook(
        List<FisseRow> fisseRows,
        List<NonFisseRow> nonFisseRows,
        LocalDate checkpointDate,
        BigDecimal checkpointBalance,
        int sheetsProcessed
) {

    // Riga della tabella "Fisse": la data può essere assente (voce ricorrente
    // statica ripetuta identica in ogni foglio, es. abbonamenti streaming).
    public record FisseRow(String sheetName, int sheetIndex, LocalDate date, String name, BigDecimal amount) {
    }

    // Riga della tabella "Non Fisse": ha sempre una data reale; matchedCategoryLabel
    // è la categoria risolta dalla legenda colore del foglio (null se non trovata).
    public record NonFisseRow(String sheetName, LocalDate date, String name, BigDecimal amount, String matchedCategoryLabel) {
    }
}
