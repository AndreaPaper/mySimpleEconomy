package com.spesetracker.repository;

import com.spesetracker.model.ExpenseReminder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ExpenseReminderRepository extends JpaRepository<ExpenseReminder, UUID> {

    List<ExpenseReminder> findByUserIdOrderByNextDueDateAsc(UUID userId);

    List<ExpenseReminder> findByUserIdAndActiveTrue(UUID userId);

    // Promemoria scaduti da avanzare nel job giornaliero (sfrutta l'indice parziale).
    List<ExpenseReminder> findByActiveTrueAndNextDueDateLessThanEqual(LocalDate date);
}
