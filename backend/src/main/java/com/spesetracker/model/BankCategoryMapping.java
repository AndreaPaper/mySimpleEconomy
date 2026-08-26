package com.spesetracker.model;

import com.spesetracker.model.enums.BankSource;
import com.spesetracker.model.enums.TransactionType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

// A quale categoria dell'utente corrisponde una categoria della banca. Si
// compila una volta e vale per tutti gli import successivi.
@Entity
@Table(
        name = "bank_category_mappings",
        uniqueConstraints = @UniqueConstraint(
                columnNames = {"user_id", "source", "bank_category", "transaction_type"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankCategoryMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private BankSource source;

    @Column(name = "bank_category", nullable = false, length = 120)
    private String bankCategory;

    // Il tipo fa parte della chiave: la stessa categoria della banca può
    // comparire in uscita e in entrata (un rimborso) e finire su due categorie
    // diverse dell'utente.
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "transaction_type", nullable = false, length = 20)
    private TransactionType transactionType;

    // Null = "non importare": la riga viene scartata invece di diventare una
    // transazione.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
    }
}
