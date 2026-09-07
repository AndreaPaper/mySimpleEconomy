package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cosa risponde l'app quando un id non esiste.
 *
 * <p>Sono le risposte che il frontend riceve nella situazione più banale e più
 * frequente: un dato cancellato da un'altra scheda del browser, un id rimasto in
 * una copia locale, o — nel caso peggiore — un id che appartiene a un altro
 * utente. Erano righe sparse in sei servizi, tutte scoperte, tutte con lo stesso
 * motivo per esistere.
 */
class GuardieApiTest extends AbstractIntegrationTest {

    private static final String INESISTENTE = "00000000-0000-4000-8000-000000000000";

    /**
     * Quattro endpoint diversi che devono dire la stessa cosa davanti a una
     * categoria che non c'è. Se uno solo rispondesse 500, il frontend
     * mostrerebbe "errore imprevisto" al posto di "categoria non trovata" —
     * e su un'app che si usa dal telefono la differenza è fra capire e riprovare
     * a caso.
     */
    @ParameterizedTest(name = "{0} con una categoria inesistente dà 404")
    @CsvSource({
            "/api/transactions,          '{\"categoryId\":\"%s\",\"amount\":10,\"type\":\"EXPENSE\",\"occurredOn\":\"2026-03-01\"}'",
            "/api/debts,                 '{\"categoryId\":\"%s\",\"name\":\"Prestito\",\"totalAmount\":100}'",
            "/api/expense-reminders,     '{\"categoryId\":\"%s\",\"name\":\"Bollo\",\"intervalUnit\":\"MONTH\",\"intervalValue\":1,\"startDate\":\"2026-03-01\",\"nextDueDate\":\"2026-03-01\"}'",
            "/api/recurring-transactions,'{\"categoryId\":\"%s\",\"name\":\"Affitto\",\"defaultAmount\":10,\"intervalUnit\":\"MONTH\",\"intervalValue\":1,\"startDate\":\"2026-03-01\",\"nextDueDate\":\"2026-03-01\"}'",
    })
    void unaCategoriaInesistenteDaSempre404(String endpoint, String corpo) throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post(endpoint.trim())
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo.formatted(INESISTENTE)))
                .andExpect(status().isNotFound());
    }

    /**
     * L'accesso con un'email mai registrata deve rispondere <em>identico</em>
     * all'accesso con la password sbagliata. Sono due rami diversi del codice, e
     * la differenza fra "utente non trovato" e "credenziali non valide"
     * direbbe a chiunque provi quali email sono registrate nell'app.
     */
    @Test
    void unEmailInesistenteRispondeComeUnaPasswordSbagliata() throws Exception {
        String email = "esiste-" + UUID.randomUUID() + "@example.com";
        api.registerAndLogin(email, "password123");

        String conPasswordSbagliata = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"sbagliata\"}".formatted(email)))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        String conEmailInesistente = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"mai-vista-%s@example.com\",\"password\":\"password123\"}"
                                .formatted(UUID.randomUUID())))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        assertThat(conEmailInesistente).isEqualTo(conPasswordSbagliata);
    }

    // ---------- Le eccezioni delle regole ricorrenti ----------

    @Test
    void unEccezioneInesistenteDa404() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        String regola = api.createRecurring(token, categoria, "Affitto", "750.00", LocalDate.of(2026, 3, 1));

        mockMvc.perform(delete("/api/recurring-transactions/" + regola + "/overrides/" + INESISTENTE)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    /**
     * Il caso scomodo: l'eccezione esiste davvero, ma appartiene a un'altra
     * regola. Senza il controllo di appartenenza si cancellerebbe l'eccezione
     * della regola sbagliata passando un id valido nell'indirizzo di un'altra —
     * e la cancellazione riuscirebbe, quindi nulla lo segnalerebbe.
     */
    @Test
    void unEccezioneDiUnAltraRegolaNonSiCancellaDaLi() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        String affitto = api.createRecurring(token, categoria, "Affitto", "750.00", LocalDate.of(2026, 3, 1));
        String palestra = api.createRecurring(token, categoria, "Palestra", "40.00", LocalDate.of(2026, 3, 1));

        String eccezione = objectMapper.readTree(mockMvc.perform(
                        post("/api/recurring-transactions/" + affitto + "/overrides")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"occurrenceDate\":\"2026-04-01\",\"overrideAmount\":830.00}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString())
                .get("id").asText();

        mockMvc.perform(delete("/api/recurring-transactions/" + palestra + "/overrides/" + eccezione)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());

        // Ed è ancora lì, sotto la regola a cui appartiene.
        mockMvc.perform(get("/api/recurring-transactions/" + affitto + "/overrides")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(1));
    }

    // ---------- L'elenco filtrato ----------

    /**
     * L'elenco per intervallo di date <em>e</em> categoria: è la richiesta che
     * fa la Dashboard per la card "Spese per categoria", ed è un ramo diverso da
     * quello senza categoria. Nessun test lo esercitava — tutti elencano tutto —
     * quindi la query filtrata non era mai stata eseguita.
     */
    @Test
    void lElencoFiltratoPerCategoriaTieneSoloQuella() throws Exception {
        String token = api.registerAndLogin();
        String casa = api.createExpenseCategory(token);
        String svago = api.createExpenseCategory(token);
        api.createTransaction(token, casa, LocalDate.of(2026, 3, 10), "100.00", "EXPENSE");
        api.createTransaction(token, svago, LocalDate.of(2026, 3, 11), "20.00", "EXPENSE");

        mockMvc.perform(get("/api/transactions")
                        .param("from", "2026-03-01")
                        .param("to", "2026-03-31")
                        .param("categoryId", casa)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].amount").value(100.00));
    }
}
