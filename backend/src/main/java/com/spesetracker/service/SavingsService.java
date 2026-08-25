package com.spesetracker.service;

import com.spesetracker.dto.savings.SavingsGoalRequest;
import com.spesetracker.dto.savings.SavingsGoalResponse;
import com.spesetracker.dto.savings.SavingsTransactionRequest;
import com.spesetracker.dto.savings.SavingsTransactionResponse;
import com.spesetracker.model.SavingsGoal;
import com.spesetracker.model.SavingsTransaction;
import com.spesetracker.repository.SavingsGoalRepository;
import com.spesetracker.repository.SavingsTransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SavingsService {

    private final SavingsGoalRepository goalRepository;
    private final SavingsTransactionRepository movementRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<SavingsGoalResponse> listGoals(UUID userId) {
        // Un'unica query sui movimenti dell'utente, poi il saldo di ogni
        // obiettivo si ricava in memoria: evita una query per obiettivo.
        Map<UUID, BigDecimal> balances = movementRepository.findByGoalUserIdOrderByOccurredOnDescCreatedAtDesc(userId)
                .stream()
                .collect(Collectors.groupingBy(
                        m -> m.getGoal().getId(),
                        Collectors.reducing(BigDecimal.ZERO, SavingsTransaction::getAmount, BigDecimal::add)));

        return goalRepository.findByUserIdOrderByCreatedAtAsc(userId).stream()
                .map(goal -> SavingsGoalResponse.from(goal, balances.getOrDefault(goal.getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public SavingsGoalResponse createGoal(UUID userId, SavingsGoalRequest request) {
        if (goalRepository.existsByUserIdAndNameIgnoreCase(userId, request.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un obiettivo con questo nome");
        }

        SavingsGoal goal = SavingsGoal.builder()
                .user(userRepository.getReferenceById(userId))
                .name(request.name())
                .targetAmount(request.targetAmount())
                .deadline(request.deadline())
                .icon(request.icon())
                .color(request.color())
                .build();

        return SavingsGoalResponse.from(goalRepository.save(goal), BigDecimal.ZERO);
    }

    @Transactional
    public SavingsGoalResponse updateGoal(UUID userId, UUID goalId, SavingsGoalRequest request) {
        SavingsGoal goal = findOwnedGoal(userId, goalId);

        if (!goal.getName().equalsIgnoreCase(request.name())
                && goalRepository.existsByUserIdAndNameIgnoreCase(userId, request.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un obiettivo con questo nome");
        }

        goal.setName(request.name());
        goal.setTargetAmount(request.targetAmount());
        goal.setDeadline(request.deadline());
        goal.setIcon(request.icon());
        goal.setColor(request.color());

        return SavingsGoalResponse.from(goal, currentAmount(goalId));
    }

    // Elimina anche i movimenti dell'obiettivo (ON DELETE CASCADE): è
    // un'operazione distruttiva e la UI la fa confermare.
    @Transactional
    public void deleteGoal(UUID userId, UUID goalId) {
        goalRepository.delete(findOwnedGoal(userId, goalId));
    }

    @Transactional(readOnly = true)
    public List<SavingsTransactionResponse> listMovements(UUID userId) {
        return movementRepository.findByGoalUserIdOrderByOccurredOnDescCreatedAtDesc(userId).stream()
                .map(SavingsTransactionResponse::from)
                .toList();
    }

    @Transactional
    public SavingsTransactionResponse createMovement(UUID userId, SavingsTransactionRequest request) {
        SavingsGoal goal = findOwnedGoal(userId, request.goalId());

        if (request.amount().signum() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "L'importo del movimento non può essere zero");
        }

        SavingsTransaction movement = SavingsTransaction.builder()
                .goal(goal)
                .amount(request.amount())
                .occurredOn(request.occurredOn())
                .note(request.note())
                .build();

        return SavingsTransactionResponse.from(movementRepository.save(movement));
    }

    @Transactional
    public void deleteMovement(UUID userId, UUID movementId) {
        SavingsTransaction movement = movementRepository.findById(movementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimento non trovato"));

        if (!movement.getGoal().getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimento non trovato");
        }

        movementRepository.delete(movement);
    }

    private BigDecimal currentAmount(UUID goalId) {
        return movementRepository.findByGoalId(goalId).stream()
                .map(SavingsTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private SavingsGoal findOwnedGoal(UUID userId, UUID goalId) {
        SavingsGoal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Obiettivo non trovato"));

        if (!goal.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Obiettivo non trovato");
        }

        return goal;
    }
}
