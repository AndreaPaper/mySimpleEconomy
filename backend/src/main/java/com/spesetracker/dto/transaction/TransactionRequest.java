package com.spesetracker.dto.transaction;

import com.spesetracker.model.enums.TransactionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record TransactionRequest(
        @NotNull UUID categoryId,
        @NotNull @DecimalMin(value = "0.01", message = "L'importo deve essere maggiore di zero") BigDecimal amount,
        @NotNull TransactionType type,
        @NotNull LocalDate occurredOn,
        @Size(max = 255) String description
) {
}
