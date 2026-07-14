package com.spesetracker.controller;

import com.spesetracker.dto.checkpoint.BalanceCheckpointRequest;
import com.spesetracker.dto.checkpoint.BalanceCheckpointResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.BalanceCheckpointService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/balance-checkpoints")
@RequiredArgsConstructor
public class BalanceCheckpointController {

    private final BalanceCheckpointService balanceCheckpointService;

    @GetMapping
    public List<BalanceCheckpointResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return balanceCheckpointService.list(principal.getId());
    }

    @PostMapping
    public BalanceCheckpointResponse upsert(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BalanceCheckpointRequest request
    ) {
        return balanceCheckpointService.upsert(principal.getId(), request);
    }
}
