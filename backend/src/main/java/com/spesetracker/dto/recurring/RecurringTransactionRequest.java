package com.spesetracker.dto.recurring;

import com.spesetracker.model.enums.IntervalUnit;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record RecurringTransactionRequest(
        @NotNull UUID categoryId,
        @NotBlank String name,
        @NotNull @DecimalMin(value = "0.01", message = "L'importo deve essere maggiore di zero") BigDecimal defaultAmount,
        @NotNull IntervalUnit intervalUnit,
        @NotNull @Positive Short intervalValue,
        @NotNull LocalDate startDate,
        @NotNull LocalDate nextDueDate,
        LocalDate endDate
) {
}
