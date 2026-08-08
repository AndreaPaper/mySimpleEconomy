package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Impostare stipendio + giorno nel profilo crea e mantiene allineata una regola
// ricorrente "Stipendio" (ProfileService.syncSalaryRecurringTransaction): è un effetto
// collaterale non ovvio del salvataggio del profilo.
class ProfileSalaryApiTest extends AbstractIntegrationTest {

    private void updateProfile(String token, String body) throws Exception {
        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private JsonNode recurringRules(String token) throws Exception {
        return api.json(mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
    }

    @Test
    void settingSalaryCreatesTheRecurringSalaryRule() throws Exception {
        String token = api.registerAndLogin();

        updateProfile(token, """
                {"nickname":"Andrea","defaultSalaryAmount":2000.00,"salaryDay":27}
                """);

        JsonNode rules = recurringRules(token);
        assertThat(rules).hasSize(1);
        assertThat(rules.get(0).get("defaultAmount").decimalValue()).isEqualByComparingTo("2000.00");
    }

    @Test
    void changingOnlyTheNicknameDoesNotRecreateTheSalaryRule() throws Exception {
        String token = api.registerAndLogin();
        updateProfile(token, """
                {"nickname":"Andrea","defaultSalaryAmount":2000.00,"salaryDay":27}
                """);
        int rulesAfterSalary = recurringRules(token).size();

        updateProfile(token, """
                {"nickname":"Andrea B.","defaultSalaryAmount":2000.00,"salaryDay":27}
                """);

        assertThat(recurringRules(token)).hasSize(rulesAfterSalary);
        mockMvc.perform(get("/api/profile").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.nickname").value("Andrea B."));
    }

    @Test
    void clearingTheSalaryDeactivatesTheRuleInsteadOfDeletingIt() throws Exception {
        String token = api.registerAndLogin();
        updateProfile(token, """
                {"nickname":"Andrea","defaultSalaryAmount":2000.00,"salaryDay":27}
                """);

        updateProfile(token, """
                {"nickname":"Andrea"}
                """);

        JsonNode rules = recurringRules(token);
        assertThat(rules).hasSize(1);
        assertThat(rules.get(0).get("active").asBoolean()).isFalse();
    }

    @Test
    void rejectsAnOutOfRangeSalaryDayAndANonPositiveSalary() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salaryDay\":45,\"defaultSalaryAmount\":2000.00}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salaryDay\":27,\"defaultSalaryAmount\":0}"))
                .andExpect(status().isBadRequest());
    }
}
