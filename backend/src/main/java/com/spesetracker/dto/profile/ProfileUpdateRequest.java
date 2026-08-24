package com.spesetracker.dto.profile;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record ProfileUpdateRequest(
        @Size(max = 100) String nickname,
        @DecimalMin(value = "0.01", message = "Lo stipendio deve essere maggiore di zero") BigDecimal defaultSalaryAmount,
        @Min(value = 1, message = "Il giorno deve essere tra 1 e 31") @Max(value = 31, message = "Il giorno deve essere tra 1 e 31") Short salaryDay,
        String avatarKey,
        Boolean savingsEnabled,
        @Min(value = 0, message = "La percentuale deve essere tra 0 e 100") @Max(value = 100, message = "La percentuale deve essere tra 0 e 100") Short savingsPercent,
        @Min(value = 0, message = "La percentuale deve essere tra 0 e 100") @Max(value = 100, message = "La percentuale deve essere tra 0 e 100") Short needsPercent,
        @Min(value = 0, message = "La percentuale deve essere tra 0 e 100") @Max(value = 100, message = "La percentuale deve essere tra 0 e 100") Short wantsPercent
) {
}
