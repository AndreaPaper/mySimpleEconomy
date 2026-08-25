package com.spesetracker.dto.savings;

import com.spesetracker.model.SavingsTransaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record SavingsTransactionResponse(
        UUID id,
        UUID goalId,
        String goalName,
        BigDecimal amount,
        LocalDate occurredOn,
        String note
) {
    public static SavingsTransactionResponse from(SavingsTransaction movement) {
        return new SavingsTransactionResponse(
                movement.getId(),
                movement.getGoal().getId(),
                movement.getGoal().getName(),
                movement.getAmount(),
                movement.getOccurredOn(),
                movement.getNote()
        );
    }
}
