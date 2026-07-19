package com.spesetracker.dto.reminder;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.enums.IntervalUnit;

import java.time.LocalDate;
import java.util.UUID;

public record ExpenseReminderResponse(
        UUID id,
        String name,
        IntervalUnit intervalUnit,
        Short intervalValue,
        LocalDate startDate,
        LocalDate nextDueDate,
        LocalDate endDate,
        boolean active,
        Short notifyDaysBefore
) {
    public static ExpenseReminderResponse from(ExpenseReminder reminder) {
        return new ExpenseReminderResponse(
                reminder.getId(),
                reminder.getName(),
                reminder.getIntervalUnit(),
                reminder.getIntervalValue(),
                reminder.getStartDate(),
                reminder.getNextDueDate(),
                reminder.getEndDate(),
                Boolean.TRUE.equals(reminder.getActive()),
                reminder.getNotifyDaysBefore()
        );
    }
}
