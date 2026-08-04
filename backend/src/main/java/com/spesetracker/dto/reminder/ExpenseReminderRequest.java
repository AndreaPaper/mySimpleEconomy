package com.spesetracker.dto.reminder;

import com.spesetracker.model.enums.IntervalUnit;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseReminderRequest(
        @NotNull UUID categoryId,
        @NotBlank String name,
        @DecimalMin(value = "0.01") BigDecimal amount,
        @NotNull IntervalUnit intervalUnit,
        @NotNull @Positive Short intervalValue,
        @NotNull LocalDate startDate,
        @NotNull LocalDate nextDueDate,
        LocalDate endDate,
        @Min(0) Short notifyDaysBefore
) {
}
