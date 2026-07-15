package com.spesetracker.repository;

import com.spesetracker.model.Transaction;
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

    long countByRecurringTransactionId(UUID recurringTransactionId);

    long deleteByUserId(UUID userId);

    long deleteByUserIdAndOccurredOnBetween(UUID userId, LocalDate from, LocalDate to);
}
