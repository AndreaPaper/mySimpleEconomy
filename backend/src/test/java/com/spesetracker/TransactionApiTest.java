package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// CRUD, filtri e paginazione dell'endpoint più usato dall'app, più l'isolamento
// fra utenti (ogni query di TransactionService è filtrata per userId).
class TransactionApiTest extends AbstractIntegrationTest {

    @Test
    void createUpdateAndDeleteATransaction() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        String id = api.createTransaction(token, category, LocalDate.now(), "42.50", "EXPENSE");

        mockMvc.perform(put("/api/transactions/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":99.99,"type":"EXPENSE","occurredOn":"%s","description":"aggiornata"}
                                """.formatted(category, LocalDate.now())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(99.99))
                .andExpect(jsonPath("$.description").value("aggiornata"));

        mockMvc.perform(delete("/api/transactions/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        assertThat(api.listTransactions(token)).isEmpty();
    }

    @Test
    void rejectsInvalidPayloads() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        // Importo non positivo (DecimalMin 0.01).
        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":0,"type":"EXPENSE","occurredOn":"%s"}
                                """.formatted(category, LocalDate.now())))
                .andExpect(status().isBadRequest());

        // Categoria mancante (@NotNull).
        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":10.00,"type":"EXPENSE","occurredOn":"%s"}
                                """.formatted(LocalDate.now())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cannotUseACategoryBelongingToAnotherUser() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);

        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":10.00,"type":"EXPENSE","occurredOn":"%s"}
                                """.formatted(aliceCategory, LocalDate.now())))
                .andExpect(status().isNotFound());
    }

    @Test
    void cannotUpdateOrDeleteAnotherUsersTransaction() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String aliceTransaction = api.createTransaction(alice, aliceCategory, LocalDate.now(), "10.00", "EXPENSE");

        mockMvc.perform(delete("/api/transactions/" + aliceTransaction)
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());

        // La transazione di Alice deve essere ancora lì.
        assertThat(api.listTransactions(alice)).hasSize(1);
    }

    @Test
    void filtersByDateRangeReturnTheWholePeriod() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate anchor = LocalDate.now().minusMonths(2).withDayOfMonth(10);

        api.createTransaction(token, category, anchor, "10.00", "EXPENSE");
        api.createTransaction(token, category, anchor.plusDays(5), "20.00", "EXPENSE");
        api.createTransaction(token, category, anchor.plusMonths(1), "30.00", "EXPENSE");

        JsonNode inRange = api.json(mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .param("from", anchor.toString())
                        .param("to", anchor.plusDays(5).toString()))
                .andExpect(status().isOk())
                .andReturn())
                .get("content");

        assertThat(inRange).hasSize(2);
    }

    @Test
    void filtersByCategory() throws Exception {
        String token = api.registerAndLogin();
        String food = api.createExpenseCategory(token);
        String other = api.createExpenseCategory(token);
        api.createTransaction(token, food, LocalDate.now(), "10.00", "EXPENSE");
        api.createTransaction(token, other, LocalDate.now(), "20.00", "EXPENSE");

        JsonNode filtered = api.json(mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .param("categoryId", food))
                .andExpect(status().isOk())
                .andReturn())
                .get("content");

        assertThat(filtered).hasSize(1);
        assertThat(filtered.get(0).get("categoryId").asText()).isEqualTo(food);
    }

    @Test
    void paginationReportsWhetherMorePagesFollow() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        for (int i = 0; i < 3; i++) {
            api.createTransaction(token, category, LocalDate.now().minusDays(i), "10.00", "EXPENSE");
        }

        JsonNode firstPage = api.json(mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(firstPage.get("content")).hasSize(2);
        assertThat(firstPage.get("hasNext").asBoolean()).isTrue();

        JsonNode secondPage = api.json(mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(secondPage.get("content")).hasSize(1);
        assertThat(secondPage.get("hasNext").asBoolean()).isFalse();
    }

    @Test
    void rejectsOutOfRangePageSize() throws Exception {
        String token = api.registerAndLogin();

        // size ha un massimo di 100 (@Max sul controller).
        mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .param("size", "500"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returnsNotFoundForAnUnknownTransaction() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(delete("/api/transactions/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
