package com.spesetracker.repository;

import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.enums.CategoryType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface RecurringTransactionRepository extends JpaRepository<RecurringTransaction, UUID> {

    // Regole scadute da elaborare nel job giornaliero (sfrutta idx_recurring_next_due).
    List<RecurringTransaction> findByActiveTrueAndNextDueDateLessThanEqual(LocalDate date);

    List<RecurringTransaction> findByUserIdAndActiveTrue(UUID userId);

    // Prossime scadenze in uscita per la dashboard.
    List<RecurringTransaction> findByUserIdAndActiveTrueAndCategoryTypeOrderByNextDueDateAsc(
            UUID userId, CategoryType categoryType);
}
