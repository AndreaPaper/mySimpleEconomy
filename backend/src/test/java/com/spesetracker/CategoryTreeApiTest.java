package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La forma dell'albero delle categorie, e l'archivio.
 *
 * <p>{@code CategoryService} aveva 16 rami su 30 senza un test: la peggiore
 * copertura di rami del backend, su un file che contiene tutte le regole di
 * forma dell'albero. Gli errori qui non si vedono subito — si vedono dopo,
 * quando un utente ha una gerarchia che l'app non sa più mostrare.
 *
 * <p>La regola di fondo è che l'albero ha <em>due livelli, non tre</em>. È
 * imposta da due divieti opposti che vanno provati separatamente: una
 * sottocategoria non può fare da padre, e una categoria che è già padre non può
 * diventare figlia. Toglierne uno solo lascia passare il terzo livello dal lato
 * rimasto scoperto.
 */
class CategoryTreeApiTest extends AbstractIntegrationTest {

    private String createCategory(String token, String body) throws Exception {
        String json = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(json).get("id").asText();
    }

    private static String categoria(String name, String type) {
        return "{\"name\":\"%s\",\"type\":\"%s\"}".formatted(name, type);
    }

    private static String sottocategoria(String name, String type, String parentId) {
        return "{\"name\":\"%s\",\"type\":\"%s\",\"parentId\":\"%s\"}".formatted(name, type, parentId);
    }

    // ---------- I nomi ----------

    @Test
    void unNomeGiaUsatoVieneRifiutatoInCreazione() throws Exception {
        String token = api.registerAndLogin();
        createCategory(token, categoria("Casa", "EXPENSE"));

        // Anche con un tipo diverso: il vincolo è sul nome per utente, perché
        // due voci uguali in elenco non si distinguerebbero comunque.
        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(categoria("casa", "INCOME")))
                .andExpect(status().isConflict());
    }

    /**
     * In modifica il confronto salta il nome attuale della categoria stessa,
     * altrimenti rinominare "Casa" in "Casa" (o cambiarne solo il colore)
     * fallirebbe contro sé stessa.
     */
    @Test
    void inModificaIlNomeAttualeNonConfliggeConSeStesso() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));
        createCategory(token, categoria("Auto", "EXPENSE"));

        mockMvc.perform(put("/api/categories/" + casa)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Casa\",\"color\":\"#22C55E\"}"))
                .andExpect(status().isOk());

        // Ma prendere il nome di un'altra resta vietato.
        mockMvc.perform(put("/api/categories/" + casa)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Auto\"}"))
                .andExpect(status().isConflict());
    }

    // ---------- I due livelli ----------

    @Test
    void unaSottocategoriaNonPuoAvereAltreSottocategorie() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));
        String bollette = createCategory(token, sottocategoria("Bollette", "EXPENSE", casa));

        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sottocategoria("Luce", "EXPENSE", bollette)))
                .andExpect(status().isBadRequest());
    }

    /**
     * L'altra metà dello stesso divieto, dal lato opposto: "Casa" ha già dei
     * figli, quindi non può a sua volta diventare figlia di qualcun altro.
     * Senza questo controllo il terzo livello si crea comunque, solo partendo
     * dal basso.
     */
    @Test
    void unaCategoriaConFigliNonPuoDiventareSottocategoria() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));
        createCategory(token, sottocategoria("Bollette", "EXPENSE", casa));
        String vita = createCategory(token, categoria("Vita quotidiana", "EXPENSE"));

        mockMvc.perform(put("/api/categories/" + casa)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Casa\",\"parentId\":\"" + vita + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unaCategoriaNonPuoEssereSottocategoriaDiSeStessa() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));

        mockMvc.perform(put("/api/categories/" + casa)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Casa\",\"parentId\":\"" + casa + "\"}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * Una spesa sotto un'entrata darebbe un albero in cui il segno del figlio
     * contraddice quello del padre: i totali per categoria padre, che sommano i
     * figli, diventerebbero privi di senso.
     */
    @Test
    void ilPadreDeveEssereDelloStessoTipo() throws Exception {
        String token = api.registerAndLogin();
        String stipendio = createCategory(token, categoria("Stipendio", "INCOME"));

        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sottocategoria("Spesa cibo", "EXPENSE", stipendio)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unPadreInesistenteNonEsisteNemmenoComeErrore() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sottocategoria("Orfana", "EXPENSE", UUID.randomUUID().toString())))
                .andExpect(status().isNotFound());
    }

    // ---------- L'archivio ----------

    /**
     * Archiviando un padre si archiviano anche i figli. Se la cascata salta, le
     * sottocategorie restano in elenco come categorie principali, staccate dal
     * contesto che le spiegava: "Luce" e "Gas" senza più "Casa" sopra.
     */
    @Test
    void archiviareUnPadreArchiviaAncheIFigli() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));
        createCategory(token, sottocategoria("Luce", "EXPENSE", casa));

        mockMvc.perform(post("/api/categories/" + casa + "/archive")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/categories/archived").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(2));
    }

    /**
     * Riattivando un figlio torna su anche il padre, e solo lui: il resto del
     * ramo resta archiviato. Senza, il figlio ricomparirebbe orfano — visibile
     * in elenco ma appeso a un padre che l'elenco non mostra.
     */
    @Test
    void riattivareUnFiglioRisvegliaIlPadreMaNonIFratelli() throws Exception {
        String token = api.registerAndLogin();
        String casa = createCategory(token, categoria("Casa", "EXPENSE"));
        String luce = createCategory(token, sottocategoria("Luce", "EXPENSE", casa));
        createCategory(token, sottocategoria("Gas", "EXPENSE", casa));

        mockMvc.perform(post("/api/categories/" + casa + "/archive")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/categories/" + luce + "/unarchive")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Tornati: Casa e Luce. Rimasto archiviato: Gas.
        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/categories/archived").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Gas"));
    }

    // ---------- I valori predefiniti ----------

    /**
     * Rigenerare i predefiniti quando ce n'è già uno con lo stesso nome non
     * deve duplicarlo. Il pulsante è a portata di mano nelle impostazioni e
     * niente impedisce di premerlo due volte.
     */
    @Test
    void rigenerareIPredefinitiNonDuplicaQuelliGiaPresenti() throws Exception {
        String token = api.registerAndLogin();

        String primaVolta = mockMvc.perform(post("/api/categories/generate-defaults")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        int quante = objectMapper.readTree(primaVolta).size();

        mockMvc.perform(post("/api/categories/generate-defaults")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(quante));
    }
}
