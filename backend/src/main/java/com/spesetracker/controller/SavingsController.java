package com.spesetracker.controller;

import com.spesetracker.dto.savings.SavingsGoalRequest;
import com.spesetracker.dto.savings.SavingsGoalResponse;
import com.spesetracker.dto.savings.SavingsTransactionRequest;
import com.spesetracker.dto.savings.SavingsTransactionResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.SavingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/savings")
@RequiredArgsConstructor
public class SavingsController {

    private final SavingsService savingsService;

    @GetMapping("/goals")
    public List<SavingsGoalResponse> listGoals(@AuthenticationPrincipal UserPrincipal principal) {
        return savingsService.listGoals(principal.getId());
    }

    @PostMapping("/goals")
    @ResponseStatus(HttpStatus.CREATED)
    public SavingsGoalResponse createGoal(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SavingsGoalRequest request
    ) {
        return savingsService.createGoal(principal.getId(), request);
    }

    @PutMapping("/goals/{id}")
    public SavingsGoalResponse updateGoal(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody SavingsGoalRequest request
    ) {
        return savingsService.updateGoal(principal.getId(), id, request);
    }

    @DeleteMapping("/goals/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGoal(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        savingsService.deleteGoal(principal.getId(), id);
    }

    @GetMapping("/movements")
    public List<SavingsTransactionResponse> listMovements(@AuthenticationPrincipal UserPrincipal principal) {
        return savingsService.listMovements(principal.getId());
    }

    @PostMapping("/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public SavingsTransactionResponse createMovement(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SavingsTransactionRequest request
    ) {
        return savingsService.createMovement(principal.getId(), request);
    }

    @DeleteMapping("/movements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMovement(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        savingsService.deleteMovement(principal.getId(), id);
    }
}
