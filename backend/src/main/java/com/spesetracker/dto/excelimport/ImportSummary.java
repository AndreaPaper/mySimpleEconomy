package com.spesetracker.dto.excelimport;

public record ImportSummary(
        int sheetsProcessed,
        int recurringDetected,
        int oneOffDetected,
        int categoriesToCreate,
        int itemsNeedingCategory
) {
}
