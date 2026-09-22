package com.spesetracker.dto.forecast;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ForecastResponse(
        LocalDate startingBalanceDate,
        BigDecimal startingBalance,
        // Saldo del checkpoint più tutte le transazioni reali registrate da
        // allora ad oggi incluso: il "saldo vero, adesso" (a differenza di
        // startingBalance, che è il solo valore grezzo del checkpoint).
        BigDecimal currentBalance,
        // Un elemento per periodo da stipendio a stipendio, dal periodo in corso
        // in avanti. Si chiamava months ed erano mesi di calendario: vedi
        // PeriodForecast per il perché del cambio.
        List<PeriodForecast> periods
) {
}
