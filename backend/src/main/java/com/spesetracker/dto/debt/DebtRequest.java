package com.spesetracker.dto.debt;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record DebtRequest(
        @NotNull UUID categoryId,
        @NotBlank String name,
        @NotNull @DecimalMin(value = "0.01", message = "L'importo totale deve essere maggiore di zero") BigDecimal totalAmount,
        // Già pagato prima di iniziare a tracciare questo debito nell'app (opzionale, default 0).
        @DecimalMin(value = "0", message = "L'importo già pagato non può essere negativo") BigDecimal alreadyPaidAmount,
        // Richiesta dal service se alreadyPaidAmount > 0: le transazioni della
        // categoria con data successiva a questa contano separatamente, quelle
        // precedenti si considerano già incluse in alreadyPaidAmount.
        LocalDate alreadyPaidAsOf,
        @DecimalMin(value = "0.01", message = "La rata mensile deve essere maggiore di zero") BigDecimal monthlyPaymentAmount
) {
}
