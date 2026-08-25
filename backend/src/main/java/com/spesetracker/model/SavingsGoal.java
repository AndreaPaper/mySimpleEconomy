package com.spesetracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Obiettivo di risparmio. Il caso d'uso principale resta un unico salvadanaio
// ("Risparmio generico", senza traguardo), ma il modello supporta più obiettivi
// fin da subito (es. "Vacanza Giappone" con un importo target).
@Entity
@Table(
        name = "savings_goals",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "name"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavingsGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String name;

    // NULL per il risparmio generico, che non ha un traguardo da raggiungere.
    @Column(name = "target_amount")
    private BigDecimal targetAmount;

    private LocalDate deadline;

    @Column(length = 50)
    private String icon;

    @Column(length = 7)
    private String color;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
