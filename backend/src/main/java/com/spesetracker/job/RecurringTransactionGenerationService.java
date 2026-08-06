package com.spesetracker.job;

import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.RecurringOverrideRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RecurringTransactionGenerationService {

    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringOverrideRepository recurringOverrideRepository;
    private final TransactionRepository transactionRepository;

    // Elabora una singola regola in una propria transazione, così un errore su una regola
    // non blocca la generazione delle altre. Se next_due_date è rimasta indietro di più
    // occorrenze (es. downtime), le recupera tutte in questa esecuzione.
    @Transactional
    public void processDueRule(UUID recurringTransactionId, LocalDate today) {
        RecurringTransaction rule = recurringTransactionRepository.findById(recurringTransactionId).orElse(null);
        if (rule == null) {
            return;
        }

        while (rule.isCurrentlyActive(today) && !rule.getNextDueDate().isAfter(today)) {
            generateOccurrence(rule);
            rule.advanceNextDueDate();
        }

        if (!rule.isCurrentlyActive(today)) {
            rule.setActive(false);
        }
    }

    private void generateOccurrence(RecurringTransaction rule) {
        BigDecimal amount = recurringOverrideRepository
                .findByRecurringTransactionIdAndOccurrenceDate(rule.getId(), rule.getNextDueDate())
                .map(RecurringOverride::getOverrideAmount)
                .orElse(rule.getDefaultAmount());

        Transaction transaction = Transaction.builder()
                .user(rule.getUser())
                .category(rule.getCategory())
                .recurringTransaction(rule)
                .amount(amount)
                .type(TransactionType.valueOf(rule.getCategory().getType().name()))
                // Prenotata a inizio mese (non alla data di scadenza reale) per
                // dare subito una stima del saldo residuo del mese, invece di
                // aspettare il giorno esatto. La data di scadenza reale resta
                // usata sopra per il lookup dell'eventuale RecurringOverride.
                .occurredOn(rule.getNextDueDate().withDayOfMonth(1))
                .description(rule.getName())
                .build();

        transactionRepository.save(transaction);
    }
}
