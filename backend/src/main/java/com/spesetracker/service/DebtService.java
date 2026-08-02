package com.spesetracker.service;

import com.spesetracker.dto.debt.DebtRequest;
import com.spesetracker.dto.debt.DebtResponse;
import com.spesetracker.model.Category;
import com.spesetracker.model.Debt;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.DebtRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DebtService {

    private final DebtRepository debtRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    @Transactional
    public List<DebtResponse> list(UUID userId) {
        return debtRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toResponseAndSyncActive)
                .toList();
    }

    @Transactional
    public DebtResponse create(UUID userId, DebtRequest request) {
        Category category = ownedExpenseCategory(userId, request.categoryId());
        ensureCategoryFree(category.getId(), null);
        BigDecimal alreadyPaidAmount = validatedAlreadyPaidAmount(request);

        Debt debt = Debt.builder()
                .user(userRepository.getReferenceById(userId))
                .category(category)
                .name(request.name())
                .totalAmount(request.totalAmount())
                .alreadyPaidAmount(alreadyPaidAmount)
                .alreadyPaidAsOf(alreadyPaidAmount.compareTo(BigDecimal.ZERO) > 0 ? request.alreadyPaidAsOf() : null)
                .monthlyPaymentAmount(request.monthlyPaymentAmount())
                .build();

        return toResponseAndSyncActive(debtRepository.save(debt));
    }

    @Transactional
    public DebtResponse update(UUID userId, UUID id, DebtRequest request) {
        Debt debt = findOwned(userId, id);
        Category category = ownedExpenseCategory(userId, request.categoryId());
        ensureCategoryFree(category.getId(), debt.getId());
        BigDecimal alreadyPaidAmount = validatedAlreadyPaidAmount(request);

        debt.setCategory(category);
        debt.setName(request.name());
        debt.setTotalAmount(request.totalAmount());
        debt.setAlreadyPaidAmount(alreadyPaidAmount);
        debt.setAlreadyPaidAsOf(alreadyPaidAmount.compareTo(BigDecimal.ZERO) > 0 ? request.alreadyPaidAsOf() : null);
        debt.setMonthlyPaymentAmount(request.monthlyPaymentAmount());

        return toResponseAndSyncActive(debt);
    }

    // Se è impostato un importo già pagato, serve anche la data di riferimento,
    // altrimenti le transazioni storiche della categoria rischiano di essere
    // sommate di nuovo sopra un totale che probabilmente le include già.
    private BigDecimal validatedAlreadyPaidAmount(DebtRequest request) {
        BigDecimal alreadyPaidAmount = request.alreadyPaidAmount() != null ? request.alreadyPaidAmount() : BigDecimal.ZERO;
        if (alreadyPaidAmount.compareTo(BigDecimal.ZERO) > 0 && request.alreadyPaidAsOf() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Indica da quale data in poi le spese vanno conteggiate separatamente dal già pagato");
        }
        return alreadyPaidAmount;
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Debt debt = findOwned(userId, id);
        debtRepository.delete(debt);
    }

    private DebtResponse toResponseAndSyncActive(Debt debt) {
        BigDecimal paidFromTransactions = transactionRepository
                .findByUserIdAndCategoryIdAndType(debt.getUser().getId(), debt.getCategory().getId(), TransactionType.EXPENSE)
                .stream()
                // Le transazioni fino ad alreadyPaidAsOf (compreso) si considerano già
                // incluse in alreadyPaidAmount, per non contarle due volte.
                .filter(t -> debt.getAlreadyPaidAsOf() == null || t.getOccurredOn().isAfter(debt.getAlreadyPaidAsOf()))
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        DebtResponse response = DebtResponse.from(debt, paidFromTransactions);

        // Un debito saldato libera la categoria per un eventuale nuovo debito;
        // se invece il residuo torna positivo (es. transazione cancellata),
        // torna attivo. Nessuna azione manuale richiesta.
        boolean shouldBeActive = response.remainingAmount().compareTo(BigDecimal.ZERO) > 0;
        if (!Boolean.valueOf(shouldBeActive).equals(debt.getActive())) {
            debt.setActive(shouldBeActive);
            response = DebtResponse.from(debt, paidFromTransactions);
        }

        return response;
    }

    private Debt findOwned(UUID userId, UUID id) {
        return debtRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Debito non trovato"));
    }

    private Category ownedExpenseCategory(UUID userId, UUID categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata"));

        if (!category.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata");
        }
        if (category.getType() != CategoryType.EXPENSE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La categoria di un debito deve essere di tipo uscita");
        }

        return category;
    }

    // Un debito attivo per categoria: se ce n'è già uno diverso da quello che
    // stiamo salvando, blocca (vedi anche idx_debts_active_category sul DB).
    private void ensureCategoryFree(UUID categoryId, UUID currentDebtId) {
        debtRepository.findByCategoryIdAndActiveTrue(categoryId).ifPresent(existing -> {
            if (!existing.getId().equals(currentDebtId)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "Questa categoria è già collegata a un altro debito attivo");
            }
        });
    }
}
