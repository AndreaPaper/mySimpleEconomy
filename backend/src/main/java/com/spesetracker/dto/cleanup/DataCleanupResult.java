package com.spesetracker.dto.cleanup;

public record DataCleanupResult(
        long transactionsDeleted,
        long recurringTransactionsDeleted,
        long balanceCheckpointsDeleted,
        long expenseRemindersDeleted
) {
}
