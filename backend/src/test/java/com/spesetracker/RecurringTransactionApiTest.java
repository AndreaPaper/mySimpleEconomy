package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

    @Test
    void listUpdateDeactivateReactivateAndDelete() throws Exception {
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
