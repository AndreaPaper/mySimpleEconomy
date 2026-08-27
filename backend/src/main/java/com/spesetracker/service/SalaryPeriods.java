package com.spesetracker.service;

import java.time.LocalDate;
import java.time.YearMonth;

// I periodi da stipendio a stipendio su cui ragiona tutta l'app: Dashboard,
// Risparmio e Budget non contano per mese di calendario ma dal giorno di
// accredito al giorno prima dell'accredito successivo.
//
// Porting fedele di frontend/src/utils/period.ts: le due implementazioni devono
// dare gli stessi confini, altrimenti l'export e la Dashboard direbbero due
// numeri diversi sugli stessi dati.
//
// Il periodo prende il nome dal mese in cui FINISCE, non da quello in cui
// comincia: con accredito il 27, il periodo 27 giugno - 26 luglio si chiama
// "Luglio", che e' come lo chiama chi lo vive.
public final class SalaryPeriods {

    private SalaryPeriods() {
    }

    // Giorno 1 e giorno assente si comportano entrambi come "mese di
    // calendario": e' il default per chi non ha configurato lo stipendio.
    private static boolean isCalendarMonth(Integer salaryDay) {
        return salaryDay == null || salaryDay == 1;
    }

    public static YearMonth periodOf(LocalDate date, Integer salaryDay) {
        YearMonth month = YearMonth.from(date);
        if (isCalendarMonth(salaryDay)) return month;
        // Un accredito il 31 in un mese di 30 giorni cade l'ultimo giorno utile,
        // altrimenti quel mese non avrebbe alcun periodo.
        int effectiveDay = Math.min(salaryDay, date.lengthOfMonth());
        return date.getDayOfMonth() >= effectiveDay ? month.plusMonths(1) : month;
    }

    public static LocalDate periodStart(YearMonth period, Integer salaryDay) {
        if (isCalendarMonth(salaryDay)) return period.atDay(1);
        YearMonth previous = period.minusMonths(1);
        return previous.atDay(Math.min(salaryDay, previous.lengthOfMonth()));
    }

    public static LocalDate periodEnd(YearMonth period, Integer salaryDay) {
        if (isCalendarMonth(salaryDay)) return period.atEndOfMonth();
        return period.atDay(Math.min(salaryDay, period.lengthOfMonth()) - 1);
    }

    // Comodita' per i chiamanti che hanno lo Short di User.
    public static Integer of(Short salaryDay) {
        return salaryDay == null ? null : salaryDay.intValue();
    }
}
