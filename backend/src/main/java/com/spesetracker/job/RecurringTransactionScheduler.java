package com.spesetracker.job;

import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.repository.RecurringTransactionRepository;
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
public class RecurringTransactionScheduler {

    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringTransactionGenerationService generationService;

    // Ogni giorno alle 05:00, ora del server: genera le transazioni per le regole ricorrenti scadute.
    @Scheduled(cron = "0 0 5 * * *")
    public void generateDueTransactions() {
        LocalDate today = LocalDate.now();

        List<UUID> dueRuleIds = recurringTransactionRepository
                .findByActiveTrueAndNextDueDateLessThanEqual(today)
                .stream()
                .map(RecurringTransaction::getId)
                .toList();

        for (UUID ruleId : dueRuleIds) {
            try {
                generationService.processDueRule(ruleId, today);
            } catch (Exception e) {
                log.error("Errore nella generazione della transazione ricorrente {}", ruleId, e);
            }
        }
    }
}
