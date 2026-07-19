package com.spesetracker.service;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

// Invia l'email di promemoria tramite l'API HTTP di Resend (nessun dominio da
// verificare: si spedisce da onboarding@resend.dev). Un fallimento qui va
// sempre propagato, mai inghiottito: è il chiamante a decidere se registrare
// la notifica come inviata.
@Slf4j
@Service
public class EmailNotificationService {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final RestClient restClient;
    private final String apiKey;
    private final String fromAddress;

    public EmailNotificationService(
            RestClient.Builder restClientBuilder,
            @Value("${app.email.resend-api-key}") String apiKey,
            @Value("${app.email.from-address}") String fromAddress
    ) {
        this.restClient = restClientBuilder.baseUrl("https://api.resend.com").build();
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;
    }

    public void sendReminderNotification(User user, ExpenseReminder reminder) {
        LocalDate today = LocalDate.now();
        long daysAway = ChronoUnit.DAYS.between(today, reminder.getNextDueDate());
        String when = daysAway <= 0 ? "oggi" : "tra " + daysAway + " giorni";

        String subject = "Promemoria: " + reminder.getName() + " " + when;
        String body = "Il promemoria \"" + reminder.getName() + "\" scade il "
                + DATE_FORMAT.format(reminder.getNextDueDate()) + " (" + when + ").";

        restClient.post()
                .uri("/emails")
                .header("Authorization", "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "from", fromAddress,
                        "to", List.of(user.getEmail()),
                        "subject", subject,
                        "text", body
                ))
                .retrieve()
                .toBodilessEntity();

        log.info("Email di promemoria inviata a {} per il promemoria {}", user.getEmail(), reminder.getId());
    }
}
