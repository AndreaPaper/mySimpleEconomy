package com.spesetracker;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.RecurrenceSchedule;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.enums.IntervalUnit;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le scadenze successive di regole e promemoria. Niente Spring né database: è solo
 * calendario, e il calendario si sbaglia ai bordi — fine mese, febbraio, anni
 * bisestili.
 *
 * <p>Il difetto che motiva la classe: la scadenza si calcolava con plusMonths sulla
 * precedente, e una regola del 31 diventava del 28 dopo febbraio, per sempre.
 */
class RecurrenceScheduleTest {

    private static List<LocalDate> catena(LocalDate prima, LocalDate inizio, IntervalUnit unita, int passi) {
        List<LocalDate> date = new ArrayList<>();
        LocalDate d = prima;
        for (int i = 0; i < passi; i++) {
            d = RecurrenceSchedule.next(d, inizio, unita, 1);
            date.add(d);
        }
        return date;
    }

    @Test
    void unaRegolaDel31TornaAl31DopoFebbraio() {
        LocalDate inizio = LocalDate.of(2026, 1, 31);

        assertThat(catena(inizio, inizio, IntervalUnit.MONTH, 6)).containsExactly(
                LocalDate.of(2026, 2, 28), LocalDate.of(2026, 3, 31), LocalDate.of(2026, 4, 30),
                LocalDate.of(2026, 5, 31), LocalDate.of(2026, 6, 30), LocalDate.of(2026, 7, 31));
    }

    @Test
    void unaRegolaDel30TornaAl30() {
        LocalDate inizio = LocalDate.of(2026, 1, 30);

        assertThat(catena(inizio, inizio, IntervalUnit.MONTH, 2))
                .containsExactly(LocalDate.of(2026, 2, 28), LocalDate.of(2026, 3, 30));
    }

    // Il 29 febbraio annuale: 28 negli anni normali, di nuovo 29 nel bisestile.
    @Test
    void unAnnualeDel29FebbraioTornaAl29NegliAnniBisestili() {
        LocalDate inizio = LocalDate.of(2028, 2, 29);

        assertThat(catena(inizio, inizio, IntervalUnit.YEAR, 4)).containsExactly(
                LocalDate.of(2029, 2, 28), LocalDate.of(2030, 2, 28),
                LocalDate.of(2031, 2, 28), LocalDate.of(2032, 2, 29));
    }

    /**
     * Una scadenza spostata a mano su un giorno che non è l'ultimo del mese resta su quel
     * giorno: è una scelta, non un accorciamento, e la data di inizio non la scavalca.
     */
    @Test
    void unaScadenzaSpostataAManoRestaDovEStata() {
        assertThat(RecurrenceSchedule.next(LocalDate.of(2026, 3, 15), LocalDate.of(2026, 1, 31), IntervalUnit.MONTH, 1))
                .isEqualTo(LocalDate.of(2026, 4, 15));
    }

    // Senza data di inizio non c'è modo di sapere che il 28 era un 31: resta il 28.
    @Test
    void senzaDataDiInizioIlGiornoResta() {
        assertThat(RecurrenceSchedule.next(LocalDate.of(2026, 2, 28), null, IntervalUnit.MONTH, 1))
                .isEqualTo(LocalDate.of(2026, 3, 28));
    }

    @Test
    void giorniESettimaneNonCambiano() {
        LocalDate d = LocalDate.of(2026, 1, 31);

        assertThat(RecurrenceSchedule.next(d, d, IntervalUnit.DAY, 3)).isEqualTo(LocalDate.of(2026, 2, 3));
        assertThat(RecurrenceSchedule.next(d, d, IntervalUnit.WEEK, 2)).isEqualTo(LocalDate.of(2026, 2, 14));
    }

    /**
     * Regole e promemoria usano lo stesso calcolo: se uno dei due tornasse a plusMonths,
     * la previsione e il job sbaglierebbero in silenzio solo per lui.
     */
    @Test
    void regoleEPromemoriaUsanoEntrambiIlCalcolo() {
        LocalDate inizio = LocalDate.of(2026, 1, 31);
        RecurringTransaction regola = RecurringTransaction.builder()
                .intervalUnit(IntervalUnit.MONTH).intervalValue((short) 1).startDate(inizio).build();
        ExpenseReminder promemoria = ExpenseReminder.builder()
                .intervalUnit(IntervalUnit.MONTH).intervalValue((short) 1).startDate(inizio).build();

        assertThat(regola.addInterval(LocalDate.of(2026, 2, 28))).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(promemoria.addInterval(LocalDate.of(2026, 2, 28))).isEqualTo(LocalDate.of(2026, 3, 31));
    }
}
