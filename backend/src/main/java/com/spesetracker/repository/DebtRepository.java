package com.spesetracker.repository;

import com.spesetracker.model.Debt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DebtRepository extends JpaRepository<Debt, UUID> {

    List<Debt> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Debt> findByIdAndUserId(UUID id, UUID userId);

    Optional<Debt> findByCategoryIdAndActiveTrue(UUID categoryId);
}
