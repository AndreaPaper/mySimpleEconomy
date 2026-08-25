package com.spesetracker.dto.savings;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SavingsGoalRequest(
        @NotBlank @Size(max = 100) String name,
        // Opzionale: il risparmio generico non ha un traguardo.
        @DecimalMin(value = "0.01", message = "L'obiettivo deve essere maggiore di zero") BigDecimal targetAmount,
        LocalDate deadline,
        @Size(max = 50) String icon,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Il colore deve essere in formato esadecimale, es. #3B82F6")
        String color
) {
}
