package com.spesetracker.repository;

import com.spesetracker.model.BalanceCheckpoint;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BalanceCheckpointRepository extends JpaRepository<BalanceCheckpoint, UUID> {

    // Punto di partenza per il pronostico: l'ultimo checkpoint non successivo a oggi.
    Optional<BalanceCheckpoint> findFirstByUserIdAndCheckpointDateLessThanEqualOrderByCheckpointDateDesc(
            UUID userId, LocalDate date);

    List<BalanceCheckpoint> findByUserIdOrderByCheckpointDateDesc(UUID userId);

    Optional<BalanceCheckpoint> findByUserIdAndCheckpointDate(UUID userId, LocalDate checkpointDate);

    long deleteByUserId(UUID userId);

    long deleteByUserIdAndCheckpointDateBetween(UUID userId, LocalDate from, LocalDate to);
}
