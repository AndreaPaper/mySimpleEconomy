package com.spesetracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Movimento di risparmio: importo positivo = accantonamento, negativo =
// prelievo. Tenuto separato da Transaction perché un accantonamento non è né
// una spesa né un'entrata e non deve entrare nei totali di spesa del periodo.
// Si conserva lo storico dei movimenti, non solo il saldo, per poter
// ricostruire l'andamento nel tempo.
@Entity
@Table(name = "savings_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavingsTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "goal_id", nullable = false)
    private SavingsGoal goal;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    @Column(length = 255)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
