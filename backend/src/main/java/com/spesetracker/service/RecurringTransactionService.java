package com.spesetracker.service;

import com.spesetracker.dto.recurring.RecurringOverrideRequest;
import com.spesetracker.dto.recurring.RecurringOverrideResponse;
import com.spesetracker.dto.recurring.RecurringTransactionRequest;
import com.spesetracker.dto.recurring.RecurringTransactionResponse;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringOverride;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringOverrideRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RecurringTransactionService {

    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringOverrideRepository recurringOverrideRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<RecurringTransactionResponse> list(UUID userId) {
        return recurringTransactionRepository.findByUserIdOrderByNextDueDateAsc(userId).stream()
                .map(RecurringTransactionResponse::from)
                .toList();
    }

    @Transactional
    public RecurringTransactionResponse create(UUID userId, RecurringTransactionRequest request) {
        Category category = ownedCategory(userId, request.categoryId());

        RecurringTransaction rt = RecurringTransaction.builder()
                .user(userRepository.getReferenceById(userId))
                .category(category)
                .name(request.name())
                .defaultAmount(request.defaultAmount())
                .intervalUnit(request.intervalUnit())
                .intervalValue(request.intervalValue())
                .startDate(request.startDate())
                .nextDueDate(request.nextDueDate())
                .endDate(request.endDate())
                .build();

        return RecurringTransactionResponse.from(recurringTransactionRepository.save(rt));
    }

    @Transactional
    public RecurringTransactionResponse update(UUID userId, UUID id, RecurringTransactionRequest request) {
        RecurringTransaction rt = findOwned(userId, id);
        Category category = ownedCategory(userId, request.categoryId());

        rt.setCategory(category);
        rt.setName(request.name());
        rt.setDefaultAmount(request.defaultAmount());
        rt.setIntervalUnit(request.intervalUnit());
        rt.setIntervalValue(request.intervalValue());
        rt.setStartDate(request.startDate());
        rt.setNextDueDate(request.nextDueDate());
        rt.setEndDate(request.endDate());

        return RecurringTransactionResponse.from(rt);
    }

    @Transactional
    public void setActive(UUID userId, UUID id, boolean active) {
        findOwned(userId, id).setActive(active);
    }

    public List<RecurringOverrideResponse> listOverrides(UUID userId, UUID recurringTransactionId) {
        findOwned(userId, recurringTransactionId);
        return recurringOverrideRepository.findByRecurringTransactionIdOrderByOccurrenceDateAsc(recurringTransactionId)
                .stream()
                .map(RecurringOverrideResponse::from)
                .toList();
    }

    @Transactional
    public RecurringOverrideResponse createOverride(
            UUID userId, UUID recurringTransactionId, RecurringOverrideRequest request) {
        RecurringTransaction rt = findOwned(userId, recurringTransactionId);

        if (recurringOverrideRepository
                .findByRecurringTransactionIdAndOccurrenceDate(recurringTransactionId, request.occurrenceDate())
                .isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un'eccezione per questa data");
        }

        RecurringOverride override = RecurringOverride.builder()
                .recurringTransaction(rt)
                .occurrenceDate(request.occurrenceDate())
                .overrideAmount(request.overrideAmount())
                .note(request.note())
                .build();

        return RecurringOverrideResponse.from(recurringOverrideRepository.save(override));
    }

    @Transactional
    public void deleteOverride(UUID userId, UUID recurringTransactionId, UUID overrideId) {
        findOwned(userId, recurringTransactionId);

        RecurringOverride override = recurringOverrideRepository.findById(overrideId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Eccezione non trovata"));

        if (!override.getRecurringTransaction().getId().equals(recurringTransactionId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Eccezione non trovata");
        }

        recurringOverrideRepository.delete(override);
    }

    private RecurringTransaction findOwned(UUID userId, UUID id) {
        RecurringTransaction rt = recurringTransactionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transazione ricorrente non trovata"));

        if (!rt.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transazione ricorrente non trovata");
        }

        return rt;
    }

    private Category ownedCategory(UUID userId, UUID categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata"));

        if (!category.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata");
        }

        return category;
    }
}
