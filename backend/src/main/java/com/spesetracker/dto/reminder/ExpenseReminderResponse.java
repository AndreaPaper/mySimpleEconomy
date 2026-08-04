package com.spesetracker.dto.reminder;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.enums.IntervalUnit;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseReminderResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String categoryIcon,
        String categoryColor,
        String name,
        BigDecimal amount,
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
                reminder.getCategory() != null ? reminder.getCategory().getId() : null,
                reminder.getCategory() != null ? reminder.getCategory().getName() : null,
                reminder.getCategory() != null ? reminder.getCategory().getIcon() : null,
                reminder.getCategory() != null ? reminder.getCategory().getColor() : null,
                reminder.getName(),
                reminder.getAmount(),
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
