package com.spesetracker.dto.debt;

import com.spesetracker.model.Debt;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DebtResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String categoryIcon,
        String categoryColor,
        String name,
        BigDecimal totalAmount,
        BigDecimal alreadyPaidAmount,
        LocalDate alreadyPaidAsOf,
        BigDecimal paidAmount,
        BigDecimal remainingAmount,
        BigDecimal monthlyPaymentAmount,
        boolean active,
        Instant createdAt
) {
    // paidFromTransactions: somma delle transazioni EXPENSE della categoria collegata,
    // calcolata dal service (DebtResponse non ha accesso al repository).
    public static DebtResponse from(Debt debt, BigDecimal paidFromTransactions) {
        BigDecimal paidAmount = debt.getAlreadyPaidAmount().add(paidFromTransactions);
        BigDecimal remainingAmount = debt.getTotalAmount().subtract(paidAmount).max(BigDecimal.ZERO);

        return new DebtResponse(
                debt.getId(),
                debt.getCategory().getId(),
                debt.getCategory().getName(),
                debt.getCategory().getIcon(),
                debt.getCategory().getColor(),
                debt.getName(),
                debt.getTotalAmount(),
                debt.getAlreadyPaidAmount(),
                debt.getAlreadyPaidAsOf(),
                paidAmount,
                remainingAmount,
                debt.getMonthlyPaymentAmount(),
                Boolean.TRUE.equals(debt.getActive()),
                debt.getCreatedAt()
        );
    }
}
