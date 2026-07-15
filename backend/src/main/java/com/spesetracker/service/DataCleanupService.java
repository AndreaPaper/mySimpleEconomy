package com.spesetracker.service;

import com.spesetracker.dto.cleanup.DataCleanupResult;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

// Ripulisce i dati "diario" di un utente per permettere un reimport pulito da Excel.
// Le categorie non vengono mai toccate qui: sono riferimenti riusabili (nome/colore/icona),
// non eventi datati, e tenerle evita di doverle ricreare ad ogni reimport.
@Service
@RequiredArgsConstructor
public class DataCleanupService {

    private final TransactionRepository transactionRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final BalanceCheckpointRepository balanceCheckpointRepository;
    private final ExpenseReminderRepository expenseReminderRepository;

    @Transactional
    public DataCleanupResult cleanup(UUID userId, LocalDate from, LocalDate to) {
        if (from == null && to == null) {
            return fullWipe(userId);
        }
        return rangeWipe(userId, from != null ? from : LocalDate.MIN, to != null ? to : LocalDate.MAX);
    }

    private DataCleanupResult fullWipe(UUID userId) {
        long transactionsDeleted = transactionRepository.deleteByUserId(userId);
        long recurringDeleted = recurringTransactionRepository.deleteByUserId(userId);
        long checkpointsDeleted = balanceCheckpointRepository.deleteByUserId(userId);
        long remindersDeleted = expenseReminderRepository.deleteByUserId(userId);
        return new DataCleanupResult(transactionsDeleted, recurringDeleted, checkpointsDeleted, remindersDeleted);
    }

    private DataCleanupResult rangeWipe(UUID userId, LocalDate from, LocalDate to) {
        long transactionsDeleted = transactionRepository.deleteByUserIdAndOccurredOnBetween(userId, from, to);
        long checkpointsDeleted = balanceCheckpointRepository.deleteByUserIdAndCheckpointDateBetween(userId, from, to);
        return new DataCleanupResult(transactionsDeleted, 0, checkpointsDeleted, 0);
    }
}
