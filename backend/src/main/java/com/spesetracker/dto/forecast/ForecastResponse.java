package com.spesetracker.dto.forecast;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ForecastResponse(
        LocalDate startingBalanceDate,
        BigDecimal startingBalance,
        List<MonthlyForecast> months
) {
}
