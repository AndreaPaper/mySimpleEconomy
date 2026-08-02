package com.spesetracker.repository;

import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    List<Transaction> findByUserIdOrderByOccurredOnDesc(UUID userId, Pageable pageable);

    List<Transaction> findByUserIdAndOccurredOnBetween(UUID userId, LocalDate from, LocalDate to);

    List<Transaction> findByUserIdAndCategoryIdAndOccurredOnBetween(
            UUID userId, UUID categoryId, LocalDate from, LocalDate to);

    // Usata da DebtService per calcolare quanto è stato pagato di un debito:
    // somma (in Java, coerente con lo stile del resto del progetto) tutte le
    // transazioni di questo tipo nella categoria collegata al debito.
    List<Transaction> findByUserIdAndCategoryIdAndType(UUID userId, UUID categoryId, TransactionType type);

    long countByRecurringTransactionId(UUID recurringTransactionId);

    long deleteByUserId(UUID userId);

    long deleteByUserIdAndOccurredOnBetween(UUID userId, LocalDate from, LocalDate to);
}
