package com.spesetracker.service;

import com.spesetracker.dto.reminder.ExpenseReminderOccurrence;
import com.spesetracker.dto.reminder.ExpenseReminderRequest;
import com.spesetracker.dto.reminder.ExpenseReminderResponse;
import com.spesetracker.dto.reminder.MonthlyReminders;
import com.spesetracker.dto.reminder.UpcomingRemindersResponse;
import com.spesetracker.model.Category;
import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExpenseReminderService {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<ExpenseReminderResponse> list(UUID userId) {
        return expenseReminderRepository.findByUserIdOrderByNextDueDateAsc(userId).stream()
                .map(ExpenseReminderResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseReminderResponse create(UUID userId, ExpenseReminderRequest request) {
        Category category = ownedExpenseCategory(userId, request.categoryId());

        ExpenseReminder reminder = ExpenseReminder.builder()
                .user(userRepository.getReferenceById(userId))
                .category(category)
                .name(request.name())
                .amount(request.amount())
                .intervalUnit(request.intervalUnit())
                .intervalValue(request.intervalValue())
                .startDate(request.startDate())
                .nextDueDate(request.nextDueDate())
                .endDate(request.endDate())
                .notifyDaysBefore(request.notifyDaysBefore())
                .build();

        return ExpenseReminderResponse.from(expenseReminderRepository.save(reminder));
    }

    @Transactional
    public ExpenseReminderResponse update(UUID userId, UUID id, ExpenseReminderRequest request) {
        ExpenseReminder reminder = findOwned(userId, id);
        Category category = ownedExpenseCategory(userId, request.categoryId());

        reminder.setCategory(category);
        reminder.setName(request.name());
        reminder.setAmount(request.amount());
        reminder.setIntervalUnit(request.intervalUnit());
        reminder.setIntervalValue(request.intervalValue());
        reminder.setStartDate(request.startDate());
        reminder.setNextDueDate(request.nextDueDate());
        reminder.setEndDate(request.endDate());
        reminder.setNotifyDaysBefore(request.notifyDaysBefore());

        return ExpenseReminderResponse.from(reminder);
    }

    private Category ownedExpenseCategory(UUID userId, UUID categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata"));

        if (!category.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata");
        }
        if (category.getType() != CategoryType.EXPENSE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La categoria di un promemoria deve essere di tipo uscita");
        }

        return category;
    }

    @Transactional
    public void setActive(UUID userId, UUID id, boolean active) {
        findOwned(userId, id).setActive(active);
    }

    private record ResolvedAmount(BigDecimal amount, boolean estimated) {
    }

    @Transactional(readOnly = true)
    public UpcomingRemindersResponse getUpcoming(UUID userId, int months) {
        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.from(today);
        LocalDate horizonEndDate = currentMonth.plusMonths(months - 1L).atEndOfMonth();

        List<ExpenseReminder> activeReminders = expenseReminderRepository.findByUserIdAndActiveTrue(userId);

        // Una sola risoluzione per promemoria, anche se ha più occorrenze nell'orizzonte.
        Map<UUID, ResolvedAmount> amountCache = new HashMap<>();

        Map<YearMonth, List<ExpenseReminderOccurrence>> byMonth = new HashMap<>();
        for (ExpenseReminder reminder : activeReminders) {
            ResolvedAmount resolved = amountCache.computeIfAbsent(
                    reminder.getId(), id -> resolveDisplayAmount(userId, reminder));

            LocalDate cursor = reminder.getNextDueDate();
            while (!cursor.isAfter(horizonEndDate) && reminder.isCurrentlyActive(cursor)) {
                byMonth.computeIfAbsent(YearMonth.from(cursor), k -> new ArrayList<>())
                        .add(new ExpenseReminderOccurrence(
                                reminder.getId(), reminder.getName(), cursor, resolved.amount(), resolved.estimated()));
                cursor = reminder.addInterval(cursor);
            }
        }

        List<MonthlyReminders> monthlyReminders = new ArrayList<>();
        for (int i = 0; i < months; i++) {
            YearMonth ym = currentMonth.plusMonths(i);
            List<ExpenseReminderOccurrence> occurrences = byMonth.getOrDefault(ym, List.of()).stream()
                    .sorted((a, b) -> a.date().compareTo(b.date()))
                    .toList();
            monthlyReminders.add(new MonthlyReminders(ym, occurrences));
        }

        return new UpcomingRemindersResponse(monthlyReminders);
    }

    // Prezzo impostato sul promemoria se presente; altrimenti l'ultima spesa
    // registrata nella sua categoria, marcata come stima. Nessuno dei due se
    // il promemoria non ha ancora una categoria assegnata.
    private ResolvedAmount resolveDisplayAmount(UUID userId, ExpenseReminder reminder) {
        if (reminder.getAmount() != null) {
            return new ResolvedAmount(reminder.getAmount(), false);
        }
        if (reminder.getCategory() == null) {
            return new ResolvedAmount(null, false);
        }

        BigDecimal lastExpense = transactionRepository
                .findFirstByUserIdAndCategoryIdAndTypeOrderByOccurredOnDesc(
                        userId, reminder.getCategory().getId(), TransactionType.EXPENSE)
                .map(Transaction::getAmount)
                .orElse(null);

        return new ResolvedAmount(lastExpense, lastExpense != null);
    }

    private ExpenseReminder findOwned(UUID userId, UUID id) {
        ExpenseReminder reminder = expenseReminderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Promemoria non trovato"));

        if (!reminder.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Promemoria non trovato");
        }

        return reminder;
    }
}
