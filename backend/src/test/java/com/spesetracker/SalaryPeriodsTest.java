package com.spesetracker;

import com.spesetracker.service.SalaryPeriods;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

// I confini dei periodi decidono in quale foglio dell'export finisce ogni
// transazione, e devono coincidere con quelli che il frontend usa per la
// Dashboard: un errore qui non rompe niente, sposta i numeri in silenzio.
class SalaryPeriodsTest {

    @Test
    void ilPeriodoPrendeIlNomeDalMeseInCuiFinisce() {
        // Accredito il 27: il periodo aperto il 27 giugno si chiama "luglio",
        // perche' e' il mese che quel denaro copre.
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 6, 27), 27)).isEqualTo(YearMonth.of(2026, 7));
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 7, 26), 27)).isEqualTo(YearMonth.of(2026, 7));
    }

    @Test
    void ilGiornoDelloStipendioApreIlPeriodoSuccessivo() {
        // Il giorno prima e il giorno stesso stanno in due periodi diversi: e'
        // il confine che l'export deve rispettare.
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 8, 26), 27)).isEqualTo(YearMonth.of(2026, 8));
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 8, 27), 27)).isEqualTo(YearMonth.of(2026, 9));
    }

    @Test
    void gliEstremiCopronoIlPeriodoSenzaBuchi() {
        YearMonth agosto = YearMonth.of(2026, 8);

        assertThat(SalaryPeriods.periodStart(agosto, 27)).isEqualTo(LocalDate.of(2026, 7, 27));
        assertThat(SalaryPeriods.periodEnd(agosto, 27)).isEqualTo(LocalDate.of(2026, 8, 26));

        // Il giorno dopo la fine e' l'inizio del periodo seguente: nessun buco,
        // nessuna sovrapposizione.
        assertThat(SalaryPeriods.periodStart(agosto.plusMonths(1), 27))
                .isEqualTo(SalaryPeriods.periodEnd(agosto, 27).plusDays(1));
    }

    @Test
    void ogniGiornoDelPeriodoRicadeNelPeriodoStesso() {
        YearMonth periodo = YearMonth.of(2026, 8);
        LocalDate start = SalaryPeriods.periodStart(periodo, 27);
        LocalDate end = SalaryPeriods.periodEnd(periodo, 27);

        for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
            assertThat(SalaryPeriods.periodOf(day, 27)).isEqualTo(periodo);
        }
    }

    @Test
    void unGiornoOltreLaFineDelMeseVieneTroncato() {
        // Accredito il 31: a febbraio cade il 28, altrimenti quel mese non
        // avrebbe alcun confine.
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 2, 28), 31)).isEqualTo(YearMonth.of(2026, 3));
        assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 2, 27), 31)).isEqualTo(YearMonth.of(2026, 2));
        assertThat(SalaryPeriods.periodStart(YearMonth.of(2026, 3), 31)).isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @Test
    void senzaGiornoDiStipendioIlPeriodoEIlMeseDiCalendario() {
        for (Integer salaryDay : new Integer[]{null, 1}) {
            assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 8, 1), salaryDay)).isEqualTo(YearMonth.of(2026, 8));
            assertThat(SalaryPeriods.periodOf(LocalDate.of(2026, 8, 31), salaryDay)).isEqualTo(YearMonth.of(2026, 8));
            assertThat(SalaryPeriods.periodStart(YearMonth.of(2026, 8), salaryDay)).isEqualTo(LocalDate.of(2026, 8, 1));
            assertThat(SalaryPeriods.periodEnd(YearMonth.of(2026, 8), salaryDay)).isEqualTo(LocalDate.of(2026, 8, 31));
        }
    }
}
