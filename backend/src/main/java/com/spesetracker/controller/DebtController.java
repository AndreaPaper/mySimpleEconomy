package com.spesetracker.controller;

import com.spesetracker.dto.debt.DebtRequest;
import com.spesetracker.dto.debt.DebtResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.DebtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/debts")
@RequiredArgsConstructor
public class DebtController {

    private final DebtService debtService;

    @GetMapping
    public List<DebtResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return debtService.list(principal.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DebtResponse create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DebtRequest request
    ) {
        return debtService.create(principal.getId(), request);
    }

    @PutMapping("/{id}")
    public DebtResponse update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody DebtRequest request
    ) {
        return debtService.update(principal.getId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        debtService.delete(principal.getId(), id);
    }
}
