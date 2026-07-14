package com.spesetracker.dto.recurring;

import com.spesetracker.model.RecurringOverride;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record RecurringOverrideResponse(
        UUID id,
        LocalDate occurrenceDate,
        BigDecimal overrideAmount,
        String note
) {
    public static RecurringOverrideResponse from(RecurringOverride override) {
        return new RecurringOverrideResponse(
                override.getId(),
                override.getOccurrenceDate(),
                override.getOverrideAmount(),
                override.getNote()
        );
    }
}
