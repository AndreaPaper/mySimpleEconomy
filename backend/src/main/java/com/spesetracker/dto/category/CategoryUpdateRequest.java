package com.spesetracker.dto.category;

import com.spesetracker.model.enums.SpendingBucket;
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
        UUID parentId,
        // Modalità risparmio, solo per le categorie di spesa. Null = eredita
        // dal padre (sottocategorie) o non classificata (principali).
        SpendingBucket spendingBucket
) {
}
