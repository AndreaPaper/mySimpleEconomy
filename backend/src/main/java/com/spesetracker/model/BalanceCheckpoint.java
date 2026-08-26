package com.spesetracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(
        name = "balance_checkpoints",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "checkpoint_date"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BalanceCheckpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "checkpoint_date", nullable = false)
    private LocalDate checkpointDate;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal balance;

    // Istante da cui contare le transazioni datate nel giorno del saldo.
    // Null = saldo a inizio giornata, quindi contano tutte (i saldi importati
    // da Excel sono "SALDO INIZIO MESE" e restano cosi').
    @Column(name = "counts_from")
    private Instant countsFrom;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
