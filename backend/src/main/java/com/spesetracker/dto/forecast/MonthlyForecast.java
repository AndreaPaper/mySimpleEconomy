package com.spesetracker.dto.forecast;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

public record MonthlyForecast(
        YearMonth yearMonth,
        BigDecimal projectedIncome,
        BigDecimal projectedExpense,
        BigDecimal netBalance,
        BigDecimal runningBalance,
        List<CategoryAmount> categoryBreakdown
) {
}
