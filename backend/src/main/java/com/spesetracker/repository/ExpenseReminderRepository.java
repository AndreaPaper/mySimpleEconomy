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

    // Candidati per il job di notifica: promemoria attivi con preavviso configurato.
    List<ExpenseReminder> findByActiveTrueAndNotifyDaysBeforeIsNotNull();

    // Candidati per il job di generazione a inizio mese: promemoria attivi,
    // con una categoria assegnata (altrimenti non sapremmo su cosa registrare
    // la transazione), la cui prossima scadenza cade nel mese indicato.
    List<ExpenseReminder> findByActiveTrueAndCategoryIsNotNullAndNextDueDateBetween(LocalDate from, LocalDate to);

    long deleteByUserId(UUID userId);
}
