package com.spesetracker.dto.savings;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record SavingsTransactionRequest(
        @NotNull UUID goalId,
        // Positivo = accantonamento, negativo = prelievo. Zero è rifiutato dal
        // service: non è un movimento.
        @NotNull BigDecimal amount,
        @NotNull LocalDate occurredOn,
        @Size(max = 255) String note
) {
}
