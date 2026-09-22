package com.spesetracker.dto.forecast;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * La previsione di un periodo da stipendio a stipendio.
 *
 * <p>Si chiamava {@code MonthlyForecast} e il suo campo {@code yearMonth} era un
 * mese di calendario: la previsione era l'ultimo pezzo dell'app a ragionare per
 * mesi, mentre budget, risparmio, card "Spese per categoria" e foglio
 * "Andamento del saldo per periodo" dell'export contavano già da un accredito al
 * successivo. Con l'accredito il 15, la card "saldo a fine mese" della Dashboard
 * rispondeva sul 30 settembre mentre tutto il resto della pagina parlava del
 * periodo che finisce il 14 ottobre.
 *
 * <p>{@code period} segue la convenzione di {@link com.spesetracker.service.SalaryPeriods}:
 * il periodo prende il nome dal mese in cui <em>finisce</em>. Senza giorno di
 * stipendio configurato (o col giorno 1) il periodo coincide col mese di
 * calendario, e questi valori sono identici a quelli di prima.
 *
 * <p>{@code periodStart} e {@code periodEnd} viaggiano con la previsione perché
 * il frontend deve poter scrivere <em>quale</em> giorno è la fine del periodo
 * ("al 14 ottobre") senza ricalcolare i confini per conto suo: due calcoli dello
 * stesso confine sono due occasioni di non essere d'accordo.
 */
public record PeriodForecast(
        YearMonth period,
        LocalDate periodStart,
        LocalDate periodEnd,
        BigDecimal projectedIncome,
        BigDecimal projectedExpense,
        BigDecimal netBalance,
        BigDecimal runningBalance,
        List<CategoryAmount> categoryBreakdown
) {
}
