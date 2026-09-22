package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Le regole ricorrenti materializzano transazioni reali già alla creazione
// (RecurringTransactionService.create -> processDueRule): è il comportamento che più
// facilmente sorprende, quindi va fissato da test espliciti.
class RecurringTransactionApiTest extends AbstractIntegrationTest {

    private String createRule(String token, String categoryId, LocalDate nextDue, LocalDate endDate) throws Exception {
        String endDateJson = endDate == null ? "null" : "\"" + endDate + "\"";
        return api.json(mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Netflix","defaultAmount":9.99,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s","endDate":%s}
                                """.formatted(categoryId, nextDue, nextDue, endDateJson)))
                .andExpect(status().isCreated())
                .andReturn())
                .get("id").asText();
    }

    @Test
    void ruleDueInTheFutureDoesNotGenerateAnyTransactionYet() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        createRule(token, category, LocalDate.now().plusMonths(1), null);

        assertThat(api.listTransactions(token)).isEmpty();
    }

    @Test
    void ruleWithPastDueDateCatchesUpOnCreation() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        // Scadenza mensile 3 mesi fa: il recupero genera le occorrenze di 3, 2 e 1 mese
        // fa più quella odierna (il ciclo genera finché nextDueDate non supera oggi).
        LocalDate start = LocalDate.now().minusMonths(3);

        createRule(token, category, start, null);

        JsonNode transactions = api.listTransactions(token);
        assertThat(transactions).hasSize(4);
        // Le occorrenze sono prenotate a inizio mese, non alla data di scadenza reale.
        for (JsonNode t : transactions) {
            assertThat(LocalDate.parse(t.get("occurredOn").asText()).getDayOfMonth()).isEqualTo(1);
            assertThat(t.get("recurringTransactionId").asText()).isNotBlank();
        }
    }

    @Test
    void catchUpStopsAtEndDate() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate start = LocalDate.now().minusMonths(3);

        // endDate un mese fa: le occorrenze successive non devono essere generate.
        createRule(token, category, start, LocalDate.now().minusMonths(2));

        assertThat(api.listTransactions(token).size()).isLessThan(3);
    }

    // Il nome diceva "Update" ma il PUT non c'era: si faceva GET, deactivate,
    // reactivate e DELETE. La modifica ha ora i suoi test, qui sotto.
    @Test
    void listDeactivateReactivateAndDelete() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        String id = createRule(token, category, LocalDate.now().plusMonths(1), null);

        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(post("/api/recurring-transactions/" + id + "/deactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(false));

        mockMvc.perform(post("/api/recurring-transactions/" + id + "/reactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(true));

        mockMvc.perform(delete("/api/recurring-transactions/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void overridesCanBeCreatedListedAndDeleted() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate due = LocalDate.now().plusMonths(1);
        String id = createRule(token, category, due, null);

        String overrideId = api.json(mockMvc.perform(post("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"occurrenceDate":"%s","overrideAmount":25.00,"note":"aumento"}
                                """.formatted(due)))
                .andExpect(status().isCreated())
                .andReturn())
                .get("id").asText();

        mockMvc.perform(get("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].overrideAmount").value(25.00));

        mockMvc.perform(delete("/api/recurring-transactions/" + id + "/overrides/" + overrideId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void aSecondOverrideOnTheSameDateIsRejected() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate due = LocalDate.now().plusMonths(1);
        String id = createRule(token, category, due, null);

        String body = """
                {"occurrenceDate":"%s","overrideAmount":25.00,"note":"primo"}
                """.formatted(due);

        mockMvc.perform(post("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void overrideAmountIsUsedByTheGeneratedCatchUpTransaction() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate due = LocalDate.now().minusMonths(1);

        // Prima una regola futura (nessuna generazione), poi l'eccezione sulla data
        // arretrata, infine si sposta la scadenza indietro con un update per far
        // scattare il recupero usando l'importo dell'eccezione.
        String id = createRule(token, category, LocalDate.now().plusMonths(6), null);
        mockMvc.perform(post("/api/recurring-transactions/" + id + "/overrides")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"occurrenceDate":"%s","overrideAmount":123.45,"note":"eccezione"}
                                """.formatted(due)))
                .andExpect(status().isCreated());

        assertThat(api.listTransactions(token)).isEmpty();
    }

    // ------------------------------------------------------------------
    // La modifica di una regola (PUT), che non era mai stata esercitata
    // ------------------------------------------------------------------

    private ResultActions putRule(String token, String id, String categoryId, String nome, String importo,
                                  LocalDate startDate, LocalDate nextDue) throws Exception {
        return mockMvc.perform(put("/api/recurring-transactions/" + id)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"categoryId":"%s","name":"%s","defaultAmount":%s,"intervalUnit":"MONTH",\
                        "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                        """.formatted(categoryId, nome, importo, startDate, nextDue)));
    }

    @Test
    void laModificaCambiaNomeImportoECategoria() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        String altraCategoria = api.createExpenseCategory(token);
        LocalDate futuro = LocalDate.now().plusMonths(1);
        String id = createRule(token, category, futuro, null);

        putRule(token, id, altraCategoria, "Spotify", "12.99", futuro, futuro)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Spotify"))
                .andExpect(jsonPath("$.defaultAmount").value(12.99))
                .andExpect(jsonPath("$.categoryId").value(altraCategoria));

        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].name").value("Spotify"));
    }

    /**
     * La modifica rilancia {@code processDueRule}: spostando la scadenza indietro nel tempo la
     * regola diventa arretrata e recupera subito, senza aspettare il job notturno.
     */
    @Test
    void laModificaRecuperaGliArretratiSubito() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate futuro = LocalDate.now().plusMonths(1);
        String id = createRule(token, category, futuro, null);
        assertThat(api.listTransactions(token)).isEmpty();

        LocalDate passato = LocalDate.now().minusDays(3);
        putRule(token, id, category, "Netflix", "9.99", passato, passato).andExpect(status().isOk());

        assertThat(api.listTransactions(token)).hasSize(1);
        // E la scadenza è stata spinta avanti dal recupero.
        JsonNode regola = api.json(mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andReturn()).get(0);
        assertThat(LocalDate.parse(regola.get("nextDueDate").asText())).isAfter(LocalDate.now());
    }

    /**
     * Il salvataggio ripetuto come lo fa davvero l'app: il form rimanda la scadenza corrente,
     * che dopo il recupero è già nel futuro. Non si rigenera nulla.
     */
    @Test
    void risalvareSenzaCambiareLaScadenzaNonRigeneraNulla() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate passato = LocalDate.now().minusDays(3);
        String id = createRule(token, category, passato, null);
        int dopoLaCreazione = api.listTransactions(token).size();

        JsonNode regola = api.json(mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andReturn()).get(0);
        LocalDate scadenzaCorrente = LocalDate.parse(regola.get("nextDueDate").asText());

        putRule(token, id, category, "Netflix", "12.99", passato, scadenzaCorrente)
                .andExpect(status().isOk());

        assertThat(api.listTransactions(token)).hasSize(dopoLaCreazione);
    }

    /**
     * Comportamento attuale, scritto perché è una perdita di dati silenziosa e non un dettaglio.
     *
     * <p>A differenza dei promemoria — che prima di generare controllano
     * {@code existsByExpenseReminderIdAndOccurredOnBetween} — la generazione ricorrente
     * <strong>non ha alcuna guardia anti-doppione per occorrenza</strong>. Rimandando due volte
     * la stessa scadenza già passata (un doppio invio del form, un client che riusa un corpo
     * vecchio) la stessa occorrenza viene scritta due volte, e l'utente si ritrova la spesa
     * doppia senza che nulla lo segnali.
     *
     * <p>Il test fissa quello che succede oggi. Se un domani si aggiunge la guardia, fallisce e
     * va aggiornato — consapevolmente.
     */
    @Test
    void rimandareDueVolteLaStessaScadenzaPassataDuplicaLOccorrenza() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate futuro = LocalDate.now().plusMonths(1);
        String id = createRule(token, category, futuro, null);
        LocalDate passato = LocalDate.now().minusDays(3);

        putRule(token, id, category, "Netflix", "9.99", passato, passato).andExpect(status().isOk());
        putRule(token, id, category, "Netflix", "9.99", passato, passato).andExpect(status().isOk());

        assertThat(api.listTransactions(token)).hasSize(2);
    }

    @Test
    void nonSiPuoModificareLaRegolaDiUnAltroUtente() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String bobCategory = api.createExpenseCategory(bob);
        LocalDate futuro = LocalDate.now().plusMonths(1);
        String aliceRule = createRule(alice, aliceCategory, futuro, null);

        putRule(bob, aliceRule, bobCategory, "Rubata", "1.00", futuro, futuro)
                .andExpect(status().isNotFound());
    }

    /**
     * La categoria di un altro utente non deve poter essere agganciata a una propria regola.
     * Il controllo esisteva già per Debiti e Promemoria; qui non era mai stato provato, ed è
     * l'unica cosa che impedisce di scrivere transazioni dentro la categoria di qualcun altro.
     */
    @Test
    void nonSiPuoUsareLaCategoriaDiUnAltroUtente() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String bobCategory = api.createExpenseCategory(bob);
        LocalDate futuro = LocalDate.now().plusMonths(1);
        String aliceRule = createRule(alice, aliceCategory, futuro, null);

        putRule(alice, aliceRule, bobCategory, "Netflix", "9.99", futuro, futuro)
                .andExpect(status().isNotFound());
    }

    @Test
    void unaRegolaInesistenteDa404() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate futuro = LocalDate.now().plusMonths(1);

        putRule(token, UUID.randomUUID().toString(), category, "Netflix", "9.99", futuro, futuro)
                .andExpect(status().isNotFound());
    }

    @Test
    void rulesAndOverridesAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String aliceRule = createRule(alice, aliceCategory, LocalDate.now().plusMonths(1), null);

        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + bob))
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(delete("/api/recurring-transactions/" + aliceRule)
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/recurring-transactions/" + aliceRule + "/overrides")
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsAnAmountOfZeroOrABlankName() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"","defaultAmount":9.99,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(category, LocalDate.now(), LocalDate.now())))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Netflix","defaultAmount":0,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(category, LocalDate.now().plusMonths(1), LocalDate.now().plusMonths(1))))
                .andExpect(status().isBadRequest());
    }
}
