package com.spesetracker.dto.reminder;

import java.time.YearMonth;
import java.util.List;

public record MonthlyReminders(
        YearMonth yearMonth,
        List<ExpenseReminderOccurrence> occurrences
) {
}
