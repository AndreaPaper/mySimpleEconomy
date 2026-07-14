package com.spesetracker.dto.forecast;

import com.spesetracker.model.enums.CategoryType;

import java.math.BigDecimal;
import java.util.UUID;

public record CategoryAmount(
        UUID categoryId,
        String categoryName,
        CategoryType type,
        BigDecimal amount
) {
}
