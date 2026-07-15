package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Verifica sia la cancellazione per intervallo di date (solo transazioni e saldi,
// senza toccare regole ricorrenti/promemoria/categorie) sia il reset completo
// dell'account (tutto tranne le categorie, per permettere un reimport pulito da Excel).
@SpringBootTest
@AutoConfigureMockMvc
class DataCleanupSmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String registerAndLogin() throws Exception {
        String email = "cleanup+" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String createCategory(String token, String name) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","type":"EXPENSE","color":"#3B82F6"}
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void createTransaction(String token, String categoryId, LocalDate occurredOn, String amount) throws Exception {
        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":%s,"type":"EXPENSE","occurredOn":"%s","description":"test"}
                                """.formatted(categoryId, amount, occurredOn)))
                .andExpect(status().isCreated());
    }

    private void createCheckpoint(String token, LocalDate date, String balance) throws Exception {
        mockMvc.perform(post("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"checkpointDate":"%s","balance":%s}
                                """.formatted(date, balance)))
                .andExpect(status().isOk());
    }

    private void createRecurring(String token, String categoryId, LocalDate start) throws Exception {
        mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Netflix","defaultAmount":9.99,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(categoryId, start, start)))
                .andExpect(status().isCreated());
    }

    private void createReminder(String token, LocalDate due) throws Exception {
        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bollo auto","intervalUnit":"YEAR","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(due, due)))
                .andExpect(status().isCreated());
    }

    @Test
    void rangeCleanupOnlyRemovesTransactionsAndCheckpointsInRange() throws Exception {
        String token = registerAndLogin();
        String categoryId = createCategory(token, "Varie" + UUID.randomUUID());

        LocalDate inRange = LocalDate.of(2026, 3, 15);
        LocalDate outOfRange = LocalDate.of(2026, 6, 15);
        createTransaction(token, categoryId, inRange, "50.00");
        createTransaction(token, categoryId, outOfRange, "70.00");
        createCheckpoint(token, inRange, "1000.00");
        createCheckpoint(token, outOfRange, "1200.00");
        createRecurring(token, categoryId, inRange);
        createReminder(token, inRange);

        MvcResult cleanupResult = mockMvc.perform(delete("/api/data-cleanup")
                        .header("Authorization", "Bearer " + token)
                        .param("from", "2026-03-01")
                        .param("to", "2026-03-31"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode summary = objectMapper.readTree(cleanupResult.getResponse().getContentAsString());
        assertThat(summary.get("transactionsDeleted").asLong()).isEqualTo(1);
        assertThat(summary.get("balanceCheckpointsDeleted").asLong()).isEqualTo(1);
        assertThat(summary.get("recurringTransactionsDeleted").asLong()).isEqualTo(0);
        assertThat(summary.get("expenseRemindersDeleted").asLong()).isEqualTo(0);

        MvcResult transactionsResult = mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode transactions = objectMapper.readTree(transactionsResult.getResponse().getContentAsString());
        assertThat(transactions).hasSize(1);
        assertThat(transactions.get(0).get("occurredOn").asText()).isEqualTo(outOfRange.toString());

        MvcResult checkpointsResult = mockMvc.perform(get("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode checkpoints = objectMapper.readTree(checkpointsResult.getResponse().getContentAsString());
        assertThat(checkpoints).hasSize(1);

        mockMvc.perform(get("/api/recurring-transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        MvcResult recurringResult = mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(recurringResult.getResponse().getContentAsString())).hasSize(1);

        MvcResult remindersResult = mockMvc.perform(get("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(remindersResult.getResponse().getContentAsString())).hasSize(1);
    }

    @Test
    void fullWipeRemovesEverythingExceptCategories() throws Exception {
        String token = registerAndLogin();
        String categoryId = createCategory(token, "Varie" + UUID.randomUUID());

        LocalDate date = LocalDate.of(2026, 4, 10);
        createTransaction(token, categoryId, date, "50.00");
        createCheckpoint(token, date, "1000.00");
        createRecurring(token, categoryId, date);
        createReminder(token, date);

        MvcResult cleanupResult = mockMvc.perform(delete("/api/data-cleanup")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode summary = objectMapper.readTree(cleanupResult.getResponse().getContentAsString());
        assertThat(summary.get("transactionsDeleted").asLong()).isEqualTo(1);
        assertThat(summary.get("recurringTransactionsDeleted").asLong()).isEqualTo(1);
        assertThat(summary.get("balanceCheckpointsDeleted").asLong()).isEqualTo(1);
        assertThat(summary.get("expenseRemindersDeleted").asLong()).isEqualTo(1);

        MvcResult transactionsResult = mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(transactionsResult.getResponse().getContentAsString())).isEmpty();

        MvcResult recurringResult = mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(recurringResult.getResponse().getContentAsString())).isEmpty();

        MvcResult checkpointsResult = mockMvc.perform(get("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(checkpointsResult.getResponse().getContentAsString())).isEmpty();

        MvcResult remindersResult = mockMvc.perform(get("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertThat(objectMapper.readTree(remindersResult.getResponse().getContentAsString())).isEmpty();

        MvcResult categoriesResult = mockMvc.perform(get("/api/categories")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode categories = objectMapper.readTree(categoriesResult.getResponse().getContentAsString());
        assertThat(categories).hasSize(1);
    }
}
