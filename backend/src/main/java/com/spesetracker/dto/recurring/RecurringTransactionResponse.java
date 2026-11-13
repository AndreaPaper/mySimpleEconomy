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
        boolean active,
        // L'importo della prossima scadenza: quello dell'eccezione, se ce n'è una per
        // quella data, altrimenti defaultAmount. La Dashboard lo mostra fra le
        // prossime scadenze (prima mostrava sempre defaultAmount).
        BigDecimal nextDueAmount
) {
    public static RecurringTransactionResponse from(RecurringTransaction rt) {
        return from(rt, null);
    }

    /** @param nextDueOverride l'importo dell'eccezione sulla prossima scadenza, o null. */
    public static RecurringTransactionResponse from(RecurringTransaction rt, BigDecimal nextDueOverride) {
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
                Boolean.TRUE.equals(rt.getActive()),
                nextDueOverride != null ? nextDueOverride : rt.getDefaultAmount()
        );
    }
}
