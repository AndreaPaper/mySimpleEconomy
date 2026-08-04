package com.spesetracker.job;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExpenseReminderGenerationScheduler {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final ExpenseReminderGenerationService generationService;

    // Il giorno 1 di ogni mese alle 06:00, dopo il job di avanzamento delle 05:10:
    // genera la transazione riepilogativa per i promemoria con una scadenza in questo mese.
    @Scheduled(cron = "0 0 6 1 * *")
    public void generateForCurrentMonth() {
        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.from(today);

        List<UUID> candidateIds = expenseReminderRepository
                .findByActiveTrueAndCategoryIsNotNullAndNextDueDateBetween(
                        currentMonth.atDay(1), currentMonth.atEndOfMonth())
                .stream()
                .map(ExpenseReminder::getId)
                .toList();

        for (UUID reminderId : candidateIds) {
            try {
                generationService.generateForMonth(reminderId, currentMonth);
            } catch (Exception e) {
                log.error("Errore nella generazione della spesa fissa per il promemoria {}", reminderId, e);
            }
        }
    }
}
