package com.spesetracker.dto.savings;

import com.spesetracker.model.SavingsGoal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record SavingsGoalResponse(
        UUID id,
        String name,
        BigDecimal targetAmount,
        LocalDate deadline,
        String icon,
        String color,
        // Somma dei movimenti dell'obiettivo: calcolata dal service, non
        // memorizzata, così non può divergere dallo storico.
        BigDecimal currentAmount
) {
    public static SavingsGoalResponse from(SavingsGoal goal, BigDecimal currentAmount) {
        return new SavingsGoalResponse(
                goal.getId(),
                goal.getName(),
                goal.getTargetAmount(),
                goal.getDeadline(),
                goal.getIcon(),
                goal.getColor(),
                currentAmount
        );
    }
}
