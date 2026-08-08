package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// I saldi di partenza sono la base del calcolo del saldo attuale: qui si verifica
// l'upsert per data e l'ordinamento su cui si appoggia la Dashboard (il più recente
// per primo).
class BalanceCheckpointApiTest extends AbstractIntegrationTest {

    private JsonNode list(String token) throws Exception {
        return api.json(mockMvc.perform(get("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
    }

    @Test
    void savingTwiceForTheSameDateOverwritesInsteadOfDuplicating() throws Exception {
        String token = api.registerAndLogin();
        LocalDate date = LocalDate.now().minusDays(3);

        api.createCheckpoint(token, date, "1000.00");
        api.createCheckpoint(token, date, "1500.00");

        JsonNode checkpoints = list(token);
        assertThat(checkpoints).hasSize(1);
        assertThat(checkpoints.get(0).get("balance").decimalValue()).isEqualByComparingTo("1500.00");
    }

    @Test
    void checkpointsAreListedMostRecentFirst() throws Exception {
        String token = api.registerAndLogin();
        api.createCheckpoint(token, LocalDate.now().minusMonths(2), "100.00");
        api.createCheckpoint(token, LocalDate.now().minusMonths(1), "200.00");
        api.createCheckpoint(token, LocalDate.now(), "300.00");

        JsonNode checkpoints = list(token);

        assertThat(checkpoints).hasSize(3);
        assertThat(checkpoints.get(0).get("checkpointDate").asText()).isEqualTo(LocalDate.now().toString());
        assertThat(checkpoints.get(2).get("checkpointDate").asText())
                .isEqualTo(LocalDate.now().minusMonths(2).toString());
    }

    @Test
    void checkpointsAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        api.createCheckpoint(alice, LocalDate.now(), "1000.00");

        assertThat(list(bob)).isEmpty();
        assertThat(list(alice)).hasSize(1);
    }
}
