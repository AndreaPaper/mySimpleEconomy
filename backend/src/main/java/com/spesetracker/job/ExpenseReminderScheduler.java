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
public class ExpenseReminderScheduler {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final ExpenseReminderAdvancementService advancementService;

    // Ogni giorno alle 05:10 (poco dopo il job delle transazioni ricorrenti): avanza
    // i promemoria di spesa fissa scaduti.
    @Scheduled(cron = "0 10 5 * * *")
    public void advanceDueReminders() {
        LocalDate today = LocalDate.now();

        List<UUID> dueReminderIds = expenseReminderRepository
                .findByActiveTrueAndNextDueDateLessThanEqual(today)
                .stream()
                .map(ExpenseReminder::getId)
                .toList();

        for (UUID reminderId : dueReminderIds) {
            try {
                advancementService.advanceDueReminder(reminderId, today);
            } catch (Exception e) {
                log.error("Errore nell'avanzamento del promemoria {}", reminderId, e);
            }
        }
    }
}
