package com.spesetracker.dto.profile;

import java.math.BigDecimal;

public record ProfileResponse(
        String email,
        String nickname,
        BigDecimal defaultSalaryAmount,
        Short salaryDay,
        String avatarKey,
        boolean savingsEnabled,
        Short savingsPercent,
        Short needsPercent,
        Short wantsPercent
) {
}
