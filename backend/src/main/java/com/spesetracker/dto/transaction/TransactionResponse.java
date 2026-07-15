package com.spesetracker.dto.transaction;

import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record TransactionResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String categoryIcon,
        String categoryColor,
        BigDecimal amount,
        TransactionType type,
        LocalDate occurredOn,
        String description,
        UUID recurringTransactionId
) {
    public static TransactionResponse from(Transaction transaction) {
        return new TransactionResponse(
                transaction.getId(),
                transaction.getCategory().getId(),
                transaction.getCategory().getName(),
                transaction.getCategory().getIcon(),
                transaction.getCategory().getColor(),
                transaction.getAmount(),
                transaction.getType(),
                transaction.getOccurredOn(),
                transaction.getDescription(),
                transaction.getRecurringTransaction() != null ? transaction.getRecurringTransaction().getId() : null
        );
    }
}
