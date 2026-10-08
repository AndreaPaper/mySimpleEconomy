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
                // Alla data di scadenza reale. Era retrodatata al primo del mese "per
                // dare subito una stima del saldo", ma la generazione avviene solo a
                // scadenza arrivata, quindi non anticipava niente: spostava soltanto
                // la data. E la data sbagliata faceva danni veri. Lo stipendio del 27
                // finiva al 1°, cioè nel periodo di stipendio precedente. E l'import
                // dalla banca non lo riconosceva più come lo stesso movimento del 27,
                // 26 giorni dopo: entrava una seconda volta, e il saldo contava due
                // stipendi. La stima del mese la dà la previsione, che proietta le
                // regole non ancora scadute.
                .occurredOn(rule.getNextDueDate())
                .description(rule.getName())
                .build();

        transactionRepository.save(transaction);
    }
}
