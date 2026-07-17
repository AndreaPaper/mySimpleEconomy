package com.spesetracker.dto.recurring;

import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.IntervalUnit;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record RecurringTransactionResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        CategoryType categoryType,
        String categoryIcon,
        String categoryColor,
        String name,
        BigDecimal defaultAmount,
        IntervalUnit intervalUnit,
        Short intervalValue,
        LocalDate startDate,
        LocalDate nextDueDate,
        LocalDate endDate,
        boolean active
) {
    public static RecurringTransactionResponse from(RecurringTransaction rt) {
        return new RecurringTransactionResponse(
                rt.getId(),
                rt.getCategory().getId(),
                rt.getCategory().getName(),
                rt.getCategory().getType(),
                rt.getCategory().getIcon(),
                rt.getCategory().getColor(),
                rt.getName(),
                rt.getDefaultAmount(),
                rt.getIntervalUnit(),
                rt.getIntervalValue(),
                rt.getStartDate(),
                rt.getNextDueDate(),
                rt.getEndDate(),
                Boolean.TRUE.equals(rt.getActive())
        );
    }
}
