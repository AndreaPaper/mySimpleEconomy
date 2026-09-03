package com.spesetracker;

import com.spesetracker.job.ExpenseReminderAdvancementService;
import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L'avanzamento della prossima scadenza di un promemoria. A differenza delle ricorrenti qui
 * non si crea nulla: il job sposta solo il puntatore. È però l'unico posto dove le unità
 * diverse dal mese vengono davvero esercitate — {@code DAY} e {@code YEAR} altrove non
 * compaiono mai — e un promemoria che smette di avanzare resta fermo in cima all'elenco
 * senza che nulla lo segnali.
 */
class ExpenseReminderAdvancementTest extends AbstractIntegrationTest {

    @Autowired
    private ExpenseReminderAdvancementService advancementService;

    @Autowired
    private ExpenseReminderRepository expenseReminderRepository;

    private UUID promemoria(LocalDate nextDue, String unita, int valore, LocalDate endDate) throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        return UUID.fromString(api.createReminder(
                token, categoryId, "Bollo auto", nextDue, unita, valore, null, endDate, null));
    }

    private ExpenseReminder ricarica(UUID id) {
        return expenseReminderRepository.findById(id).orElseThrow();
    }

    /**
     * Il ciclo, non un singolo passo: un promemoria rimasto indietro di mesi deve arrivare in
     * un colpo solo alla prima scadenza futura. Avanzando di una sola occorrenza per esecuzione
     * servirebbero mesi di job giornalieri per recuperarlo.
     */
    @Test
    void recuperaTutteLeScadenzeArretrateInUnaVolta() throws Exception {
        UUID id = promemoria(LocalDate.of(2026, 1, 10), "MONTH", 1, null);

        advancementService.advanceDueReminder(id, LocalDate.of(2026, 4, 14));

        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(ricarica(id).getActive()).isTrue();
    }

    // Il giorno esatto della scadenza è già "dovuto": si avanza. Con un `isBefore` al posto
    // di `!isAfter` il promemoria resterebbe fermo per un giorno intero.
    @Test
    void ilGiornoStessoDellaScadenzaAvanza() throws Exception {
        LocalDate scadenza = LocalDate.of(2026, 3, 10);
        UUID id = promemoria(scadenza, "MONTH", 1, null);

        advancementService.advanceDueReminder(id, scadenza);

        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 4, 10));
    }

    @Test
    void unaScadenzaFuturaRestaDovEra() throws Exception {
        LocalDate scadenza = LocalDate.of(2026, 3, 10);
        UUID id = promemoria(scadenza, "MONTH", 1, null);

        advancementService.advanceDueReminder(id, scadenza.minusDays(1));

        assertThat(ricarica(id).getNextDueDate()).isEqualTo(scadenza);
    }

    @Test
    void avanzaDiAnniQuandoLUnitaEAnnuale() throws Exception {
        UUID id = promemoria(LocalDate.of(2024, 5, 20), "YEAR", 1, null);

        advancementService.advanceDueReminder(id, LocalDate.of(2026, 6, 1));

        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2027, 5, 20));
    }

    // Il valore dell'intervallo conta quanto l'unità: ogni 10 giorni, non ogni giorno.
    @Test
    void avanzaAPassiQuandoLUnitaEGiornaliera() throws Exception {
        UUID id = promemoria(LocalDate.of(2026, 3, 1), "DAY", 10, null);

        advancementService.advanceDueReminder(id, LocalDate.of(2026, 3, 25));

        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    }

    /**
     * Superata la data di fine il promemoria si spegne da sé. Il ciclo non parte nemmeno,
     * quindi la scadenza resta quella vecchia: è corretto, perché un promemoria disattivato
     * non compare più negli elenchi e la sua scadenza non viene più letta.
     */
    @Test
    void superataLaDataDiFineSiDisattiva() throws Exception {
        UUID id = promemoria(LocalDate.of(2026, 1, 10), "MONTH", 1, LocalDate.of(2026, 2, 20));

        advancementService.advanceDueReminder(id, LocalDate.of(2026, 4, 14));

        assertThat(ricarica(id).getActive()).isFalse();
        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 1, 10));
    }

    // Lo stesso fuori-di-uno delle ricorrenti: il giorno della data di fine è ancora buono.
    @Test
    void ilGiornoDellaDataDiFineEAncoraAttivo() throws Exception {
        LocalDate fine = LocalDate.of(2026, 3, 10);
        UUID id = promemoria(LocalDate.of(2026, 3, 10), "MONTH", 1, fine);

        advancementService.advanceDueReminder(id, fine);

        assertThat(ricarica(id).getActive()).isTrue();
        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 4, 10));
    }

    @Test
    void unPromemoriaInesistenteNonFaEsplodereIlJob() {
        advancementService.advanceDueReminder(UUID.randomUUID(), LocalDate.of(2026, 4, 14));
    }
}
