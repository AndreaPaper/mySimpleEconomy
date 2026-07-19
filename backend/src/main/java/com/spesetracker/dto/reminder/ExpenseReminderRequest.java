package com.spesetracker.dto.reminder;

import com.spesetracker.model.enums.IntervalUnit;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;

public record ExpenseReminderRequest(
        @NotBlank String name,
        @NotNull IntervalUnit intervalUnit,
        @NotNull @Positive Short intervalValue,
        @NotNull LocalDate startDate,
        @NotNull LocalDate nextDueDate,
        LocalDate endDate,
        @Min(0) Short notifyDaysBefore
) {
}
