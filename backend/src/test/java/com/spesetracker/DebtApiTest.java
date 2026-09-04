package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    // ------------------------------------------------------------------
    // Il "già pagato", che era interamente scoperto
    // ------------------------------------------------------------------

    private ResultActions postDebt(String token, String body) throws Exception {
        return mockMvc.perform(post("/api/debts")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private JsonNode debts(String token) throws Exception {
        return api.json(mockMvc.perform(get("/api/debts").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
    }

    /**
     * Un importo già pagato senza la data di riferimento viene rifiutato, ed è una guardia con
     * un motivo preciso: senza quella data le spese storiche della categoria verrebbero sommate
     * di nuovo sopra un totale che con ogni probabilità le comprende già.
     */
    @Test
    void unImportoGiaPagatoSenzaDataVieneRifiutato() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        postDebt(token, """
                {"categoryId":"%s","name":"Prestito","totalAmount":5000.00,"monthlyPaymentAmount":250.00,\
                "alreadyPaidAmount":1000.00}
                """.formatted(category))
                .andExpect(status().isBadRequest());
    }

    /**
     * La guardia contro il doppio conteggio, che è il motivo per cui la data esiste: le spese
     * fino a {@code alreadyPaidAsOf} compreso si considerano già dentro il "già pagato", solo
     * quelle successive si sommano. Senza il filtro il debito risulterebbe pagato due volte.
     */
    @Test
    void leSpesePrimaDellaDataNonSiSommanoAlGiaPagato() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        LocalDate riferimento = LocalDate.now().minusMonths(2);

        // Una prima della data (già inclusa nei 1000) e una dopo (che si somma).
        api.createTransaction(token, category, riferimento.minusDays(10), "300.00", "EXPENSE");
        api.createTransaction(token, category, riferimento.plusDays(10), "200.00", "EXPENSE");

        postDebt(token, """
                {"categoryId":"%s","name":"Prestito","totalAmount":5000.00,"monthlyPaymentAmount":250.00,\
                "alreadyPaidAmount":1000.00,"alreadyPaidAsOf":"%s"}
                """.formatted(category, riferimento))
                .andExpect(status().isCreated());

        JsonNode debito = debts(token).get(0);
        // 1000 già pagati + 200 dopo la data. I 300 di prima NON si contano.
        assertThat(debito.get("paidAmount").decimalValue()).isEqualByComparingTo("1200.00");
        assertThat(debito.get("remainingAmount").decimalValue()).isEqualByComparingTo("3800.00");
    }

    /**
     * Il debito che si salda da solo: quando il residuo arriva a zero si disattiva, il che
     * libera la categoria per un nuovo debito. Nessuna azione manuale.
     */
    @Test
    void unDebitoSaldatoSiDisattivaDaSoloELiberaLaCategoria() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        postDebt(token, """
                {"categoryId":"%s","name":"Prestito","totalAmount":500.00,"monthlyPaymentAmount":250.00}
                """.formatted(category))
                .andExpect(status().isCreated());
        assertThat(debts(token).get(0).get("active").asBoolean()).isTrue();

        // Una spesa che copre tutto il totale.
        api.createTransaction(token, category, LocalDate.now(), "500.00", "EXPENSE");

        JsonNode debito = debts(token).get(0);
        assertThat(debito.get("remainingAmount").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(debito.get("active").asBoolean()).isFalse();

        // E la categoria è di nuovo libera: un secondo debito ci si aggancia.
        postDebt(token, """
                {"categoryId":"%s","name":"Nuovo prestito","totalAmount":800.00,"monthlyPaymentAmount":100.00}
                """.formatted(category))
                .andExpect(status().isCreated());
    }

    /** Un debito attivo per categoria: il secondo viene bloccato, e c'è un indice a reggerlo. */
    @Test
    void nonSiPossonoAvereDueDebitiAttiviSullaStessaCategoria() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        createDebt(token, category);

        postDebt(token, debtBody(category, "Secondo prestito", "3000.00", "100.00"))
                .andExpect(status().isConflict());
    }

    @Test
    void laCategoriaDiUnDebitoDeveEssereDiUscita() throws Exception {
        String token = api.registerAndLogin();
        String entrata = api.createIncomeCategory(token);

        postDebt(token, debtBody(entrata, "Sbagliato", "1000.00", "100.00"))
                .andExpect(status().isBadRequest());
    }
}
