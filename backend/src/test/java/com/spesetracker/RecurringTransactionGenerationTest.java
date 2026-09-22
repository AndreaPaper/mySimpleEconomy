package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.job.RecurringTransactionGenerationService;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringOverrideRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.UserRepository;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La generazione delle transazioni da una regola ricorrente. È il job che scrive davvero
 * in archivio: se sbaglia il conteggio delle occorrenze l'utente si ritrova spese doppie o
 * mancanti, e non ha modo di accorgersene se non contandole a mano.
 *
 * <p>Tutte le date sono fisse e passate al job come parametro {@code today}: il recupero
 * degli arretrati si misura in mesi, e con {@code LocalDate.now()} il risultato cambierebbe
 * a seconda del giorno in cui gira la suite.
 *
 * <p>È l'unica famiglia di test della suite che costruisce lo stato via repository invece che
 * via API, e per una ragione precisa: {@code POST /api/recurring-transactions} chiama subito
 * {@code processDueRule(..., LocalDate.now())}, quindi una regola creata via API ha già
 * recuperato i propri arretrati prima che il test possa osservarli. Passando dal repository la
 * scadenza resta dove serve, e il job viene esercitato una volta sola, dal test.
 */
class RecurringTransactionGenerationTest extends AbstractIntegrationTest {

    private static final LocalDate GENNAIO = LocalDate.of(2026, 1, 15);

    @Autowired
    private RecurringTransactionGenerationService generationService;

    @Autowired
    private RecurringTransactionRepository recurringTransactionRepository;

    @Autowired
    private RecurringOverrideRepository recurringOverrideRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private UserRepository userRepository;

    /** Un utente nuovo con una categoria di uscita, entrambi creati via API. */
    private record Scenario(String token, User user, Category category) {
    }

    private Scenario scenario() throws Exception {
        String email = "recurring+" + UUID.randomUUID() + "@example.com";
        String token = api.registerAndLogin(email, "password123");
        String nome = "Uscita-" + UUID.randomUUID();
        api.createCategory(token, nome, "EXPENSE");
        User user = userRepository.findByEmail(email).orElseThrow();
        Category category = categoryRepository.findByUserIdAndNameIgnoreCase(user.getId(), nome).orElseThrow();
        return new Scenario(token, user, category);
    }

    private RecurringTransaction regola(Scenario s, LocalDate nextDue, String importo, LocalDate endDate) {
        return recurringTransactionRepository.save(RecurringTransaction.builder()
                .user(s.user())
                .category(s.category())
                .name("Affitto")
                .defaultAmount(new BigDecimal(importo))
                .intervalUnit(IntervalUnit.MONTH)
                .intervalValue((short) 1)
                .startDate(nextDue)
                .nextDueDate(nextDue)
                .endDate(endDate)
                .active(true)
                .build());
    }

    private RecurringTransaction ricarica(UUID id) {
        return recurringTransactionRepository.findById(id).orElseThrow();
    }

    /** Le date delle transazioni dell'utente, ordinate. */
    private List<String> dateDelleTransazioni(String token) throws Exception {
        return api.listTransactions(token).findValuesAsText("occurredOn").stream().sorted().toList();
    }

    /**
     * Il caso per cui il ciclo esiste: il server è stato fermo (o la regola è rimasta indietro)
     * e all'esecuzione successiva vanno recuperate tutte le occorrenze mancate, non solo
     * l'ultima.
     */
    @Test
    void recuperaTutteLeOccorrenzeArretrate() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "500.00", null).getId();

        // Scadenze il 15 di ogni mese, oggi è il 14 aprile: gennaio, febbraio e marzo sono
        // arretrate, aprile non è ancora dovuta.
        generationService.processDueRule(id, LocalDate.of(2026, 4, 14));

        // Le occorrenze si registrano al primo del mese, non alla data di scadenza reale:
        // servono a dare subito la stima del saldo residuo del mese.
        assertThat(dateDelleTransazioni(s.token()))
                .containsExactly("2026-01-01", "2026-02-01", "2026-03-01");
        assertThat(ricarica(id).getNextDueDate()).isEqualTo(LocalDate.of(2026, 4, 15));
        assertThat(ricarica(id).getActive()).isTrue();
    }

    @Test
    void unaSecondaEsecuzioneNonDuplicaNulla() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "500.00", null).getId();

        generationService.processDueRule(id, LocalDate.of(2026, 4, 14));
        generationService.processDueRule(id, LocalDate.of(2026, 4, 14));

        assertThat(dateDelleTransazioni(s.token())).hasSize(3);
    }

    @Test
    void unaRegolaNonAncoraScadutaNonGeneraNulla() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "500.00", null).getId();

        generationService.processDueRule(id, GENNAIO.minusDays(1));

        assertThat(dateDelleTransazioni(s.token())).isEmpty();
        assertThat(ricarica(id).getNextDueDate()).isEqualTo(GENNAIO);
    }

    /**
     * Il fuori-di-uno che conta: {@code isCurrentlyActive} usa {@code !endDate.isBefore(today)},
     * quindi il giorno esatto della data di fine la regola è ancora viva e la sua ultima
     * occorrenza va generata. Con un {@code isAfter} al posto dell'{@code isBefore} l'utente
     * perderebbe silenziosamente l'ultima rata.
     */
    @Test
    void laDataDiFineEIlSuoUltimoGiornoUtile() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "100.00", GENNAIO).getId();

        generationService.processDueRule(id, GENNAIO);

        assertThat(dateDelleTransazioni(s.token())).containsExactly("2026-01-01");
        assertThat(ricarica(id).getActive()).isTrue();
    }

    /** E il giorno dopo si spegne da sola, senza che nessuno debba chiuderla a mano. */
    @Test
    void superataLaDataDiFineLaRegolaSiDisattiva() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "100.00", GENNAIO).getId();

        generationService.processDueRule(id, GENNAIO.plusDays(1));

        assertThat(ricarica(id).getActive()).isFalse();
    }

    /**
     * Comportamento attuale, scritto qui perché è una perdita di dati silenziosa e non un
     * dettaglio: il controllo sulla data di fine si fa su {@code today}, non sulla data della
     * singola occorrenza. Se il job non gira per il periodo in cui una regola scade, le
     * occorrenze arretrate <em>precedenti</em> alla data di fine non vengono più generate: la
     * regola viene solo disattivata. Con il job giornaliero non capita; capiterebbe dopo un
     * fermo lungo, ed è bene che chi lo cambierà veda da qui che oggi funziona così.
     */
    @Test
    void unaRegolaScadutaDuranteUnFermoNonRecuperaGliArretrati() throws Exception {
        Scenario s = scenario();
        UUID id = regola(s, GENNAIO, "100.00", LocalDate.of(2026, 2, 20)).getId();

        generationService.processDueRule(id, LocalDate.of(2026, 4, 14));

        assertThat(dateDelleTransazioni(s.token())).isEmpty();
        assertThat(ricarica(id).getActive()).isFalse();
    }

    /**
     * L'eccezione di importo su una singola occorrenza, mai coperta finora. Il punto delicato
     * è che le due date <em>non coincidono</em>: l'eccezione si cerca sulla data di scadenza
     * reale (15 gennaio), ma la transazione si registra al primo del mese. Cercarla sulla data
     * di registrazione la renderebbe inefficace e l'importo tornerebbe a quello di base, senza
     * che nulla lo segnali.
     */
    @Test
    void unEccezioneDiImportoValeSullaSuaOccorrenza() throws Exception {
        Scenario s = scenario();
        RecurringTransaction regola = regola(s, GENNAIO, "80.00", null);
        recurringOverrideRepository.save(RecurringOverride.builder()
                .recurringTransaction(regola)
                .occurrenceDate(GENNAIO)
                .overrideAmount(new BigDecimal("230.00"))
                .build());

        generationService.processDueRule(regola.getId(), LocalDate.of(2026, 2, 15));

        JsonNode transazioni = api.listTransactions(s.token());
        assertThat(transazioni).hasSize(2);
        assertThat(transazioni).anySatisfy(t -> {
            assertThat(t.get("occurredOn").asText()).isEqualTo("2026-01-01");
            assertThat(t.get("amount").decimalValue()).isEqualByComparingTo("230.00");
        });
        assertThat(transazioni).anySatisfy(t -> {
            assertThat(t.get("occurredOn").asText()).isEqualTo("2026-02-01");
            assertThat(t.get("amount").decimalValue()).isEqualByComparingTo("80.00");
        });
    }

    @Test
    void unaRegolaInesistenteNonFaEsplodereIlJob() {
        generationService.processDueRule(UUID.randomUUID(), LocalDate.of(2026, 4, 14));
    }
}
