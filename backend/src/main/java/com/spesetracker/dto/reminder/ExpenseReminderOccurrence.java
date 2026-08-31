package com.spesetracker.dto.reminder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseReminderOccurrence(
        UUID reminderId,
        String name,
        LocalDate date,
        BigDecimal amount,
        // true se amount non è il prezzo impostato sul promemoria, ma una stima
        // presa dall'ultima spesa registrata nella sua categoria.
        boolean estimated
) {
}
