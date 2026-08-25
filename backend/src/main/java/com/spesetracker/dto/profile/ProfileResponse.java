package com.spesetracker.dto.profile;

import java.math.BigDecimal;
import java.util.UUID;

public record ProfileResponse(
        String email,
        String nickname,
        BigDecimal defaultSalaryAmount,
        Short salaryDay,
        String avatarKey,
        boolean savingsEnabled,
        Short savingsPercent,
        // Categoria dello stipendio, se una regola ricorrente dello stipendio
        // esiste: serve al calcolo delle entrate del periodo, dove uno
        // stipendio realmente registrato sostituisce la stima di default.
        UUID salaryCategoryId
) {
}
