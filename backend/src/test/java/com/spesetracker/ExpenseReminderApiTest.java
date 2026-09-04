package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// I promemoria sono spese fisse di cui non si conosce l'importo in anticipo: hanno
// comunque bisogno di una categoria di uscita dell'utente.
class ExpenseReminderApiTest extends AbstractIntegrationTest {

    @Test
    void createsAndListsAReminder() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        api.createReminder(token, category, "Bollo auto", LocalDate.now().plusDays(10));

        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Bollo auto"));
    }

    // Regressione: i test storici creavano promemoria senza categoria e ricevevano 400,
    // perché ExpenseReminderRequest.categoryId è @NotNull.
    @Test
    void aReminderWithoutACategoryIsRejected() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Senza categoria","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(LocalDate.now(), LocalDate.now())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anIncomeCategoryIsNotAcceptedForAReminder() throws Exception {
        String token = api.registerAndLogin();
        String income = api.createIncomeCategory(token);

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Sbagliata","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(income, LocalDate.now(), LocalDate.now())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cannotUseAnotherUsersCategory() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Furtivo","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(aliceCategory, LocalDate.now(), LocalDate.now())))
                .andExpect(status().isNotFound());
    }

    @Test
    void deactivateAndReactivate() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        String id = api.createReminder(token, category, "Assicurazione", LocalDate.now().plusDays(5));

        mockMvc.perform(post("/api/expense-reminders/" + id + "/deactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());
        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(false));

        mockMvc.perform(post("/api/expense-reminders/" + id + "/reactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());
        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void upcomingProjectsTheReminderAcrossTheRequestedMonths() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createReminder(token, category, "Affitto", LocalDate.now().plusDays(3));

        mockMvc.perform(get("/api/expense-reminders/upcoming")
                        .param("months", "4")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months.length()").value(4));
    }

    @Test
    void remindersAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        api.createReminder(alice, aliceCategory, "Solo di Alice", LocalDate.now().plusDays(3));

        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ------------------------------------------------------------------
    // La modifica (PUT), che non era mai stata esercitata
    // ------------------------------------------------------------------

    private ResultActions putReminder(String token, String id, String categoryId, String nome, String importo)
            throws Exception {
        LocalDate scadenza = LocalDate.now().plusDays(10);
        return mockMvc.perform(put("/api/expense-reminders/" + id)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"categoryId":"%s","name":"%s","amount":%s,"intervalUnit":"MONTH","intervalValue":1,\
                        "startDate":"%s","nextDueDate":"%s"}
                        """.formatted(categoryId, nome, importo, scadenza, scadenza)));
    }

    @Test
    void laModificaCambiaNomeImportoECategoria() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        String altra = api.createExpenseCategory(token);
        String id = api.createReminder(token, categoria, "Bollo auto", LocalDate.now().plusDays(3));

        putReminder(token, id, altra, "Assicurazione", "230.00")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Assicurazione"))
                .andExpect(jsonPath("$.amount").value(230.00))
                .andExpect(jsonPath("$.categoryId").value(altra));
    }

    /**
     * L'ownership su un'operazione per id: {@code findOwned} non era mai stato esercitato sul
     * ramo negativo. Il test di isolamento esistente guarda solo la lista, che filtra per utente
     * già nella query — quindi non provava affatto questo controllo.
     */
    @Test
    void nonSiPuoModificareIlPromemoriaDiUnAltroUtente() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        String bobCategory = api.createExpenseCategory(bob);
        String aliceReminder = api.createReminder(alice, aliceCategory, "Bollo", LocalDate.now().plusDays(3));

        putReminder(bob, aliceReminder, bobCategory, "Rubato", "1.00")
                .andExpect(status().isNotFound());
    }

    @Test
    void unPromemoriaInesistenteDa404() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);

        putReminder(token, UUID.randomUUID().toString(), categoria, "Bollo", "10.00")
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // L'importo mostrato nelle prossime scadenze
    // ------------------------------------------------------------------

    /**
     * Un promemoria con un prezzo suo lo mostra tale e quale, e <em>non</em> marcato come stima.
     * Finora ogni promemoria della suite nasceva senza importo, quindi questo ramo — quello che
     * vede chi il prezzo lo conosce — non era mai stato eseguito.
     */
    @Test
    void unPrezzoImpostatoVieneMostratoENonEUnaStima() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        api.createReminder(token, categoria, "Bollo auto", LocalDate.now().plusDays(3),
                "MONTH", 1, null, null, "120.00");

        JsonNode occorrenza = primaOccorrenza(token);

        assertThat(occorrenza.get("amount").decimalValue()).isEqualByComparingTo("120.00");
        assertThat(occorrenza.get("estimated").asBoolean()).isFalse();
    }

    /**
     * Senza prezzo si stima sull'ultima spesa della categoria, e la stima è marcata come tale:
     * è quello che distingue a schermo un numero certo da uno dedotto.
     */
    @Test
    void senzaPrezzoSiStimaSullUltimaSpesaEDichiaraCheEUnaStima() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        api.createTransaction(token, categoria, LocalDate.now().minusMonths(2), "80.00", "EXPENSE");
        api.createTransaction(token, categoria, LocalDate.now().minusDays(5), "95.00", "EXPENSE");
        api.createReminder(token, categoria, "Bolletta", LocalDate.now().plusDays(3));

        JsonNode occorrenza = primaOccorrenza(token);

        // L'ultima, non la prima: l'ordinamento conta.
        assertThat(occorrenza.get("amount").decimalValue()).isEqualByComparingTo("95.00");
        assertThat(occorrenza.get("estimated").asBoolean()).isTrue();
    }

    @Test
    void senzaPrezzoESenzaStoricoNonSiInventaUnImporto() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        api.createReminder(token, categoria, "Bolletta", LocalDate.now().plusDays(3));

        JsonNode occorrenza = primaOccorrenza(token);

        assertThat(occorrenza.get("amount").isNull()).isTrue();
        assertThat(occorrenza.get("estimated").asBoolean()).isFalse();
    }

    /** La prima occorrenza trovata scorrendo i mesi di /upcoming. */
    private JsonNode primaOccorrenza(String token) throws Exception {
        JsonNode risposta = api.json(mockMvc.perform(get("/api/expense-reminders/upcoming")
                        .param("months", "3")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
        for (JsonNode mese : risposta.get("months")) {
            if (mese.get("occurrences").size() > 0) {
                return mese.get("occurrences").get(0);
            }
        }
        throw new AssertionError("Nessuna occorrenza proiettata");
    }
}
