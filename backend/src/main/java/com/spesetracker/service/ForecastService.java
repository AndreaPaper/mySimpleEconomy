package com.spesetracker.service;

import com.spesetracker.dto.debt.DebtResponse;
import com.spesetracker.dto.forecast.CategoryAmount;
import com.spesetracker.dto.forecast.ForecastResponse;
import com.spesetracker.dto.forecast.PeriodForecast;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Category;
import com.spesetracker.model.Debt;
import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.DebtRepository;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.repository.RecurringOverrideRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ForecastService {

    // Ampiezza massima della finestra storica (periodi conclusi precedenti a quello
    // corrente) usata per la media mobile delle spese/entrate variabili (non
    // ricorrenti). È un tetto, non il divisore: la media divide per i periodi di
    // storico che esistono davvero (vedi historyPeriods in build).
    private static final int VARIABLE_AVERAGE_WINDOW_PERIODS = 6;

    // Sentinella per "nessun checkpoint mai registrato": LocalDate.MIN eccede il range
    // di date rappresentabile da Postgres (causa un overflow lato driver JDBC), quindi
    // usiamo una data remota ma valida - nessuna transazione reale precede il 1970 comunque.
    private static final LocalDate NO_CHECKPOINT_SENTINEL = LocalDate.of(1970, 1, 1);

    private final BalanceCheckpointRepository balanceCheckpointRepository;
    private final TransactionRepository transactionRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringOverrideRepository recurringOverrideRepository;
    private final ExpenseReminderRepository expenseReminderRepository;
    private final UserRepository userRepository;
    private final DebtRepository debtRepository;

    private record Occurrence(Category category, BigDecimal amount) {
    }

    /** Un debito con una rata da prevedere: quanto resta da pagare e quanto per volta. */
    private record DebtPlan(Category category, BigDecimal monthlyPayment, BigDecimal remaining) {
    }

    /**
     * Una lettura della previsione, più l'ipotesi con cui è stata fatta: il
     * frontend la scrive sotto il grafico, così la curva non arriva dal nulla.
     */
    private record Built(List<PeriodForecast> buckets, int historyPeriods, BigDecimal variableExpenseAverage) {
    }

    /** Un promemoria in un mese di calendario: la chiave della memo di "il job l'ha già generata?". */
    private record ReminderMonth(UUID reminderId, YearMonth month) {
    }

    /**
     * Tutto ciò che la previsione legge dal database, letto una volta sola.
     *
     * <p>La previsione si calcola due volte sugli stessi dati — una per periodi da
     * stipendio a stipendio (il grafico e le card dei totali) e una per mesi di
     * calendario (la card "Saldo previsto a fine mese") — e rileggere tutto la
     * seconda volta raddoppierebbe i viaggi verso il database per numeri che
     * cambiano solo nel modo in cui sono raggruppati.
     *
     * <p>Le finestre lette sono l'unione di quelle che servono alle due letture:
     * ciascuna poi ritaglia la sua in memoria.
     */
    private record Inputs(
            LocalDate today,
            BigDecimal checkpointBalance,
            List<Transaction> actualSinceCheckpoint,
            List<RecurringTransaction> activeRules,
            Map<UUID, List<RecurringOverride>> overridesByRule,
            List<ExpenseReminder> reminders,
            Map<UUID, BigDecimal> reminderAmounts,
            // Tutte le transazioni della finestra storica, non ancora filtrate: la
            // più vecchia dice quanti periodi di storico esistono, e il filtro sulle
            // variabili lo fa build, che conosce anche le categorie dei debiti.
            List<Transaction> historicalWindow,
            List<DebtPlan> debts,
            Set<UUID> debtCategoryIds,
            Map<UUID, Category> categoryLookup,
            Map<ReminderMonth, Boolean> materialisedMemo) {
    }

    @Transactional(readOnly = true)
    public ForecastResponse forecast(UUID userId, int periods) {
        LocalDate today = LocalDate.now();
        // Il grafico e le card dei totali ragionano per periodi da stipendio a
        // stipendio, come il resto dell'app. Senza giorno di stipendio configurato
        // (o col giorno 1) SalaryPeriods fa coincidere periodo e mese di calendario,
        // quindi per quella configurazione ogni numero qui sotto resta identico.
        User user = userRepository.getReferenceById(userId);
        Integer salaryDay = SalaryPeriods.of(user.getSalaryDay());
        YearMonth currentPeriod = SalaryPeriods.periodOf(today, salaryDay);
        YearMonth currentMonth = YearMonth.from(today);

        // L'orizzonte da leggere copre entrambe le letture. Con l'accredito a metà
        // mese la fine del mese di calendario può cadere oltre la fine dell'ultimo
        // periodo chiesto (accredito il 15, oggi il 5 ottobre: il periodo in corso
        // finisce il 14, il mese il 31), e viceversa.
        LocalDate horizonEndDate = latest(
                SalaryPeriods.periodEnd(currentPeriod.plusMonths(periods - 1L), salaryDay),
                currentMonth.atEndOfMonth());

        Optional<BalanceCheckpoint> checkpoint = balanceCheckpointRepository
                .findFirstByUserIdAndCheckpointDateLessThanEqualOrderByCheckpointDateDesc(userId, today);
        LocalDate checkpointDate = checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(NO_CHECKPOINT_SENTINEL);
        BigDecimal checkpointBalance = checkpoint.map(BalanceCheckpoint::getBalance).orElse(BigDecimal.ZERO);

        Map<UUID, Category> categoryLookup = new HashMap<>();

        // Transazioni reali registrate a partire dal checkpoint e fino alla fine
        // dell'orizzonte: la finestra si spinge oltre oggi perché una spesa già
        // registrata con data futura (una bolletta che si sa di dover pagare) è un
        // movimento certo e deve entrare nella previsione del periodo in cui cade.
        // Il checkpoint è il saldo a INIZIO giornata, quindi la finestra include anche le
        // transazioni datate esattamente checkpointDate: senza questo, un saldo registrato
        // oggi (il default del form in Profilo) renderebbe la finestra vuota e il saldo
        // attuale resterebbe congelato per tutto il giorno. Stessa semantica dell'import
        // Excel, che legge saldi di inizio periodo ("SALDO INIZIO MESE").
        List<Transaction> actualSinceCheckpoint = transactionRepository
                .findByUserIdAndOccurredOnBetween(userId, checkpointDate, horizonEndDate).stream()
                .filter(t -> CheckpointRules.counts(t, checkpoint.orElse(null)))
                .toList();
        actualSinceCheckpoint.forEach(t -> categoryLookup.putIfAbsent(t.getCategory().getId(), t.getCategory()));

        // Saldo vero, adesso: solo ciò che è già accaduto. A differenza della previsione,
        // qui le transazioni con data futura non contano ancora.
        BigDecimal currentBalance = checkpointBalance.add(actualSinceCheckpoint.stream()
                .filter(t -> !t.getOccurredOn().isAfter(today))
                .map(this::signedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));

        // Nota: una transazione inserita a mano con data futura non viene mai interpretata
        // come l'occorrenza di una regola ricorrente, nemmeno se cade nella stessa
        // categoria e nello stesso mese. Una categoria ospita legittimamente sia una
        // ricorrenza sia acquisti occasionali (es. "Farmaci": la terapia mensile più i
        // farmaci comprati una tantum), quindi dedurre il collegamento dalla categoria
        // farebbe sparire dalla previsione una spesa ricorrente reale. Il collegamento
        // esiste solo quando è esplicito: le transazioni generate dal job portano il
        // riferimento alla regola e non passano di qui.
        List<RecurringTransaction> activeRules = recurringTransactionRepository.findByUserIdAndActiveTrue(userId);
        activeRules.forEach(r -> categoryLookup.putIfAbsent(r.getCategory().getId(), r.getCategory()));

        Map<UUID, List<RecurringOverride>> overridesByRule = recurringOverrideRepository
                .findByRecurringTransactionIdIn(activeRules.stream().map(RecurringTransaction::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(o -> o.getRecurringTransaction().getId()));

        // Promemoria di spesa fissa: sono costi noti che il job di inizio mese trasforma
        // in transazioni reali. Finché quella transazione non esiste per un dato mese,
        // l'importo va comunque previsto, altrimenti il saldo di fine periodo ignora spese
        // già pianificate dall'utente.
        List<ExpenseReminder> reminders = new ArrayList<>();
        Map<UUID, BigDecimal> reminderAmounts = new HashMap<>();
        for (ExpenseReminder reminder : expenseReminderRepository.findByUserIdAndActiveTrue(userId)) {
            if (reminder.getCategory() == null) {
                continue;
            }
            BigDecimal amount = resolveReminderAmount(userId, reminder);
            if (amount == null) {
                continue; // nessun prezzo né storico da cui stimarlo: non prevedibile
            }
            categoryLookup.putIfAbsent(reminder.getCategory().getId(), reminder.getCategory());
            reminders.add(reminder);
            reminderAmounts.put(reminder.getId(), amount);
        }

        // Finestra storica per la media delle variabili: di nuovo l'unione delle due
        // letture, che poi ritagliano la loro.
        LocalDate windowStart = earliest(
                SalaryPeriods.periodStart(currentPeriod.minusMonths(VARIABLE_AVERAGE_WINDOW_PERIODS), salaryDay),
                currentMonth.minusMonths(VARIABLE_AVERAGE_WINDOW_PERIODS).atDay(1));
        LocalDate windowEnd = latest(
                SalaryPeriods.periodStart(currentPeriod, salaryDay).minusDays(1),
                currentMonth.atDay(1).minusDays(1));
        List<Transaction> historicalWindow = windowEnd.isBefore(windowStart)
                ? List.of()
                : transactionRepository.findByUserIdAndOccurredOnBetween(userId, windowStart, windowEnd);
        historicalWindow.forEach(t -> categoryLookup.putIfAbsent(t.getCategory().getId(), t.getCategory()));

        List<Debt> allDebts = debtRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<DebtPlan> debts = debtPlans(userId, allDebts);
        debts.forEach(d -> categoryLookup.putIfAbsent(d.category().getId(), d.category()));
        // Le categorie di TUTTI i debiti, non solo di quelli con una rata: la
        // categoria di un debito ospita i suoi pagamenti, che non sono spese
        // variabili da proiettare nel futuro come media.
        Set<UUID> debtCategoryIds = allDebts.stream()
                .map(d -> d.getCategory().getId())
                .collect(Collectors.toSet());

        Inputs inputs = new Inputs(today, checkpointBalance, actualSinceCheckpoint, activeRules, overridesByRule,
                reminders, reminderAmounts, historicalWindow, debts, debtCategoryIds, categoryLookup, new HashMap<>());

        Built byPeriod = build(inputs, salaryDay, currentPeriod, periods);
        // La card "Saldo previsto a fine mese" vuole il mese di calendario, non il
        // periodo: chi la guarda vuole sapere quanti soldi avrà il 30, non il giorno
        // prima del prossimo stipendio. Stesso calcolo, raggruppato per mese —
        // esattamente ciò che si ottiene ignorando il giorno di accredito.
        PeriodForecast currentMonthForecast = build(inputs, null, currentMonth, 1).buckets().get(0);

        return new ForecastResponse(
                checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(null),
                checkpointBalance,
                currentBalance,
                byPeriod.buckets(),
                currentMonthForecast,
                byPeriod.variableExpenseAverage(),
                byPeriod.historyPeriods()
        );
    }

    /**
     * La previsione vera e propria, su dati già letti.
     *
     * <p>{@code basisDay} decide il raggruppamento: il giorno di accredito dell'utente
     * per la lettura a periodi, {@code null} per quella a mesi di calendario — con
     * {@code null} {@link SalaryPeriods} fa coincidere periodo e mese, quindi non serve
     * un secondo calendario e le due letture non possono divergere per sbaglio.
     */
    private Built build(Inputs in, Integer basisDay, YearMonth first, int count) {
        LocalDate today = in.today();
        LocalDate firstStart = SalaryPeriods.periodStart(first, basisDay);
        LocalDate horizonEnd = SalaryPeriods.periodEnd(first.plusMonths(count - 1L), basisDay);

        BigDecimal preHorizonDelta = in.actualSinceCheckpoint().stream()
                .filter(t -> t.getOccurredOn().isBefore(firstStart))
                .map(this::signedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Il taglio superiore serve perché i dati letti coprono l'unione dei due
        // orizzonti: senza, la lettura più corta si porterebbe dentro movimenti oltre
        // la propria fine.
        Map<YearMonth, List<Transaction>> actualByBucket = in.actualSinceCheckpoint().stream()
                .filter(t -> !t.getOccurredOn().isBefore(firstStart) && !t.getOccurredOn().isAfter(horizonEnd))
                .collect(Collectors.groupingBy(t -> SalaryPeriods.periodOf(t.getOccurredOn(), basisDay)));

        Map<YearMonth, List<Occurrence>> projectedByBucket = new HashMap<>();
        for (RecurringTransaction rule : in.activeRules()) {
            Map<LocalDate, BigDecimal> overrideByDate = in.overridesByRule()
                    .getOrDefault(rule.getId(), List.of()).stream()
                    .collect(Collectors.toMap(RecurringOverride::getOccurrenceDate, RecurringOverride::getOverrideAmount));

            LocalDate cursor = rule.getNextDueDate();
            while (!cursor.isAfter(horizonEnd) && rule.isCurrentlyActive(cursor)) {
                if (cursor.isAfter(today)) {
                    BigDecimal amount = overrideByDate.getOrDefault(cursor, rule.getDefaultAmount());
                    projectedByBucket.computeIfAbsent(SalaryPeriods.periodOf(cursor, basisDay), k -> new ArrayList<>())
                            .add(new Occurrence(rule.getCategory(), amount));
                }
                cursor = rule.addInterval(cursor);
            }
        }

        Map<YearMonth, List<Occurrence>> reminderByBucket = new HashMap<>();
        for (ExpenseReminder reminder : in.reminders()) {
            BigDecimal amount = in.reminderAmounts().get(reminder.getId());
            LocalDate cursor = reminder.getNextDueDate();
            while (!cursor.isAfter(horizonEnd) && reminder.isCurrentlyActive(cursor)) {
                if (!alreadyMaterialised(in, reminder, cursor)) {
                    reminderByBucket.computeIfAbsent(SalaryPeriods.periodOf(cursor, basisDay), k -> new ArrayList<>())
                            .add(new Occurrence(reminder.getCategory(), amount));
                }
                cursor = reminder.addInterval(cursor);
            }
        }

        // Media mobile per categoria sulle spese/entrate non ricorrenti degli ultimi
        // intervalli conclusi, fino a VARIABLE_AVERAGE_WINDOW_PERIODS. Si applica solo
        // agli intervalli futuri interi: quello in corso è già coperto dall'effettivo
        // parziale.
        LocalDate windowStart = SalaryPeriods.periodStart(first.minusMonths(VARIABLE_AVERAGE_WINDOW_PERIODS), basisDay);
        LocalDate windowEnd = firstStart.minusDays(1);
        List<Transaction> window = in.historicalWindow().stream()
                .filter(t -> !t.getOccurredOn().isBefore(windowStart) && !t.getOccurredOn().isAfter(windowEnd))
                .toList();

        // Il divisore sono i periodi di storico che esistono davvero, dal periodo della
        // transazione più vecchia della finestra a quello prima dell'attuale. Divideva
        // sempre per sei: con due mesi di dati le spese future valevano un terzo del
        // reale, lo stipendio (una regola ricorrente) contava per intero, e la curva
        // saliva senza fine.
        //
        // La più vecchia si cerca fra TUTTE le transazioni, prima del filtro sulle
        // variabili: conta da quando ci sono dati, non da quando ci sono spese
        // variabili. E dentro la finestra, non dalla registrazione: chi importa un anno
        // di estratti conto il primo giorno ha davvero sei periodi di storico.
        int historyPeriods = window.stream()
                .map(Transaction::getOccurredOn)
                .min(LocalDate::compareTo)
                .map(oldest -> (int) SalaryPeriods.periodOf(oldest, basisDay).until(first, ChronoUnit.MONTHS))
                .map(n -> Math.min(Math.max(n, 0), VARIABLE_AVERAGE_WINDOW_PERIODS))
                .orElse(0);

        // Si escludono le occorrenze delle regole ricorrenti e dei promemoria, e i
        // pagamenti dei debiti: sono tutti già previsti esplicitamente, quindi lasciarli
        // anche nella media li conterebbe due volte.
        Map<UUID, BigDecimal> variableAverageByCategory = historyPeriods == 0
                ? Map.of()
                : window.stream()
                        .filter(t -> t.getRecurringTransaction() == null && t.getExpenseReminder() == null)
                        .filter(t -> !in.debtCategoryIds().contains(t.getCategory().getId()))
                        .collect(Collectors.groupingBy(
                                t -> t.getCategory().getId(),
                                Collectors.reducing(BigDecimal.ZERO, Transaction::getAmount, BigDecimal::add)))
                        .entrySet().stream()
                        .collect(Collectors.toMap(
                                Map.Entry::getKey,
                                e -> e.getValue().divide(BigDecimal.valueOf(historyPeriods), 2, RoundingMode.HALF_UP)));

        BigDecimal variableExpenseAverage = variableAverageByCategory.entrySet().stream()
                .filter(e -> in.categoryLookup().get(e.getKey()).getType() == CategoryType.EXPENSE)
                .map(Map.Entry::getValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Quanto resta da prevedere per ogni debito: si consuma periodo dopo periodo.
        Map<UUID, BigDecimal> debtLeft = new HashMap<>();
        in.debts().forEach(d -> debtLeft.put(d.category().getId(), d.remaining()));

        List<PeriodForecast> result = new ArrayList<>();
        BigDecimal runningBalance = in.checkpointBalance().add(preHorizonDelta);

        for (int i = 0; i < count; i++) {
            YearMonth bucket = first.plusMonths(i);
            boolean isCurrent = bucket.equals(first);

            Map<UUID, BigDecimal> breakdown = new LinkedHashMap<>();
            BigDecimal income = BigDecimal.ZERO;
            BigDecimal expense = BigDecimal.ZERO;

            // Transazioni già registrate che cadono qui dentro: nell'intervallo in corso
            // sono quelle passate, nei successivi quelle inserite con data futura.
            for (Transaction t : actualByBucket.getOrDefault(bucket, List.of())) {
                breakdown.merge(t.getCategory().getId(), t.getAmount(), BigDecimal::add);
                if (t.getType() == TransactionType.INCOME) {
                    income = income.add(t.getAmount());
                } else {
                    expense = expense.add(t.getAmount());
                }
            }

            for (Occurrence occurrence : reminderByBucket.getOrDefault(bucket, List.of())) {
                breakdown.merge(occurrence.category().getId(), occurrence.amount(), BigDecimal::add);
                if (occurrence.category().getType() == CategoryType.INCOME) {
                    income = income.add(occurrence.amount());
                } else {
                    expense = expense.add(occurrence.amount());
                }
            }

            for (Occurrence occurrence : projectedByBucket.getOrDefault(bucket, List.of())) {
                breakdown.merge(occurrence.category().getId(), occurrence.amount(), BigDecimal::add);
                if (occurrence.category().getType() == CategoryType.INCOME) {
                    income = income.add(occurrence.amount());
                } else {
                    expense = expense.add(occurrence.amount());
                }
            }

            if (!isCurrent) {
                for (Map.Entry<UUID, BigDecimal> entry : variableAverageByCategory.entrySet()) {
                    Category category = in.categoryLookup().get(entry.getKey());
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

                // Le rate dei debiti: una per periodo futuro, finché il residuo non è
                // finito, e l'ultima può essere parziale. Una rata già registrata qui con
                // data futura è già dentro come spesa reale ed è già fuori dal residuo
                // (lo calcola DebtResponse sommando tutti i pagamenti): si aggiunge solo
                // la parte che manca, per non contarla due volte.
                for (DebtPlan debt : in.debts()) {
                    UUID categoryId = debt.category().getId();
                    BigDecimal left = debtLeft.get(categoryId);
                    if (left.signum() <= 0) {
                        continue;
                    }
                    BigDecimal alreadyHere = actualByBucket.getOrDefault(bucket, List.of()).stream()
                            .filter(t -> t.getType() == TransactionType.EXPENSE && t.getCategory().getId().equals(categoryId))
                            .map(Transaction::getAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal instalment = debt.monthlyPayment().min(left).subtract(alreadyHere).max(BigDecimal.ZERO);
                    if (instalment.signum() == 0) {
                        continue;
                    }
                    debtLeft.put(categoryId, left.subtract(instalment));
                    breakdown.merge(categoryId, instalment, BigDecimal::add);
                    expense = expense.add(instalment);
                }
            }

            BigDecimal netBalance = income.subtract(expense);
            runningBalance = runningBalance.add(netBalance);

            List<CategoryAmount> categoryAmounts = breakdown.entrySet().stream()
                    .map(e -> {
                        Category c = in.categoryLookup().get(e.getKey());
                        return new CategoryAmount(e.getKey(), c.getName(), c.getIcon(), c.getColor(), c.getType(), e.getValue());
                    })
                    .toList();

            result.add(new PeriodForecast(
                    bucket,
                    SalaryPeriods.periodStart(bucket, basisDay),
                    SalaryPeriods.periodEnd(bucket, basisDay),
                    income, expense, netBalance, runningBalance, categoryAmounts));
        }

        return new Built(result, historyPeriods, variableExpenseAverage);
    }

    /**
     * I debiti che hanno ancora rate da prevedere: una rata mensile impostata e un
     * residuo positivo.
     *
     * <p>Il residuo è quello della pagina Debiti, calcolato con la stessa regola
     * ({@link DebtResponse#from}): pagamenti fuori da alreadyPaidAmount solo dopo
     * alreadyPaidAsOf. Non passa da DebtService.list, che sincronizza il flag
     * {@code active} e quindi scrive, mentre la previsione legge soltanto; per lo
     * stesso motivo il filtro è sul residuo calcolato e non su quel flag, che si
     * aggiorna solo quando si apre la pagina Debiti.
     */
    private List<DebtPlan> debtPlans(UUID userId, List<Debt> allDebts) {
        List<Debt> withInstalment = allDebts.stream()
                .filter(d -> d.getMonthlyPaymentAmount() != null && d.getMonthlyPaymentAmount().signum() > 0)
                .toList();
        if (withInstalment.isEmpty()) {
            return List.of();
        }

        // Una query sola per i pagamenti di tutti i debiti, invece di una per debito.
        Map<UUID, List<Transaction>> paymentsByCategory = transactionRepository
                .findByUserIdAndCategoryIdInAndType(
                        userId,
                        withInstalment.stream().map(d -> d.getCategory().getId()).toList(),
                        TransactionType.EXPENSE)
                .stream()
                .collect(Collectors.groupingBy(t -> t.getCategory().getId()));

        List<DebtPlan> plans = new ArrayList<>();
        for (Debt debt : withInstalment) {
            BigDecimal paidFromTransactions = paymentsByCategory
                    .getOrDefault(debt.getCategory().getId(), List.of()).stream()
                    .filter(t -> debt.getAlreadyPaidAsOf() == null || t.getOccurredOn().isAfter(debt.getAlreadyPaidAsOf()))
                    .map(Transaction::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal remaining = DebtResponse.from(debt, paidFromTransactions).remainingAmount();
            if (remaining.signum() > 0) {
                plans.add(new DebtPlan(debt.getCategory(), debt.getMonthlyPaymentAmount(), remaining));
            }
        }
        return plans;
    }

    /**
     * Il job che trasforma i promemoria in spese è mensile, quindi il controllo "l'ha
     * già generata?" resta per MESE di calendario anche quando il bucket è un periodo:
     * confondere i due conterebbe la stessa spesa due volte, o la perderebbe. È lo
     * stesso controllo usato dal job (ExpenseReminderGenerationService).
     *
     * <p>La risposta è memorizzata perché le due letture — a periodi e a mesi —
     * ripercorrono gli stessi promemoria negli stessi mesi.
     */
    private boolean alreadyMaterialised(Inputs in, ExpenseReminder reminder, LocalDate occurrenceDate) {
        YearMonth calendarMonth = YearMonth.from(occurrenceDate);
        return in.materialisedMemo().computeIfAbsent(
                new ReminderMonth(reminder.getId(), calendarMonth),
                key -> transactionRepository.existsByExpenseReminderIdAndOccurredOnBetween(
                        key.reminderId(), key.month().atDay(1), key.month().atEndOfMonth()));
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

    private static LocalDate earliest(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }

    private static LocalDate latest(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private BigDecimal signedAmount(Transaction transaction) {
        return transaction.getType() == TransactionType.EXPENSE
                ? transaction.getAmount().negate()
                : transaction.getAmount();
    }
}
