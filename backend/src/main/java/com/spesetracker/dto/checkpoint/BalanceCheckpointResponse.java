package com.spesetracker.dto.checkpoint;

import com.spesetracker.model.BalanceCheckpoint;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record BalanceCheckpointResponse(
        UUID id,
        LocalDate checkpointDate,
        BigDecimal balance
) {
    public static BalanceCheckpointResponse from(BalanceCheckpoint checkpoint) {
        return new BalanceCheckpointResponse(
                checkpoint.getId(),
                checkpoint.getCheckpointDate(),
                checkpoint.getBalance()
        );
    }
}
