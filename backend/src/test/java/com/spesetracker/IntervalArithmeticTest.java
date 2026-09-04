package com.spesetracker;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.enums.IntervalUnit;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L'aritmetica degli intervalli, per entrambe le entità che ce l'hanno.
 *
 * <p>Fino a ieri solo {@code MONTH} veniva esercitato — ovunque: nei test, nella previsione,
 * nella regola dello stipendio. Gli altri tre valori sono selezionabili dall'utente e stanno
 * sul percorso caldo sia del motore di previsione sia del job notturno: un errore in uno di
 * quegli arm non dà errore, sposta una scadenza.
 *
 * <p>Test puro: nessun container, nessuno Spring.
 */
class IntervalArithmeticTest {

    private RecurringTransaction regola(IntervalUnit unita, int valore, LocalDate da) {
        return RecurringTransaction.builder()
                .intervalUnit(unita)
                .intervalValue((short) valore)
                .nextDueDate(da)
                .active(true)
                .build();
    }

    private ExpenseReminder promemoria(IntervalUnit unita, int valore, LocalDate da) {
        return ExpenseReminder.builder()
                .intervalUnit(unita)
                .intervalValue((short) valore)
                .nextDueDate(da)
                .active(true)
                .build();
    }

    private static final LocalDate PARTENZA = LocalDate.of(2026, 1, 15);

    @Test
    void leQuattroUnitaSpostanoLaDataComeDicono() {
        assertThat(regola(IntervalUnit.DAY, 10, PARTENZA).addInterval(PARTENZA))
                .isEqualTo(LocalDate.of(2026, 1, 25));
        assertThat(regola(IntervalUnit.WEEK, 2, PARTENZA).addInterval(PARTENZA))
                .isEqualTo(LocalDate.of(2026, 1, 29));
        assertThat(regola(IntervalUnit.MONTH, 1, PARTENZA).addInterval(PARTENZA))
                .isEqualTo(LocalDate.of(2026, 2, 15));
        assertThat(regola(IntervalUnit.YEAR, 1, PARTENZA).addInterval(PARTENZA))
                .isEqualTo(LocalDate.of(2027, 1, 15));
    }

    /**
     * Il 31 più un mese: {@code plusMonths} tronca all'ultimo giorno del mese di arrivo invece
     * di sconfinare a marzo. È il comportamento voluto per una rata "il 31", e va fissato perché
     * un'implementazione fatta a mano sbaglierebbe proprio qui.
     */
    @Test
    void ilTrentunoPiuUnMeseNonSconfinaNelMeseDopo() {
        LocalDate trentunoGennaio = LocalDate.of(2026, 1, 31);

        assertThat(regola(IntervalUnit.MONTH, 1, trentunoGennaio).addInterval(trentunoGennaio))
                .isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @Test
    void ilVentinoveFebbraioPiuUnAnnoCadeSulVentotto() {
        LocalDate bisestile = LocalDate.of(2024, 2, 29);

        assertThat(regola(IntervalUnit.YEAR, 1, bisestile).addInterval(bisestile))
                .isEqualTo(LocalDate.of(2025, 2, 28));
    }

    // advanceNextDueDate è addInterval applicata a sé stessa: muta l'entità.
    @Test
    void avanzareMutaLaScadenzaDellaRegola() {
        RecurringTransaction r = regola(IntervalUnit.WEEK, 1, PARTENZA);

        r.advanceNextDueDate();

        assertThat(r.getNextDueDate()).isEqualTo(LocalDate.of(2026, 1, 22));
    }

    // I promemoria hanno la stessa aritmetica, in una classe diversa: se una delle due
    // divergesse, scadenze e proiezioni non tornerebbero più fra loro.
    @Test
    void iPromemoriaUsanoLaStessaAritmetica() {
        for (IntervalUnit unita : IntervalUnit.values()) {
            assertThat(promemoria(unita, 3, PARTENZA).addInterval(PARTENZA))
                    .as("unità %s", unita)
                    .isEqualTo(regola(unita, 3, PARTENZA).addInterval(PARTENZA));
        }
    }

    @Test
    void unaRegolaSenzaDataDiFineEAttivaFinoAQuandoNonSiSpegne() {
        RecurringTransaction r = regola(IntervalUnit.MONTH, 1, PARTENZA);

        assertThat(r.isCurrentlyActive(PARTENZA.plusYears(5))).isTrue();

        r.setActive(false);
        assertThat(r.isCurrentlyActive(PARTENZA)).isFalse();
    }
}
