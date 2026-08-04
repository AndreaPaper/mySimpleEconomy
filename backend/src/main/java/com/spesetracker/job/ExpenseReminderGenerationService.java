package com.spesetracker.job;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExpenseReminderGenerationService {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final TransactionRepository transactionRepository;

    // Elabora un singolo promemoria in una propria transazione, così un errore
    // su uno non blocca la generazione degli altri.
    @Transactional
    public void generateForMonth(UUID reminderId, YearMonth month) {
        ExpenseReminder reminder = expenseReminderRepository.findById(reminderId).orElse(null);
        if (reminder == null || !Boolean.TRUE.equals(reminder.getActive()) || reminder.getCategory() == null) {
            return;
        }

        if (transactionRepository.existsByExpenseReminderIdAndOccurredOnBetween(
                reminder.getId(), month.atDay(1), month.atEndOfMonth())) {
            return; // già generata per questo mese
        }

        BigDecimal amount = resolveAmount(reminder);
        if (amount == null) {
            return; // nessun prezzo assegnato e nessuno storico da cui stimarlo
        }

        Transaction transaction = Transaction.builder()
                .user(reminder.getUser())
                .category(reminder.getCategory())
                .expenseReminder(reminder)
                .amount(amount)
                .type(TransactionType.valueOf(reminder.getCategory().getType().name()))
                .occurredOn(month.atDay(1))
                .description(reminder.getName())
                .build();

        transactionRepository.save(transaction);
    }

    // Prezzo del promemoria se presente, altrimenti l'importo dell'ultima spesa
    // registrata nella stessa categoria; null se nessuno dei due è disponibile.
    private BigDecimal resolveAmount(ExpenseReminder reminder) {
        if (reminder.getAmount() != null) {
            return reminder.getAmount();
        }

        return transactionRepository
                .findFirstByUserIdAndCategoryIdAndTypeOrderByOccurredOnDesc(
                        reminder.getUser().getId(), reminder.getCategory().getId(), TransactionType.EXPENSE)
                .map(Transaction::getAmount)
                .orElse(null);
    }
}
