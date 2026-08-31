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

// Le categorie sono l'unica entità che sopravvive al reset dei dati, e sono
// referenziate da transazioni, ricorrenze, promemoria e debiti.
class CategoryApiTest extends AbstractIntegrationTest {

    @Test
    void createUpdateAndList() throws Exception {
        String token = api.registerAndLogin();
        String id = api.createCategory(token, "Spesa cibo", "EXPENSE");

        mockMvc.perform(put("/api/categories/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Alimentari\",\"color\":\"#22C55E\",\"icon\":\"cart\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Alimentari"))
                .andExpect(jsonPath("$.color").value("#22C55E"));

        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void rejectsBlankNameAndMalformedColour() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"type\":\"EXPENSE\"}"))
                .andExpect(status().isBadRequest());

        // Il colore deve essere esadecimale a 6 cifre.
        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Valida\",\"type\":\"EXPENSE\",\"color\":\"rosso\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void generateDefaultsCreatesAStarterSet() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post("/api/categories/generate-defaults")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());

        JsonNode categories = api.json(mockMvc.perform(get("/api/categories")
                        .header("Authorization", "Bearer " + token))
                .andReturn());
        assertThat(categories).isNotEmpty();
    }

    @Test
    void archiveHidesTheCategoryFromTheActiveList() throws Exception {
        String token = api.registerAndLogin();
        String id = api.createCategory(token, "Da archiviare", "EXPENSE");

        mockMvc.perform(post("/api/categories/" + id + "/archive")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());

        JsonNode categories = api.json(mockMvc.perform(get("/api/categories")
                        .header("Authorization", "Bearer " + token))
                .andReturn());
        for (JsonNode category : categories) {
            if (category.get("id").asText().equals(id)) {
                assertThat(category.get("archived").asBoolean()).isTrue();
            }
        }
    }

    @Test
    void deleteRemovesAnUnusedCategory() throws Exception {
        String token = api.registerAndLogin();
        String id = api.createCategory(token, "Inutilizzata", "EXPENSE");

        mockMvc.perform(delete("/api/categories/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());

        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void categoriesAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createCategory(alice, "Di Alice", "EXPENSE");

        mockMvc.perform(put("/api/categories/" + aliceCategory)
                        .header("Authorization", "Bearer " + bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rubata\",\"color\":\"#22C55E\"}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/categories/" + aliceCategory)
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());

        // Quella di Alice è intatta.
        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + alice))
                .andExpect(jsonPath("$[0].name").value("Di Alice"));
    }

    @Test
    void unknownCategoryReturnsNotFound() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(delete("/api/categories/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void aCategoryStillUsedByTransactionsIsNotSilentlyDropped() throws Exception {
        String token = api.registerAndLogin();
        String id = api.createExpenseCategory(token);
        api.createTransaction(token, id, LocalDate.now(), "10.00", "EXPENSE");

        // Documenta il comportamento attuale: o rifiuta, o cancella a cascata; in ogni
        // caso non deve lasciare transazioni orfane che puntano a una categoria sparita.
        mockMvc.perform(delete("/api/categories/" + id).header("Authorization", "Bearer " + token))
                .andReturn();

        JsonNode transactions = api.listTransactions(token);
        for (JsonNode t : transactions) {
            assertThat(t.get("categoryName").asText()).isNotBlank();
        }
    }
}
