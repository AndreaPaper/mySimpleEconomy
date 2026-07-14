package com.spesetracker.service;

import com.spesetracker.dto.transaction.TransactionRequest;
import com.spesetracker.dto.transaction.TransactionResponse;
import com.spesetracker.model.Category;
import com.spesetracker.model.Transaction;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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

    private static final int DEFAULT_RECENT_LIMIT = 50;

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    public List<TransactionResponse> list(UUID userId, LocalDate from, LocalDate to, UUID categoryId) {
        List<Transaction> transactions;

        if (from != null && to != null) {
            transactions = (categoryId != null)
                    ? transactionRepository.findByUserIdAndCategoryIdAndOccurredOnBetween(userId, categoryId, from, to)
                    : transactionRepository.findByUserIdAndOccurredOnBetween(userId, from, to);
        } else {
            transactions = transactionRepository.findByUserIdOrderByOccurredOnDesc(
                    userId, PageRequest.of(0, DEFAULT_RECENT_LIMIT));
        }

        return transactions.stream().map(TransactionResponse::from).toList();
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
