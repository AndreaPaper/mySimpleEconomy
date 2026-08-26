package com.spesetracker.service;

import com.spesetracker.dto.forecast.CategoryAmount;
import com.spesetracker.dto.forecast.ForecastResponse;
import com.spesetracker.dto.forecast.MonthlyForecast;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Category;
import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.ExpenseReminderRepository;
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
    private final ExpenseReminderRepository expenseReminderRepository;

    private record Occurrence(Category category, BigDecimal amount) {
    }

    // Le transazioni datate dopo il giorno del saldo contano sempre. Quelle
    // datate proprio in quel giorno dipendono da cosa vuol dire il saldo:
    //
    //   countsFrom valorizzato -> saldo letto in quel momento (inserito a mano).
    //       Quello che era gia' registrato allora e' dentro il numero: contarlo
    //       di nuovo lo sottrarrebbe due volte. Conta solo cio' che e' arrivato
    //       dopo, cosi' una spesa aggiunta nel pomeriggio muove comunque il saldo.
    //
    //   countsFrom nullo -> saldo a inizio giornata: contano tutte. E' il caso
    //       dei saldi importati da Excel ("SALDO INIZIO MESE") e di quelli
    //       registrati prima che questa distinzione esistesse.
    private boolean countsAfterCheckpoint(
            Transaction transaction, LocalDate checkpointDate, BalanceCheckpoint checkpoint) {
        if (!transaction.getOccurredOn().isEqual(checkpointDate)) return true;
        if (checkpoint == null || checkpoint.getCountsFrom() == null) return true;
        return !transaction.getCreatedAt().isBefore(checkpoint.getCountsFrom());
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

        // Transazioni reali registrate a partire dal checkpoint e fino alla fine
        // dell'orizzonte: la finestra si spinge oltre oggi perché una spesa già
        // registrata con data futura (una bolletta che si sa di dover pagare) è un
        // movimento certo e deve entrare nella previsione del mese in cui cade.
        // Il checkpoint è il saldo a INIZIO giornata, quindi la finestra include anche le
        // transazioni datate esattamente checkpointDate: senza questo, un saldo registrato
        // oggi (il default del form in Profilo) renderebbe la finestra vuota e il saldo
        // attuale resterebbe congelato per tutto il giorno. Stessa semantica dell'import
        // Excel, che legge saldi di inizio periodo ("SALDO INIZIO MESE").
        List<Transaction> actualSinceCheckpoint = transactionRepository
                .findByUserIdAndOccurredOnBetween(userId, checkpointDate, horizonEndDate).stream()
                .filter(t -> countsAfterCheckpoint(t, checkpointDate, checkpoint.orElse(null)))
                .toList();
        actualSinceCheckpoint.forEach(t -> categoryLookup.putIfAbsent(t.getCategory().getId(), t.getCategory()));

        // Saldo vero, adesso: solo ciò che è già accaduto. A differenza della previsione,
        // qui le transazioni con data futura non contano ancora.
        BigDecimal currentBalance = checkpointBalance.add(actualSinceCheckpoint.stream()
                .filter(t -> !t.getOccurredOn().isAfter(today))
                .map(this::signedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));

        BigDecimal preHorizonDelta = actualSinceCheckpoint.stream()
                .filter(t -> t.getOccurredOn().isBefore(currentMonth.atDay(1)))
                .map(this::signedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<YearMonth, List<Transaction>> actualByMonth = actualSinceCheckpoint.stream()
                .filter(t -> !t.getOccurredOn().isBefore(currentMonth.atDay(1)))
                .collect(Collectors.groupingBy(t -> YearMonth.from(t.getOccurredOn())));

        // Nota: una transazione inserita a mano con data futura non viene mai interpretata
        // come l'occorrenza di una regola ricorrente, nemmeno se cade nella stessa
        // categoria e nello stesso mese. Una categoria ospita legittimamente sia una
        // ricorrenza sia acquisti occasionali (es. "Farmaci": la terapia mensile più i
        // farmaci comprati una tantum), quindi dedurre il collegamento dalla categoria
        // farebbe sparire dalla previsione una spesa ricorrente reale. Il collegamento
        // esiste solo quando è esplicito: le transazioni generate dal job portano il
        // riferimento alla regola e non passano di qui.
        //
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

        // Promemoria di spesa fissa: sono costi noti che il job di inizio mese trasforma
        // in transazioni reali. Finché quella transazione non esiste per un dato mese,
        // l'importo va comunque previsto, altrimenti il saldo di fine mese ignora spese
        // già pianificate dall'utente. Il controllo di esistenza è lo stesso usato dal
        // job (ExpenseReminderGenerationService), quindi non si conta due volte.
        Map<YearMonth, List<Occurrence>> reminderByMonth = new HashMap<>();
        for (ExpenseReminder reminder : expenseReminderRepository.findByUserIdAndActiveTrue(userId)) {
            if (reminder.getCategory() == null) {
                continue;
            }
            BigDecimal amount = resolveReminderAmount(userId, reminder);
            if (amount == null) {
                continue; // nessun prezzo né storico da cui stimarlo: non prevedibile
            }
            categoryLookup.putIfAbsent(reminder.getCategory().getId(), reminder.getCategory());

            LocalDate cursor = reminder.getNextDueDate();
            while (!cursor.isAfter(horizonEndDate) && reminder.isCurrentlyActive(cursor)) {
                YearMonth ym = YearMonth.from(cursor);
                boolean alreadyMaterialised = transactionRepository.existsByExpenseReminderIdAndOccurredOnBetween(
                        reminder.getId(), ym.atDay(1), ym.atEndOfMonth());
                if (!alreadyMaterialised) {
                    reminderByMonth.computeIfAbsent(ym, k -> new ArrayList<>())
                            .add(new Occurrence(reminder.getCategory(), amount));
                }
                cursor = reminder.addInterval(cursor);
            }
        }

        // Componente statistica: media mobile per categoria sulle spese/entrate non ricorrenti
        // negli ultimi N mesi pieni precedenti al mese corrente. Si applica solo ai mesi futuri
        // interi (non al mese corrente, già coperto dall'effettivo parziale sopra).
        LocalDate windowStart = currentMonth.minusMonths(VARIABLE_AVERAGE_WINDOW_MONTHS).atDay(1);
        LocalDate windowEnd = currentMonth.atDay(1).minusDays(1);
        // Si escludono sia le occorrenze delle regole ricorrenti sia quelle generate dai
        // promemoria: entrambe sono già previste esplicitamente sopra, quindi lasciarle
        // anche nella media le conterebbe due volte.
        List<Transaction> historicalVariable = windowEnd.isBefore(windowStart)
                ? List.of()
                : transactionRepository.findByUserIdAndOccurredOnBetween(userId, windowStart, windowEnd).stream()
                        .filter(t -> t.getRecurringTransaction() == null && t.getExpenseReminder() == null)
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

            // Transazioni già registrate che cadono in questo mese: nel mese corrente sono
            // quelle passate, nei mesi successivi quelle inserite con data futura.
            for (Transaction t : actualByMonth.getOrDefault(ym, List.of())) {
                breakdown.merge(t.getCategory().getId(), t.getAmount(), BigDecimal::add);
                if (t.getType() == TransactionType.INCOME) {
                    income = income.add(t.getAmount());
                } else {
                    expense = expense.add(t.getAmount());
                }
            }

            for (Occurrence occurrence : reminderByMonth.getOrDefault(ym, List.of())) {
                breakdown.merge(occurrence.category().getId(), occurrence.amount(), BigDecimal::add);
                if (occurrence.category().getType() == CategoryType.INCOME) {
                    income = income.add(occurrence.amount());
                } else {
                    expense = expense.add(occurrence.amount());
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
                        return new CategoryAmount(e.getKey(), c.getName(), c.getIcon(), c.getColor(), c.getType(), e.getValue());
                    })
                    .toList();

            monthlyForecasts.add(new MonthlyForecast(ym, income, expense, netBalance, runningBalance, categoryAmounts));
        }

        return new ForecastResponse(
                checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(null),
                checkpointBalance,
                currentBalance,
                monthlyForecasts
        );
    }

    // Stesso criterio del job che genera la spesa a inizio mese: il prezzo del promemoria
    // se impostato, altrimenti l'ultima spesa registrata nella stessa categoria. Se non
    // c'è nessuno dei due l'importo è ignoto e il promemoria non entra nella previsione.
    private BigDecimal resolveReminderAmount(UUID userId, ExpenseReminder reminder) {
        if (reminder.getAmount() != null) {
            return reminder.getAmount();
        }
        return transactionRepository
                .findFirstByUserIdAndCategoryIdAndTypeOrderByOccurredOnDesc(
                        userId, reminder.getCategory().getId(), TransactionType.EXPENSE)
                .map(Transaction::getAmount)
                .orElse(null);
    }

    private BigDecimal signedAmount(Transaction transaction) {
        return transaction.getType() == TransactionType.EXPENSE
                ? transaction.getAmount().negate()
                : transaction.getAmount();
    }
}
