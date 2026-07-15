package com.spesetracker.service.excelimport;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ParsedWorkbook(
        List<FisseRow> fisseRows,
        List<NonFisseRow> nonFisseRows,
        LocalDate checkpointDate,
        BigDecimal checkpointBalance,
        List<PeriodStart> periodStarts,
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

    // Coppia "SALDO INIZIO MESE" + "Stipendio" letta da un foglio mensile: per
    // l'utente il mese parte il 27 del mese precedente (giorno di arrivo dello
    // stipendio), quindi entrambi i valori condividono la stessa data - quella
    // riportata sulla riga dello stipendio (l'unica con una data esplicita).
    // startBalance o salaryAmount possono essere null se solo uno dei due è presente.
    public record PeriodStart(LocalDate date, BigDecimal startBalance, BigDecimal salaryAmount) {
    }
}
