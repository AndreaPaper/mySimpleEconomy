package com.spesetracker.repository;

import com.spesetracker.model.RecurringOverride;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecurringOverrideRepository extends JpaRepository<RecurringOverride, UUID> {

    Optional<RecurringOverride> findByRecurringTransactionIdAndOccurrenceDate(
            UUID recurringTransactionId, LocalDate occurrenceDate);

    List<RecurringOverride> findByRecurringTransactionIdOrderByOccurrenceDateAsc(UUID recurringTransactionId);
}
