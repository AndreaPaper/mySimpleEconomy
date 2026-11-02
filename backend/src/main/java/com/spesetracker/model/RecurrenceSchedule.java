package com.spesetracker.model;

import com.spesetracker.model.enums.IntervalUnit;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * La scadenza successiva di una regola ricorrente o di un promemoria.
 *
 * <p>Era {@code date.plusMonths(n)} sulla scadenza precedente, e un giorno accorciato
 * da un mese corto restava accorciato per sempre: il 31 gennaio diventava il 28
 * febbraio, poi il 28 marzo, il 28 aprile… La scadenza scivolava di tre giorni e non
 * tornava più. Qui il mese si calcola dalla scadenza precedente, ma il giorno da
 * quello che la regola voleva avere.
 *
 * <p>Regole e promemoria passano entrambi da qui, così i due calendari non possono
 * divergere.
 */
public final class RecurrenceSchedule {

    private RecurrenceSchedule() {
    }

    /**
     * @param date      la scadenza da cui partire
     * @param startDate la data di inizio della regola: il suo giorno è quello "voluto"
     *                  quando {@code date} è stato accorciato da un mese corto. Può essere null.
     */
    public static LocalDate next(LocalDate date, LocalDate startDate, IntervalUnit unit, int value) {
        return switch (unit) {
            case DAY -> date.plusDays(value);
            case WEEK -> date.plusWeeks(value);
            case MONTH -> onDay(YearMonth.from(date).plusMonths(value), intendedDay(date, startDate));
            case YEAR -> onDay(YearMonth.from(date).plusYears(value), intendedDay(date, startDate));
        };
    }

    /**
     * Il giorno che la scadenza voleva avere. Di solito è il suo. Ma se cade sull'ultimo
     * giorno del mese e la regola è nata su un giorno più avanti, è stata accorciata dal
     * mese (31 → 28 febbraio, 29 febbraio → 28 in un anno non bisestile): il giorno
     * voluto è quello della data di inizio.
     *
     * <p>Una scadenza spostata a mano su un giorno qualunque che non sia l'ultimo del
     * mese resta invece su quel giorno: è una scelta, non un accorciamento.
     */
    private static int intendedDay(LocalDate date, LocalDate startDate) {
        boolean lastDayOfMonth = date.getDayOfMonth() == date.lengthOfMonth();
        if (startDate != null && lastDayOfMonth && startDate.getDayOfMonth() > date.getDayOfMonth()) {
            return startDate.getDayOfMonth();
        }
        return date.getDayOfMonth();
    }

    /** Il giorno voluto in quel mese, o l'ultimo se il mese è più corto. */
    private static LocalDate onDay(YearMonth month, int day) {
        return month.atDay(Math.min(day, month.lengthOfMonth()));
    }
}
