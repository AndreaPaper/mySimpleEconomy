package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Promemoria di spesa fissa senza importo: crea una regola mensile e verifica che
// venga proiettata correttamente nei mesi futuri richiesti.
class ExpenseReminderSmokeTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void reminderIsProjectedAcrossUpcomingMonths() throws Exception {
        String email = "reminder+" + UUID.randomUUID() + "@example.com";
        MvcResult registerResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        String token = objectMapper.readTree(registerResult.getResponse().getContentAsString()).get("token").asText();

        // Un promemoria richiede sempre una categoria di uscita (ExpenseReminderRequest.categoryId
        // è @NotNull e il service accetta solo categorie EXPENSE dell'utente), anche quando
        // l'importo non è noto in anticipo — che è il caso coperto da questo test.
        MvcResult categoryResult = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Assicurazioni","type":"EXPENSE","color":"#3B82F6"}
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        String categoryId = objectMapper.readTree(categoryResult.getResponse().getContentAsString()).get("id").asText();

        LocalDate nextDue = LocalDate.now().plusDays(5);
        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Assicurazione scooter","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(categoryId, nextDue, nextDue)))
                .andExpect(status().isCreated());

        MvcResult upcomingResult = mockMvc.perform(get("/api/expense-reminders/upcoming")
                        .param("months", "3")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode response = objectMapper.readTree(upcomingResult.getResponse().getContentAsString());
        assertThat(response.get("months")).hasSize(3);

        int totalOccurrences = 0;
        for (JsonNode month : response.get("months")) {
            totalOccurrences += month.get("occurrences").size();
        }
        // Un promemoria mensile con prossima scadenza fra 5 giorni deve comparire
        // almeno 2 volte in un orizzonte di 3 mesi (questo mese + il successivo, a
        // seconda di dove cade esattamente rispetto alla fine del mese corrente).
        assertThat(totalOccurrences).isGreaterThanOrEqualTo(2);

        // In quale mese cada la prima occorrenza dipende dal giorno in cui gira il
        // test: negli ultimi cinque giorni del mese la scadenza slitta a quello
        // dopo e il primo mese resta vuoto. Si cerca quindi fra tutti i mesi,
        // altrimenti la suite si rompe da sola una volta al mese.
        List<String> names = new ArrayList<>();
        for (JsonNode month : response.get("months")) {
            for (JsonNode occurrence : month.get("occurrences")) {
                names.add(occurrence.get("name").asText());
            }
        }
        assertThat(names).contains("Assicurazione scooter");
    }
}
