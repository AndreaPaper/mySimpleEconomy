package com.spesetracker.dto.category;

import com.spesetracker.model.Category;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.SpendingBucket;

import java.util.UUID;

public record CategoryResponse(
        UUID id,
        String name,
        CategoryType type,
        String color,
        String icon,
        UUID parentId,
        SpendingBucket spendingBucket,
        boolean archived
) {
    public static CategoryResponse from(Category category) {
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getType(),
                category.getColor(),
                category.getIcon(),
                category.getParent() != null ? category.getParent().getId() : null,
                category.getSpendingBucket(),
                Boolean.TRUE.equals(category.getArchived())
        );
    }
}
