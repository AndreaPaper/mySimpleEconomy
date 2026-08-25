package com.spesetracker.dto.category;

import com.spesetracker.model.Category;
import com.spesetracker.model.enums.CategoryType;

import java.util.UUID;

public record CategoryResponse(
        UUID id,
        String name,
        CategoryType type,
        String color,
        String icon,
        UUID parentId,
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
                Boolean.TRUE.equals(category.getArchived())
        );
    }
}
