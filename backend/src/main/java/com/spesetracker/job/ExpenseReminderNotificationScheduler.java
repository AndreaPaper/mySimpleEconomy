package com.spesetracker.job;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExpenseReminderNotificationScheduler {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final ExpenseReminderNotificationService notificationService;

    // Ogni giorno alle 08:00, separato dal job delle 05:10 che avanza le
    // scadenze: qui si decide solo se inviare un'email di preavviso.
    @Scheduled(cron = "0 0 8 * * *")
    public void sendDueNotifications() {
        LocalDate today = LocalDate.now();

        List<UUID> candidateIds = expenseReminderRepository
                .findByActiveTrueAndNotifyDaysBeforeIsNotNull()
                .stream()
                .map(ExpenseReminder::getId)
                .toList();

        for (UUID reminderId : candidateIds) {
            try {
                notificationService.notifyIfDue(reminderId, today);
            } catch (Exception e) {
                log.error("Errore nell'invio della notifica per il promemoria {}", reminderId, e);
            }
        }
    }
}
