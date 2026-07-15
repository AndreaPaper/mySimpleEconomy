package com.spesetracker.controller;

import com.spesetracker.dto.cleanup.DataCleanupResult;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.DataCleanupService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/data-cleanup")
@RequiredArgsConstructor
public class DataCleanupController {

    private final DataCleanupService dataCleanupService;

    // Senza from/to: elimina tutto (tranne le categorie). Con from e/o to: limita
    // la cancellazione a transazioni e saldi in quell'intervallo.
    @DeleteMapping
    public DataCleanupResult cleanup(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return dataCleanupService.cleanup(principal.getId(), from, to);
    }
}
