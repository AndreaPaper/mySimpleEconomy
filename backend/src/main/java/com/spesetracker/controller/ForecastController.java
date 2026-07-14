package com.spesetracker.controller;

import com.spesetracker.dto.forecast.ForecastResponse;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.ForecastService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/forecast")
@RequiredArgsConstructor
@Validated
public class ForecastController {

    private final ForecastService forecastService;

    @GetMapping
    public ForecastResponse forecast(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "6") @Min(1) @Max(24) int months
    ) {
        return forecastService.forecast(principal.getId(), months);
    }
}
