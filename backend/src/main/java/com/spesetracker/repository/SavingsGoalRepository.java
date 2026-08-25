package com.spesetracker.repository;

import com.spesetracker.model.SavingsGoal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SavingsGoalRepository extends JpaRepository<SavingsGoal, UUID> {

    List<SavingsGoal> findByUserIdOrderByCreatedAtAsc(UUID userId);

    boolean existsByUserIdAndNameIgnoreCase(UUID userId, String name);
}
