package com.spesetracker.dto.excelimport;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record BalanceCheckpointImportItem(
        @NotNull LocalDate checkpointDate,
        @NotNull BigDecimal balance
) {
}
