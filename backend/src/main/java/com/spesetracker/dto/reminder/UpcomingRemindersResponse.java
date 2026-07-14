package com.spesetracker.dto.reminder;

import java.util.List;

public record UpcomingRemindersResponse(
        List<MonthlyReminders> months
) {
}
