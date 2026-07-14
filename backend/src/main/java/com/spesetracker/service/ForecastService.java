package com.spesetracker.service;

import com.spesetracker.dto.forecast.CategoryAmount;
import com.spesetracker.dto.forecast.ForecastResponse;
import com.spesetracker.dto.forecast.MonthlyForecast;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.RecurringOverrideRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ForecastService {

    // Ampiezza della finestra storica (mesi pieni precedenti al mese corrente) usata
    // per la media mobile delle spese/entrate variabili (non ricorrenti).
    private static final int VARIABLE_AVERAGE_WINDOW_MONTHS = 6;

    // Sentinella per "nessun checkpoint mai registrato": LocalDate.MIN eccede il range
    // di date rappresentabile da Postgres (causa un overflow lato driver JDBC), quindi
    // usiamo una data remota ma valida - nessuna transazione reale precede il 1970 comunque.
    private static final LocalDate NO_CHECKPOINT_SENTINEL = LocalDate.of(1970, 1, 1);

    private final BalanceCheckpointRepository balanceCheckpointRepository;
    private final TransactionRepository transactionRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringOverrideRepository recurringOverrideRepository;

    private record Occurrence(Category category, BigDecimal amount) {
    }

    @Transactional(readOnly = true)
    public ForecastResponse forecast(UUID userId, int months) {
        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.from(today);
        LocalDate horizonEndDate = currentMonth.plusMonths(months - 1L).atEndOfMonth();

        Optional<BalanceCheckpoint> checkpoint = balanceCheckpointRepository
                .findFirstByUserIdAndCheckpointDateLessThanEqualOrderByCheckpointDateDesc(userId, today);
        LocalDate checkpointDate = checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(NO_CHECKPOINT_SENTINEL);
        BigDecimal checkpointBalance = checkpoint.map(BalanceCheckpoint::getBalance).orElse(BigDecimal.ZERO);

        Map<UUID, Category> categoryLookup = new HashMap<>();

        // Transazioni reali già registrate dopo il checkpoint: coprono sia il "recupero"
        // fino a oggi (mesi precedenti l'orizzonte) sia la parte già trascorsa del mese corrente.
        List<Transaction> actualSinceCheckpoint = transactionRepository
                .findByUserIdAndOccurredOnBetween(userId, checkpointDate.plusDays(1), today);
        actualSinceCheckpoint.forEach(t -> categoryLookup.putIfAbsent(t.getCategory().getId(), t.getCategory()));

        BigDecimal preHorizonDelta = actualSinceCheckpoint.stream()
                .filter(t -> t.getOccurredOn().isBefore(currentMonth.atDay(1)))
                .map(this::signedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<YearMonth, List<Transaction>> actualByMonth = actualSinceCheckpoint.stream()
                .filter(t -> !t.getOccurredOn().isBefore(currentMonth.atDay(1)))
                .collect(Collectors.groupingBy(t -> YearMonth.from(t.getOccurredOn())));

        // Componente deterministica: proietta le regole ricorrenti attive oltre oggi, applicando le eccezioni.
        List<RecurringTransaction> activeRules = recurringTransactionRepository.findByUserIdAndActiveTrue(userId);
        activeRules.forEach(r -> categoryLookup.putIfAbsent(r.getCategory().getId(), r.getCategory()));

        Map<UUID, List<RecurringOverride>> overridesByRule = recurringOverrideRepository
                .findByRecurringTransactionIdIn(activeRules.stream().map(RecurringTransaction::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(o -> o.getRecurringTransaction().getId()));

        Map<YearMonth, List<Occurrence>> projectedByMonth = new HashMap<>();
        for (RecurringTransaction rule : activeRules) {
            Map<LocalDate, BigDecimal> overrideByDate = overridesByRule
                    .getOrDefault(rule.getId(), List.of()).stream()
                    .collect(Collectors.toMap(RecurringOverride::getOccurrenceDate, RecurringOverride::getOverrideAmount));

            LocalDate cursor = rule.getNextDueDate();
            while (!cursor.isAfter(horizonEndDate) && rule.isCurrentlyActive(cursor)) {
                if (cursor.isAfter(today)) {
                    BigDecimal amount = overrideByDate.getOrDefault(cursor, rule.getDefaultAmount());
                    projectedByMonth.computeIfAbsent(YearMonth.from(cursor), k -> new ArrayList<>())
                            .add(new Occurrence(rule.getCategory(), amount));
                }
                cursor = rule.addInterval(cursor);
            }
        }

        // Componente statistica: media mobile per categoria sulle spese/entrate non ricorrenti
        // negli ultimi N mesi pieni precedenti al mese corrente. Si applica solo ai mesi futuri
        // interi (non al mese corrente, già coperto dall'effettivo parziale sopra).
        LocalDate windowStart = currentMonth.minusMonths(VARIABLE_AVERAGE_WINDOW_MONTHS).atDay(1);
        LocalDate windowEnd = currentMonth.atDay(1).minusDays(1);
        List<Transaction> historicalVariable = windowEnd.isBefore(windowStart)
                ? List.of()
                : transactionRepository.findByUserIdAndOccurredOnBetween(userId, windowStart, windowEnd).stream()
                        .filter(t -> t.getRecurringTransaction() == null)
                        .toList();
        historicalVariable.forEach(t -> categoryLookup.putIfAbsent(t.getCategory().getId(), t.getCategory()));

        Map<UUID, BigDecimal> variableAverageByCategory = historicalVariable.stream()
                .collect(Collectors.groupingBy(
                        t -> t.getCategory().getId(),
                        Collectors.reducing(BigDecimal.ZERO, Transaction::getAmount, BigDecimal::add)))
                .entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> e.getValue().divide(
                                BigDecimal.valueOf(VARIABLE_AVERAGE_WINDOW_MONTHS), 2, RoundingMode.HALF_UP)));

        List<MonthlyForecast> monthlyForecasts = new ArrayList<>();
        BigDecimal runningBalance = checkpointBalance.add(preHorizonDelta);

        for (int i = 0; i < months; i++) {
            YearMonth ym = currentMonth.plusMonths(i);
            boolean isCurrentMonth = ym.equals(currentMonth);

            Map<UUID, BigDecimal> breakdown = new LinkedHashMap<>();
            BigDecimal income = BigDecimal.ZERO;
            BigDecimal expense = BigDecimal.ZERO;

            if (isCurrentMonth) {
                for (Transaction t : actualByMonth.getOrDefault(ym, List.of())) {
                    breakdown.merge(t.getCategory().getId(), t.getAmount(), BigDecimal::add);
                    if (t.getType() == TransactionType.INCOME) {
                        income = income.add(t.getAmount());
                    } else {
                        expense = expense.add(t.getAmount());
                    }
                }
            }

            for (Occurrence occurrence : projectedByMonth.getOrDefault(ym, List.of())) {
                breakdown.merge(occurrence.category().getId(), occurrence.amount(), BigDecimal::add);
                if (occurrence.category().getType() == CategoryType.INCOME) {
                    income = income.add(occurrence.amount());
                } else {
                    expense = expense.add(occurrence.amount());
                }
            }

            if (!isCurrentMonth) {
                for (Map.Entry<UUID, BigDecimal> entry : variableAverageByCategory.entrySet()) {
                    Category category = categoryLookup.get(entry.getKey());
                    if (category == null) {
                        continue;
                    }
                    breakdown.merge(entry.getKey(), entry.getValue(), BigDecimal::add);
                    if (category.getType() == CategoryType.INCOME) {
                        income = income.add(entry.getValue());
                    } else {
                        expense = expense.add(entry.getValue());
                    }
                }
            }

            BigDecimal netBalance = income.subtract(expense);
            runningBalance = runningBalance.add(netBalance);

            List<CategoryAmount> categoryAmounts = breakdown.entrySet().stream()
                    .map(e -> {
                        Category c = categoryLookup.get(e.getKey());
                        return new CategoryAmount(e.getKey(), c.getName(), c.getType(), e.getValue());
                    })
                    .toList();

            monthlyForecasts.add(new MonthlyForecast(ym, income, expense, netBalance, runningBalance, categoryAmounts));
        }

        return new ForecastResponse(
                checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(null),
                checkpointBalance,
                monthlyForecasts
        );
    }

    private BigDecimal signedAmount(Transaction transaction) {
        return transaction.getType() == TransactionType.EXPENSE
                ? transaction.getAmount().negate()
                : transaction.getAmount();
    }
}
