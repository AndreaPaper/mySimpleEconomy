package com.spesetracker.dto.reminder;

import java.time.LocalDate;
import java.util.UUID;

public record ExpenseReminderOccurrence(
        UUID reminderId,
        String name,
        LocalDate date
) {
}
