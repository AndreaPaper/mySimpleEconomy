package com.spesetracker.dto.excelimport;

import com.spesetracker.model.enums.CategoryType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// Categoria non ancora esistente che l'importazione propone di creare.
// tempId è un identificatore locale al payload (non un UUID reale) usato dagli
// altri elementi dell'import per riferirsi a questa categoria prima che esista.
public record CategorySuggestion(
        @NotBlank String tempId,
        @NotBlank String name,
        @NotNull CategoryType type,
        String color
) {
}
