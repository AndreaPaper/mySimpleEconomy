package com.spesetracker.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Scorciatoie per costruire lo stato di partenza di un test via API pubblica (niente
 * accesso diretto ai repository: si esercita lo stesso percorso dell'applicazione reale).
 *
 * <p>Ogni metodo asserisce che la creazione sia andata a buon fine, così un test che
 * fallisce lo fa sull'asserzione che gli interessa e non su un setup rotto in silenzio.
 */
public class ApiTestClient {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;

    public ApiTestClient(MockMvc mockMvc, ObjectMapper objectMapper) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
    }

    /** Registra un utente con email casuale e restituisce il token JWT. */
    public String registerAndLogin() throws Exception {
        return registerAndLogin("user+" + UUID.randomUUID() + "@example.com", "password123");
    }

    public String registerAndLogin(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(email, password)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("token").asText();
    }

    public String createCategory(String token, String name, String type) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","type":"%s","color":"#3B82F6","icon":"cart"}
                                """.formatted(name, type)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("id").asText();
    }

    /** Categoria di uscita con nome unico: evita collisioni sul vincolo di unicità per utente. */
    public String createExpenseCategory(String token) throws Exception {
        return createCategory(token, "Uscita-" + UUID.randomUUID(), "EXPENSE");
    }

    public String createIncomeCategory(String token) throws Exception {
        return createCategory(token, "Entrata-" + UUID.randomUUID(), "INCOME");
    }

    public String createTransaction(String token, String categoryId, LocalDate on, String amount, String type)
            throws Exception {
        MvcResult result = mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":%s,"type":"%s","occurredOn":"%s","description":"test"}
                                """.formatted(categoryId, amount, type, on)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("id").asText();
    }

    public void createCheckpoint(String token, LocalDate date, String balance) throws Exception {
        mockMvc.perform(post("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"checkpointDate":"%s","balance":%s}
                                """.formatted(date, balance)))
                .andExpect(status().isOk());
    }

    public String createRecurring(String token, String categoryId, String name, String amount, LocalDate nextDue)
            throws Exception {
        MvcResult result = mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"%s","defaultAmount":%s,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(categoryId, name, amount, nextDue, nextDue)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("id").asText();
    }

    public String createReminder(String token, String categoryId, String name, LocalDate nextDue) throws Exception {
        return createReminder(token, categoryId, name, nextDue, "MONTH", 1, null, null, null);
    }

    /**
     * Versione completa: serve ai test dei job, che devono poter impostare il preavviso, un
     * intervallo diverso dal mensile, una data di fine o un importo — nessuno dei quali è
     * esprimibile con la scorciatoia sopra. I parametri opzionali sono {@code null} quando il
     * campo non va inviato affatto, che per il preavviso e per l'importo è un caso diverso da
     * "inviato a zero".
     */
    public String createReminder(
            String token,
            String categoryId,
            String name,
            LocalDate nextDue,
            String intervalUnit,
            int intervalValue,
            Integer notifyDaysBefore,
            LocalDate endDate,
            String amount
    ) throws Exception {
        String optional = (notifyDaysBefore == null ? "" : ",\"notifyDaysBefore\":" + notifyDaysBefore)
                + (endDate == null ? "" : ",\"endDate\":\"" + endDate + "\"")
                + (amount == null ? "" : ",\"amount\":" + amount);
        MvcResult result = mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"%s","intervalUnit":"%s","intervalValue":%d,\
                                "startDate":"%s","nextDueDate":"%s"%s}
                                """.formatted(
                                categoryId, name, intervalUnit, intervalValue, nextDue, nextDue, optional)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("id").asText();
    }

    /** Previsione dell'utente, già deserializzata. */
    public JsonNode forecast(String token, int months) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/forecast")
                        .param("months", String.valueOf(months))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return json(result);
    }

    public BigDecimal currentBalance(String token) throws Exception {
        return forecast(token, 1).get("currentBalance").decimalValue();
    }

    /** Contenuto della pagina di /api/transactions (l'endpoint restituisce {content, hasNext}). */
    public JsonNode listTransactions(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/transactions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return json(result).get("content");
    }

    public JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
