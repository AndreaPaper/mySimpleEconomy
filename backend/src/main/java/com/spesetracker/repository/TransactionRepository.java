package com.spesetracker.repository;

import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    // Elenco paginato "vedi tutto" (nessun intervallo di date): l'ordinamento
    // arriva dal Pageable passato dal service, non dal nome del metodo.
    Slice<Transaction> findByUserId(UUID userId, Pageable pageable);

    Slice<Transaction> findByUserIdAndCategoryId(UUID userId, UUID categoryId, Pageable pageable);

    // Fallback di importo per la generazione da promemoria: l'ultima spesa
    // registrata in quella categoria, se il promemoria non ha un prezzo suo.
    Optional<Transaction> findFirstByUserIdAndCategoryIdAndTypeOrderByOccurredOnDesc(
            UUID userId, UUID categoryId, TransactionType type);

    // Dedup per il job di generazione a inizio mese: evita di duplicare la
    // transazione se il job viene rieseguito nello stesso mese.
    boolean existsByExpenseReminderIdAndOccurredOnBetween(UUID expenseReminderId, LocalDate from, LocalDate to);

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
