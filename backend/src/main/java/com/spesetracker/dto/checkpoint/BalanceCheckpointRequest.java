package com.spesetracker.dto.checkpoint;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record BalanceCheckpointRequest(
        @NotNull LocalDate checkpointDate,
        @NotNull BigDecimal balance
) {
}
