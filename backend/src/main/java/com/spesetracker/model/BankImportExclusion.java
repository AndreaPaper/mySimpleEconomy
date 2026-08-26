package com.spesetracker.model;

import com.spesetracker.model.enums.BankSource;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

// Riga da non importare mai, riconosciuta dal testo del movimento.
@Entity
@Table(
        name = "bank_import_exclusions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "source", "pattern"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankImportExclusion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private BankSource source;

    // Sottostringa cercata in "Operazione + Dettagli", senza distinzione di
    // maiuscole. Volutamente non è un'espressione regolare: la scrive l'utente.
    @Column(nullable = false, length = 200)
    private String pattern;

    @Column(length = 200)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
