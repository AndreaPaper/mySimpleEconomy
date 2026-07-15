package com.spesetracker.service.excelimport;

import com.spesetracker.dto.excelimport.*;
import com.spesetracker.job.RecurringTransactionGenerationService;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

// Persiste una ExcelImportCommitRequest già risolta (ogni elemento ha una categoria
// assegnata, esistente o da creare). Le regole ricorrenti vengono "recuperate" subito
// tramite RecurringTransactionGenerationService, così lo storico è visibile subito
// invece di aspettare il prossimo giro del job schedulato.
@Service
@RequiredArgsConstructor
public class ExcelImportCommitService {

    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final TransactionRepository transactionRepository;
    private final BalanceCheckpointRepository balanceCheckpointRepository;
    private final RecurringTransactionGenerationService generationService;

    @Transactional
    public ExcelImportResult commit(UUID userId, ExcelImportCommitRequest request) {
        validateEveryItemHasCategory(request);

        Map<String, UUID> tempIdToCategoryId = createCategories(userId, request.newCategorySuggestions());

        int recurringCreated = 0;
        for (RecurringImportItem item : request.recurringTransactions()) {
            UUID categoryId = resolveCategoryId(item.existingCategoryId(), item.newCategoryTempId(), tempIdToCategoryId);
            Category category = categoryRepository.getReferenceById(categoryId);

            RecurringTransaction rule = RecurringTransaction.builder()
                    .user(userRepository.getReferenceById(userId))
                    .category(category)
                    .name(item.name())
                    .defaultAmount(item.amount())
                    .intervalUnit(IntervalUnit.MONTH)
                    .intervalValue((short) 1)
                    .startDate(item.startDate())
                    .nextDueDate(item.startDate())
                    .build();
            recurringTransactionRepository.save(rule);
            generationService.processDueRule(rule.getId(), LocalDate.now());
            recurringCreated++;
        }

        int oneOffCreated = 0;
        for (OneOffImportItem item : request.oneOffTransactions()) {
            UUID categoryId = resolveCategoryId(item.existingCategoryId(), item.newCategoryTempId(), tempIdToCategoryId);
            Category category = categoryRepository.getReferenceById(categoryId);

            Transaction transaction = Transaction.builder()
                    .user(userRepository.getReferenceById(userId))
                    .category(category)
                    .amount(item.amount())
                    .type(com.spesetracker.model.enums.TransactionType.valueOf(category.getType().name()))
                    .occurredOn(item.occurredOn())
                    .description(item.name())
                    .build();
            transactionRepository.save(transaction);
            oneOffCreated++;
        }

        for (BalanceCheckpointImportItem checkpoint : request.balanceCheckpoints()) {
            upsertCheckpoint(userId, checkpoint);
        }

        int backfilledCount = request.recurringTransactions().isEmpty()
                ? 0
                : recurringTransactionRepository.findByUserIdOrderByNextDueDateAsc(userId).stream()
                        .mapToInt(rt -> (int) transactionRepository.countByRecurringTransactionId(rt.getId()))
                        .sum();

        return new ExcelImportResult(
                tempIdToCategoryId.size(), recurringCreated, oneOffCreated + backfilledCount,
                request.balanceCheckpoints().size());
    }

    private void validateEveryItemHasCategory(ExcelImportCommitRequest request) {
        boolean anyUnresolved = request.recurringTransactions().stream().anyMatch(i -> !i.hasCategoryResolved())
                || request.oneOffTransactions().stream().anyMatch(i -> !i.hasCategoryResolved());
        if (anyUnresolved) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ogni transazione deve avere una categoria assegnata prima di confermare l'importazione");
        }
    }

    private Map<String, UUID> createCategories(UUID userId, java.util.List<CategorySuggestion> suggestions) {
        Map<String, UUID> tempIdToId = new HashMap<>();
        for (CategorySuggestion suggestion : suggestions) {
            Category category = categoryRepository.findByUserIdAndNameIgnoreCase(userId, suggestion.name())
                    .orElseGet(() -> categoryRepository.save(Category.builder()
                            .user(userRepository.getReferenceById(userId))
                            .name(suggestion.name())
                            .type(suggestion.type())
                            .color(suggestion.color())
                            .build()));
            tempIdToId.put(suggestion.tempId(), category.getId());
        }
        return tempIdToId;
    }

    private UUID resolveCategoryId(UUID existingCategoryId, String newCategoryTempId, Map<String, UUID> tempIdToCategoryId) {
        if (existingCategoryId != null) {
            return existingCategoryId;
        }
        UUID resolved = tempIdToCategoryId.get(newCategoryTempId);
        if (resolved == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Riferimento a categoria sconosciuto: " + newCategoryTempId);
        }
        return resolved;
    }

    private void upsertCheckpoint(UUID userId, BalanceCheckpointImportItem item) {
        BalanceCheckpoint checkpoint = balanceCheckpointRepository
                .findByUserIdAndCheckpointDate(userId, item.checkpointDate())
                .orElseGet(() -> BalanceCheckpoint.builder()
                        .user(userRepository.getReferenceById(userId))
                        .checkpointDate(item.checkpointDate())
                        .build());
        checkpoint.setBalance(item.balance());
        balanceCheckpointRepository.save(checkpoint);
    }
}
