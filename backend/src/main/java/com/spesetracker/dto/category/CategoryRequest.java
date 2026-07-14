package com.spesetracker.dto.category;

import com.spesetracker.model.enums.CategoryType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CategoryRequest(
        @NotBlank String name,
        @NotNull CategoryType type,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Il colore deve essere in formato esadecimale, es. #3B82F6")
        String color,
        String icon
) {
}
