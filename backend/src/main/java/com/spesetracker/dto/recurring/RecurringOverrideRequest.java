package com.spesetracker.dto.recurring;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RecurringOverrideRequest(
        @NotNull LocalDate occurrenceDate,
        @NotNull BigDecimal overrideAmount,
        @Size(max = 255) String note
) {
}
