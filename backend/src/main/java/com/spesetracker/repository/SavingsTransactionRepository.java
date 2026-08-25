package com.spesetracker.repository;

import com.spesetracker.model.SavingsTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SavingsTransactionRepository extends JpaRepository<SavingsTransaction, UUID> {

    List<SavingsTransaction> findByGoalUserIdOrderByOccurredOnDescCreatedAtDesc(UUID userId);

    List<SavingsTransaction> findByGoalId(UUID goalId);
}
