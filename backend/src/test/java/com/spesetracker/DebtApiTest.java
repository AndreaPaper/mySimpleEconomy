package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// I debiti non avevano alcun test prima di questa suite.
class DebtApiTest extends AbstractIntegrationTest {

    private String debtBody(String categoryId, String name, String total, String monthly) {
        return """
                {"categoryId":"%s","name":"%s","totalAmount":%s,"monthlyPaymentAmount":%s}
                """.formatted(categoryId, name, total, monthly);
    }

    private String createDebt(String token, String categoryId) throws Exception {
        return api.json(mockMvc.perform(post("/api/debts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(debtBody(categoryId, "Prestito auto", "5000.00", "250.00")))
                .andExpect(status().isCreated())
                .andReturn())
                .get("id").asText();
    }

    @Test
    void createListUpdateAndDelete() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        String id = createDebt(token, category);

        mockMvc.perform(get("/api/debts").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Prestito auto"));

        mockMvc.perform(put("/api/debts/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(debtBody(category, "Prestito auto (rinegoziato)", "4000.00", "200.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalAmount").value(4000.00));

        mockMvc.perform(delete("/api/debts/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());

        mockMvc.perform(get("/api/debts").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void rejectsInvalidAmountsAndBlankName() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        mockMvc.perform(post("/api/debts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(debtBody(category, "", "5000.00", "250.00")))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/debts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(debtBody(category, "Importo nullo", "0", "250.00")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cannotUseAnotherUsersCategory() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);

        mockMvc.perform(post("/api/debts")
                        .header("Authorization", "Bearer " + bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(debtBody(aliceCategory, "Furtivo", "100.00", "10.00")))
                .andExpect(status().isNotFound());
    }

    @Test
    void debtsAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String aliceDebt = createDebt(alice, aliceCategory);

        mockMvc.perform(get("/api/debts").header("Authorization", "Bearer " + bob))
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(delete("/api/debts/" + aliceDebt).header("Authorization", "Bearer " + bob))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/debts").header("Authorization", "Bearer " + alice))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void unknownDebtReturnsNotFound() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(delete("/api/debts/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
