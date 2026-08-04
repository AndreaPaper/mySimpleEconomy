package com.spesetracker.service;

import com.spesetracker.dto.transaction.TransactionPageResponse;
import com.spesetracker.dto.transaction.TransactionRequest;
import com.spesetracker.dto.transaction.TransactionResponse;
import com.spesetracker.model.Category;
import com.spesetracker.model.Transaction;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public TransactionPageResponse list(UUID userId, LocalDate from, LocalDate to, UUID categoryId, int page, int size) {
        if (from != null && to != null) {
            // Intervallo di date: comportamento invariato, elenco completo non
            // paginato (usato da Dashboard/Export, che si aspettano tutto lo storico
            // del periodo, non una pagina).
            List<Transaction> transactions = (categoryId != null)
                    ? transactionRepository.findByUserIdAndCategoryIdAndOccurredOnBetween(userId, categoryId, from, to)
                    : transactionRepository.findByUserIdAndOccurredOnBetween(userId, from, to);

            return new TransactionPageResponse(transactions.stream().map(TransactionResponse::from).toList(), false);
        }

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredOn", "createdAt"));
        Slice<Transaction> slice = (categoryId != null)
                ? transactionRepository.findByUserIdAndCategoryId(userId, categoryId, pageable)
                : transactionRepository.findByUserId(userId, pageable);

        return new TransactionPageResponse(
                slice.getContent().stream().map(TransactionResponse::from).toList(), slice.hasNext());
    }

    @Transactional
    public TransactionResponse create(UUID userId, TransactionRequest request) {
        Category category = ownedCategory(userId, request.categoryId());

        Transaction transaction = Transaction.builder()
                .user(userRepository.getReferenceById(userId))
                .category(category)
                .amount(request.amount())
                .type(request.type())
                .occurredOn(request.occurredOn())
                .description(request.description())
                .build();

        return TransactionResponse.from(transactionRepository.save(transaction));
    }

    @Transactional
    public TransactionResponse update(UUID userId, UUID transactionId, TransactionRequest request) {
        Transaction transaction = findOwned(userId, transactionId);
        Category category = ownedCategory(userId, request.categoryId());

        transaction.setCategory(category);
        transaction.setAmount(request.amount());
        transaction.setType(request.type());
        transaction.setOccurredOn(request.occurredOn());
        transaction.setDescription(request.description());

        return TransactionResponse.from(transaction);
    }

    @Transactional
    public void delete(UUID userId, UUID transactionId) {
        Transaction transaction = findOwned(userId, transactionId);
        transactionRepository.delete(transaction);
    }

    private Transaction findOwned(UUID userId, UUID transactionId) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transazione non trovata"));

        if (!transaction.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transazione non trovata");
        }

        return transaction;
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
