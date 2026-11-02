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
        List<PeriodForecast> periods,
        // Il mese di CALENDARIO la cui fine mostra la card "Saldo previsto a fine …":
        // quello in cui arriva il prossimo stipendio, così la card lo contiene
        // sempre. Passato l'accredito del mese è il mese prossimo, prima è questo;
        // senza giorno di accredito è sempre il mese in corso, identico a periods[0].
        // Si chiamava currentMonth, nome diventato falso quando la card ha
        // cominciato a guardare al mese prossimo dopo lo stipendio.
        PeriodForecast monthEndForecast,
        // L'ipotesi con cui è stata fatta la previsione di periods, che il frontend
        // scrive sotto il grafico: la media delle SPESE variabili aggiunta a ogni
        // periodo futuro, e su quanti periodi di storico è calcolata (da 0 a 6).
        // Con 0 non c'è storico da cui stimare, e la media vale zero.
        BigDecimal variableExpenseAverage,
        int historyPeriods
) {
}
