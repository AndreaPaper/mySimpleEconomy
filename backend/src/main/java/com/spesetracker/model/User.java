package com.spesetracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(length = 100)
    private String nickname;

    @Column(name = "default_salary_amount")
    private BigDecimal defaultSalaryAmount;

    // Giorno del mese in cui arriva lo stipendio (1-31): ancora il "mese" personale
    // dell'utente, che per lui parte da questo giorno invece che dal 1° del mese.
    @Column(name = "salary_day")
    private Short salaryDay;

    // Chiave di uno degli avatar (animali) offerti dall'app - vedi AvatarCatalog.
    // NULL = nessun avatar scelto, il frontend mostra l'icona utente di default.
    @Column(name = "avatar_key", length = 30)
    private String avatarKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
