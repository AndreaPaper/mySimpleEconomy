package com.spesetracker.controller;

import com.spesetracker.dto.recurring.RecurringOverrideRequest;
import com.spesetracker.dto.recurring.RecurringOverrideResponse;
import com.spesetracker.dto.recurring.RecurringTransactionRequest;
import com.spesetracker.dto.recurring.RecurringTransactionResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.RecurringTransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/recurring-transactions")
@RequiredArgsConstructor
public class RecurringTransactionController {

    private final RecurringTransactionService recurringTransactionService;

    @GetMapping
    public List<RecurringTransactionResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return recurringTransactionService.list(principal.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RecurringTransactionResponse create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody RecurringTransactionRequest request
    ) {
        return recurringTransactionService.create(principal.getId(), request);
    }

    @PutMapping("/{id}")
    public RecurringTransactionResponse update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody RecurringTransactionRequest request
    ) {
        return recurringTransactionService.update(principal.getId(), id, request);
    }

    @PostMapping("/{id}/deactivate")
    public void deactivate(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        recurringTransactionService.setActive(principal.getId(), id, false);
    }

    @PostMapping("/{id}/reactivate")
    public void reactivate(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        recurringTransactionService.setActive(principal.getId(), id, true);
    }

    @GetMapping("/{id}/overrides")
    public List<RecurringOverrideResponse> listOverrides(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id
    ) {
        return recurringTransactionService.listOverrides(principal.getId(), id);
    }

    @PostMapping("/{id}/overrides")
    @ResponseStatus(HttpStatus.CREATED)
    public RecurringOverrideResponse createOverride(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody RecurringOverrideRequest request
    ) {
        return recurringTransactionService.createOverride(principal.getId(), id, request);
    }

    @DeleteMapping("/{id}/overrides/{overrideId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteOverride(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @PathVariable UUID overrideId
    ) {
        recurringTransactionService.deleteOverride(principal.getId(), id, overrideId);
    }
}
