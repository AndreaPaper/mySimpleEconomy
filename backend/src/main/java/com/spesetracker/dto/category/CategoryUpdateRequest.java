package com.spesetracker.dto.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record CategoryUpdateRequest(
        @NotBlank String name,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Il colore deve essere in formato esadecimale, es. #3B82F6")
        String color,
        String icon,
        // Permette di agganciare una categoria esistente a un padre (o di
        // staccarla passando null): il tipo resta comunque immutabile.
        UUID parentId
) {
}
