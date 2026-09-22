package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// POST /api/import/bank/categories/from-bank: la scorciatoia per chi non ha
// voglia di ricondurre le categorie della banca alle proprie. Endpoint finora
// mai chiamato da un test, insieme al servizio che c'e' dietro.
class BankCategoryShortcutApiTest extends AbstractIntegrationTest {

    private JsonNode createFromBank(String token, String body) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/import/bank/categories/from-bank")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();
        return api.json(result);
    }

    private JsonNode listCategories(String token) throws Exception {
        return api.json(mockMvc.perform(get("/api/categories")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
    }

    private boolean hasCategoryNamed(JsonNode categories, String name) {
        for (JsonNode category : categories) {
            if (name.equals(category.get("name").asText())) return true;
        }
        return false;
    }

    private String categoryIdNamed(JsonNode categories, String name) {
        for (JsonNode category : categories) {
            if (name.equals(category.get("name").asText())) return category.get("id").asText();
        }
        throw new AssertionError("Nessuna categoria chiamata " + name);
    }

    @Test
    void creaUnaCategoriaPerOgniCategoriaDellaBancaColSuoNome() throws Exception {
        String token = api.registerAndLogin();

        JsonNode resolved = createFromBank(token, """
                [
                  {"bankCategory":"Generi alimentari e supermercato","transactionType":"EXPENSE",
                   "categoryId":null,"doNotImport":false,"rowCount":24,"sampleDescription":"Coop"},
                  {"bankCategory":"Ristoranti e bar","transactionType":"EXPENSE",
                   "categoryId":null,"doNotImport":false,"rowCount":3,"sampleDescription":"Mc Donald's"}
                ]
                """);

        assertThat(resolved).hasSize(2);
        for (JsonNode mapping : resolved) {
            assertThat(mapping.get("categoryId").isNull()).isFalse();
        }

        JsonNode categories = listCategories(token);
        assertThat(hasCategoryNamed(categories, "Generi alimentari e supermercato")).isTrue();
        assertThat(hasCategoryNamed(categories, "Ristoranti e bar")).isTrue();
    }

    // Il caso per cui SalaryCategoryResolver esiste. Il profilo tiene una
    // categoria chiamata "Stipendio"; la banca chiama l'accredito "Stipendi e
    // pensioni". Creando una seconda categoria si finiva con due categorie per la
    // stessa cosa, e il calcolo del risparmio che non trovava lo stipendio dove
    // se lo aspettava, contandolo due volte.
    @Test
    void perLoStipendioRiusaLaCategoriaDelProfiloInveceDiCrearneUnaGemella() throws Exception {
        String token = api.registerAndLogin();

        // Impostare stipendio e giorno crea la regola ricorrente e con essa la
        // categoria "Stipendio" collegata al profilo.
        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nickname":null,"defaultSalaryAmount":1800,"salaryDay":27,
                                 "avatarKey":null,"savingsEnabled":true,"savingsPercent":15}
                                """))
                .andExpect(status().isOk());

        String categoriaDelProfilo = categoryIdNamed(listCategories(token), "Stipendio");

        JsonNode resolved = createFromBank(token, """
                [
                  {"bankCategory":"Stipendi e pensioni","transactionType":"INCOME",
                   "categoryId":null,"doNotImport":false,"rowCount":1,"sampleDescription":"Stipendio O Pensione"}
                ]
                """);

        assertThat(resolved.get(0).get("categoryId").asText()).isEqualTo(categoriaDelProfilo);

        // E soprattutto: nessuna categoria gemella col nome della banca.
        assertThat(hasCategoryNamed(listCategories(token), "Stipendi e pensioni")).isFalse();
    }

    // Senza stipendio configurato non c'e' nessuna categoria del profilo da
    // riusare: si ricade sul comportamento normale, col nome della banca.
    @Test
    void senzaStipendioNelProfiloLaCategoriaDellaBancaVieneCreataNormalmente() throws Exception {
        String token = api.registerAndLogin();

        createFromBank(token, """
                [
                  {"bankCategory":"Stipendi e pensioni","transactionType":"INCOME",
                   "categoryId":null,"doNotImport":false,"rowCount":1,"sampleDescription":"Stipendio"}
                ]
                """);

        assertThat(hasCategoryNamed(listCategories(token), "Stipendi e pensioni")).isTrue();
    }

    // Chi ha gia' scelto a mano non va scavalcato dalla scorciatoia.
    @Test
    void unaMappaturaGiaRisoltaAManoNonVieneToccata() throws Exception {
        String token = api.registerAndLogin();
        String miaCategoria = api.createCategory(token, "Spesa mia", "EXPENSE");

        JsonNode resolved = createFromBank(token, """
                [
                  {"bankCategory":"Generi alimentari e supermercato","transactionType":"EXPENSE",
                   "categoryId":"%s","doNotImport":false,"rowCount":24,"sampleDescription":"Coop"}
                ]
                """.formatted(miaCategoria));

        assertThat(resolved.get(0).get("categoryId").asText()).isEqualTo(miaCategoria);
        assertThat(hasCategoryNamed(listCategories(token), "Generi alimentari e supermercato")).isFalse();
    }

    // "Non importare" e' una scelta risolta quanto le altre: la scorciatoia non
    // deve trasformarla in una categoria.
    @Test
    void unaCategoriaSegnataComeDaNonImportareRestaTale() throws Exception {
        String token = api.registerAndLogin();

        JsonNode resolved = createFromBank(token, """
                [
                  {"bankCategory":"Giroconti","transactionType":"EXPENSE",
                   "categoryId":null,"doNotImport":true,"rowCount":2,"sampleDescription":"Giroconto"}
                ]
                """);

        assertThat(resolved.get(0).get("doNotImport").asBoolean()).isTrue();
        assertThat(resolved.get(0).get("categoryId").isNull()).isTrue();
        assertThat(hasCategoryNamed(listCategories(token), "Giroconti")).isFalse();
    }
}
