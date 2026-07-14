package com.spesetracker.controller;

import com.spesetracker.dto.reminder.ExpenseReminderRequest;
import com.spesetracker.dto.reminder.ExpenseReminderResponse;
import com.spesetracker.dto.reminder.UpcomingRemindersResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.ExpenseReminderService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/expense-reminders")
@RequiredArgsConstructor
@Validated
public class ExpenseReminderController {

    private final ExpenseReminderService expenseReminderService;

    @GetMapping
    public List<ExpenseReminderResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return expenseReminderService.list(principal.getId());
    }

    @GetMapping("/upcoming")
    public UpcomingRemindersResponse upcoming(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "3") @Min(1) @Max(24) int months
    ) {
        return expenseReminderService.getUpcoming(principal.getId(), months);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExpenseReminderResponse create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ExpenseReminderRequest request
    ) {
        return expenseReminderService.create(principal.getId(), request);
    }

    @PutMapping("/{id}")
    public ExpenseReminderResponse update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody ExpenseReminderRequest request
    ) {
        return expenseReminderService.update(principal.getId(), id, request);
    }

    @PostMapping("/{id}/deactivate")
    public void deactivate(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        expenseReminderService.setActive(principal.getId(), id, false);
    }

    @PostMapping("/{id}/reactivate")
    public void reactivate(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        expenseReminderService.setActive(principal.getId(), id, true);
    }
}
