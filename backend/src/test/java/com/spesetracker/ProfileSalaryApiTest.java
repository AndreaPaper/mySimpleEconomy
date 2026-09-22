package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

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

    /**
     * Il ramo che finora nessun test toccava: una <em>seconda</em> modifica su una regola
     * stipendio già attiva. È quello che rilancia {@code processDueRule}, ed è dove il bug del
     * doppio stipendio potrebbe rientrare dalla finestra dopo essere stato cacciato dalla porta.
     *
     * <p>La regola: alla prima attivazione si usa il giorno di questo mese anche se già passato,
     * così lo stipendio corrente si genera subito; a regola già attiva si guarda solo in avanti,
     * proprio per non rigenerare lo stesso mese.
     */
    @Test
    void unaSecondaModificaNonRigeneraLoStipendioDelloStessoMese() throws Exception {
        String token = api.registerAndLogin();
        updateProfile(token, """
                {"defaultSalaryAmount":2000.00,"salaryDay":1}
                """);
        int dopoLaPrima = api.listTransactions(token).size();

        // Cambia solo l'importo: la regola è già attiva.
        updateProfile(token, """
                {"defaultSalaryAmount":2500.00,"salaryDay":1}
                """);

        assertThat(api.listTransactions(token)).hasSize(dopoLaPrima);
        JsonNode rules = recurringRules(token);
        assertThat(rules).hasSize(1);
        assertThat(rules.get(0).get("defaultAmount").decimalValue()).isEqualByComparingTo("2500.00");
        // E la scadenza guarda avanti, mai indietro.
        assertThat(LocalDate.parse(rules.get(0).get("nextDueDate").asText()))
                .isAfterOrEqualTo(LocalDate.now());
    }

    /**
     * Il giorno 31 su una regola già attiva: {@code nextOccurrenceOfDay} tronca alla lunghezza
     * del mese. Senza, {@code withDayOfMonth(31)} solleverebbe un'eccezione a febbraio e il
     * salvataggio del profilo fallirebbe — una volta l'anno, per chi è pagato il 31.
     */
    @Test
    void ilGiorno31VieneTroncatoAllaLunghezzaDelMese() throws Exception {
        String token = api.registerAndLogin();
        updateProfile(token, """
                {"defaultSalaryAmount":2000.00,"salaryDay":15}
                """);

        updateProfile(token, """
                {"defaultSalaryAmount":2000.00,"salaryDay":31}
                """);

        LocalDate prossima = LocalDate.parse(recurringRules(token).get(0).get("nextDueDate").asText());
        // Cade davvero in un giorno esistente, ed è l'ultimo possibile del suo mese
        // (il 31 dove c'è, l'ultimo giorno dove il mese è più corto).
        assertThat(prossima.getDayOfMonth())
                .isEqualTo(Math.min(31, prossima.lengthOfMonth()));
        assertThat(prossima).isAfterOrEqualTo(LocalDate.now());
    }

    /** Il risparmio attivo senza percentuale non è una configurazione valida. */
    @Test
    void ilRisparmioAttivoSenzaPercentualeVieneRifiutato() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"savingsEnabled\":true}"))
                .andExpect(status().isBadRequest());
    }

    // L'avatar si sceglie da un catalogo chiuso: un valore inventato non deve entrare in
    // archivio, altrimenti l'interfaccia resterebbe senza icona da mostrare.
    @Test
    void lAvatarAccettaSoloLeChiaviDelCatalogo() throws Exception {
        String token = api.registerAndLogin();

        updateProfile(token, "{\"avatarKey\":\"cat\"}");
        mockMvc.perform(get("/api/profile").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.avatarKey").value("cat"));

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"avatarKey\":\"velociraptor\"}"))
                .andExpect(status().isBadRequest());
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
