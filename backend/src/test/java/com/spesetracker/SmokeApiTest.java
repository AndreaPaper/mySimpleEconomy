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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Percorre l'intero flusso applicativo (auth, categorie, transazioni, ricorrenze,
// checkpoint, previsione) contro un vero database Postgres di test, senza aprire
// una porta HTTP reale: verifica end-to-end sicurezza + JPA + logica di business.
@SpringBootTest
@AutoConfigureMockMvc
class SmokeApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void fullApplicationFlow() throws Exception {
        String email = "smoke+" + UUID.randomUUID() + "@example.com";
        String password = "password123";

        MvcResult registerResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", password))))
                .andExpect(status().isCreated())
                .andReturn();
        String token = readJson(registerResult).get("token").asText();

        MvcResult expenseCategoryResult = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Spesa\",\"type\":\"EXPENSE\",\"color\":\"#3B82F6\",\"icon\":\"cart\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String expenseCategoryId = readJson(expenseCategoryResult).get("id").asText();

        MvcResult incomeCategoryResult = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Stipendio\",\"type\":\"INCOME\",\"color\":\"#22C55E\",\"icon\":\"cash\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String incomeCategoryId = readJson(incomeCategoryResult).get("id").asText();

        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":42.50,"type":"EXPENSE","occurredOn":"%s","description":"Spesa test"}
                                """.formatted(expenseCategoryId, LocalDate.now())))
                .andExpect(status().isCreated());

        MvcResult recurringResult = mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Stipendio mensile","defaultAmount":2000.00,\
                                "intervalUnit":"MONTH","intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(incomeCategoryId, LocalDate.now(), LocalDate.now().plusMonths(1))))
                .andExpect(status().isCreated())
                .andReturn();
        String recurringId = readJson(recurringResult).get("id").asText();

        mockMvc.perform(post("/api/recurring-transactions/" + recurringId + "/overrides")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"occurrenceDate":"%s","overrideAmount":2500.00,"note":"bonus"}
                                """.formatted(LocalDate.now().plusMonths(1))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"checkpointDate":"%s","balance":1000.00}
                                """.formatted(LocalDate.now())))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/forecast").param("months", "3")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months.length()").value(3))
                .andExpect(jsonPath("$.months[1].projectedIncome").value(2500.00));

        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isUnauthorized());
    }

    // Regressione: un utente appena registrato non ha alcun balance_checkpoint.
    // ForecastService usava LocalDate.MIN come sentinella in questo caso, che eccede
    // il range di date rappresentabile da Postgres e mandava in errore ogni richiesta
    // di previsione per un utente nuovo (scoperto testando l'app reale in un container).
    @Test
    void forecastWorksForBrandNewUserWithoutAnyCheckpoint() throws Exception {
        String email = "smoke-nocp+" + UUID.randomUUID() + "@example.com";
        MvcResult registerResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        String token = readJson(registerResult).get("token").asText();

        mockMvc.perform(get("/api/forecast").param("months", "4")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months.length()").value(4))
                .andExpect(jsonPath("$.startingBalance").value(0));
    }

    private JsonNode readJson(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
